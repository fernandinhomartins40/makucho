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
// ============================================================

import { FONTES, fontesDoAss } from '../../components/editor/CamadaDeLegendas';

interface Jassub {
  ready: Promise<void>;
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

export class RenderizadorDeLegendas {
  private j: Jassub | null = null;
  private canvas: HTMLCanvasElement;
  private recipiente: HTMLDivElement;

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
    const { default: JASSUB } = await import('jassub');
    r.j = new JASSUB({
      canvas: r.canvas,
      subContent: ass,
      fonts: fontesDoAss(ass),
      availableFonts: FONTES,
      queryFonts: false,
    }) as unknown as Jassub;
    await r.j.ready;
    // O `manualRender` com o tamanho do vídeo é o que configura o quadro
    // do libass (sem ele, nada é desenhado) -- o mesmo caminho da prévia.
    await r.quadro(0);
    return r;
  }

  /** A imagem das legendas e textos no instante `ms` (transparente onde não há texto). */
  async quadro(ms: number): Promise<CanvasImageSource | null> {
    const j = this.j;
    if (!j) return null;
    await j.manualRender({ expectedDisplayTime: performance.now(), width: this.largura, height: this.altura, mediaTime: ms / 1000 }, true);
    await ciclo();
    await ciclo();
    return this.canvas;
  }

  async destruir(): Promise<void> {
    const j = this.j;
    this.j = null;
    if (j) await j.destroy().catch(() => undefined);
    this.recipiente.remove();
  }
}
