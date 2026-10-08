// ============================================================
// Legendas e textos da exportação: o MESMO libass da prévia (JASSUB),
// agora pedido quadro a quadro.
//
// O JASSUB desenha num canvas do worker dele (WebGL), e o quadro chega
// ao canvas da página um ciclo de tarefas depois de o desenho terminar
// -- medido: logo após o `manualRender` a página ainda mostra o quadro
// anterior; um ciclo depois, já o novo. Pedir a imagem de volta ao
// worker não serve: o WebGL de lá limpa o quadro no fim de cada tarefa.
//
// Por isso: desenha, espera DOIS ciclos (margem para computadores mais
// lentos) e copia. O ciclo é por mensagem, não por `setTimeout`, que o
// navegador desacelera quando a aba está em segundo plano.
//
// Legenda TRAVADA na exportação: o JASSUB marca-se "ocupado" enquanto o
// worker desenha e DESCARTA em silêncio os pedidos que chegam nesse meio
// tempo. Se o worker não responde mais (o WASM sem memória numa
// exportação longa, por exemplo), ele fica ocupado para sempre e cada
// quadro devolvia o último desenho: a legenda parava num ponto. Agora
// cada quadro tem prazo; ocupado demais ou sem resposta, o renderizador é
// recriado com a mesma legenda e o quadro é desenhado de novo. E ele se
// renova de tempos em tempos, antes que a memória acumule.
// ============================================================

import { FONTES, fontesDoAss } from '../../components/editor/CamadaDeLegendas';

interface Jassub {
  ready: Promise<void>;
  /** O worker está desenhando: o pedido que chega agora é descartado. */
  busy?: boolean;
  manualRender(dados: { expectedDisplayTime: number; width: number; height: number; mediaTime: number }, repaint?: boolean): Promise<void>;
  destroy(): Promise<void>;
}

/** Um ciclo de tarefas do navegador (por mensagem: não é desacelerado em segundo plano). */
function ciclo(): Promise<void> {
  return new Promise((ok) => {
    const canal = new MessageChannel();
    canal.port1.onmessage = () => {
      canal.port1.close();
      ok();
    };
    canal.port2.postMessage(null);
  });
}

/** Quanto um quadro pode levar para ser desenhado antes de o renderizador ser recriado. */
const PRAZO_DO_QUADRO_MS = 4000;
/** A cada tantos quadros (50 s a 30 fps), o renderizador é renovado: a memória do WASM não acumula. */
const QUADROS_POR_INSTANCIA = 1500;

/** A promessa ou `null` se passar do prazo (por mensagens e relógio: vale com a aba em segundo plano). */
function comPrazo<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((ok, falha) => {
    const t = setTimeout(() => ok(null), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        ok(v);
      },
      (e) => {
        clearTimeout(t);
        falha(e);
      },
    );
  });
}

export class RenderizadorDeLegendas {
  private j: Jassub | null = null;
  private canvas: HTMLCanvasElement;
  private recipiente: HTMLDivElement;
  private ass = '';
  private quadrosNestaInstancia = 0;

  private constructor(
    private largura: number,
    private altura: number,
  ) {
    // O JASSUB mede o canvas na página para decidir o tamanho do
    // desenho: ele fica na página, fora da área visível, no tamanho do
    // vídeo exportado.
    this.recipiente = document.createElement('div');
    Object.assign(this.recipiente.style, {
      position: 'fixed',
      left: '-100000px',
      top: '0',
      width: `${largura}px`,
      height: `${altura}px`,
      pointerEvents: 'none',
    });
    this.canvas = document.createElement('canvas');
    Object.assign(this.canvas.style, { width: `${largura}px`, height: `${altura}px`, display: 'block' });
    this.recipiente.appendChild(this.canvas);
    document.body.appendChild(this.recipiente);
  }

  static async criar(ass: string, largura: number, altura: number): Promise<RenderizadorDeLegendas> {
    const r = new RenderizadorDeLegendas(largura, altura);
    r.ass = ass;
    await r.iniciar();
    return r;
  }

  /** Um JASSUB novo no mesmo canvas (no começo e sempre que o anterior travar ou envelhecer). */
  private async iniciar(): Promise<void> {
    const anterior = this.j;
    this.j = null;
    if (anterior) await comPrazo(anterior.destroy().catch(() => undefined), 2000);
    // Canvas novo: o anterior pode ter ficado preso ao worker antigo (OffscreenCanvas transferido).
    const canvas = document.createElement('canvas');
    Object.assign(canvas.style, { width: `${this.largura}px`, height: `${this.altura}px`, display: 'block' });
    this.canvas.replaceWith(canvas);
    this.canvas = canvas;
    const { default: JASSUB } = await import('jassub');
    const j = new JASSUB({
      canvas: this.canvas,
      subContent: this.ass,
      fonts: fontesDoAss(this.ass),
      availableFonts: FONTES,
      queryFonts: false,
    }) as unknown as Jassub;
    await j.ready;
    this.j = j;
    this.quadrosNestaInstancia = 0;
    // O `manualRender` com o tamanho do vídeo é o que configura o quadro
    // do libass (sem ele, nada é desenhado) -- o mesmo caminho da prévia.
    await this.desenhar(0);
  }

  /** Desenha o instante; `false` se o worker não respondeu no prazo (ou descartou o pedido por estar ocupado). */
  private async desenhar(ms: number): Promise<boolean> {
    const j = this.j;
    if (!j) return false;
    // Ocupado com um desenho anterior: espera um pouco; preso nisso, o pedido seria descartado em silêncio.
    for (let i = 0; j.busy && i < 40; i += 1) await new Promise((ok) => setTimeout(ok, 25));
    if (j.busy) return false;
    const feito = await comPrazo(
      j.manualRender({ expectedDisplayTime: performance.now(), width: this.largura, height: this.altura, mediaTime: ms / 1000 }, true).then(() => true),
      PRAZO_DO_QUADRO_MS,
    );
    if (!feito) return false;
    await ciclo();
    await ciclo();
    return true;
  }

  /** A imagem das legendas e textos no instante `ms` (transparente onde não há texto). */
  async quadro(ms: number): Promise<CanvasImageSource | null> {
    if (!this.j) return null;
    // Renova de tempos em tempos: a memória do WASM não acumula numa exportação longa.
    if (this.quadrosNestaInstancia >= QUADROS_POR_INSTANCIA) await this.iniciar();
    this.quadrosNestaInstancia += 1;
    if (await this.desenhar(ms).catch(() => false)) return this.canvas;
    // Travou: um renderizador novo, com a mesma legenda, desenha o quadro de novo.
    await this.iniciar();
    return (await this.desenhar(ms).catch(() => false)) ? this.canvas : null;
  }

  async destruir(): Promise<void> {
    const j = this.j;
    this.j = null;
    if (j) await comPrazo(j.destroy().catch(() => undefined), 2000);
    this.recipiente.remove();
  }
}
