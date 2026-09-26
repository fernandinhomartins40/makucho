'use client';

// ============================================================
// Camada de legendas da prévia — o MESMO libass do render.
//
// O render queima o .ass com o libass do FFmpeg. Aqui o mesmo arquivo
// (gerado pelo mesmo `gerarAss` do pacote de contratos) é desenhado
// pelo libass compilado para WebAssembly (JASSUB), com as MESMAS
// fontes. Não é uma imitação em CSS: fonte, quebra de linha, contorno,
// caixa, karaokê e animações saem iguais ao arquivo final.
//
// Modo "só canvas": quem manda no tempo é o Palco, que sabe a posição
// na TIMELINE (o vídeo montado), e não o `<video>`, que toca o bruto
// saltando entre os trechos. O .ass está no tempo da timeline, então é
// esse o relógio que ele precisa.
//
// Se o navegador não tiver o necessário (WebAssembly, OffscreenCanvas,
// Worker), `onFalha` avisa e o Palco volta para a legenda em CSS.
// ============================================================

import { useEffect, useRef, type MutableRefObject } from 'react';
import { FONTES_DE_VIDEO } from '@makucho/studio-contracts';

interface Props {
  /** O .ass completo (legendas e textos de tela). */
  ass: string;
  /** Posição na timeline, em ms, quando parado. */
  tempoMs: number;
  /** Posição na timeline atualizada a cada quadro, durante a reprodução. */
  tempoAoVivo: MutableRefObject<number>;
  tocando: boolean;
  onFalha: () => void;
}

interface Jassub {
  ready: Promise<void>;
  renderer: { setTrack(conteudo: string): Promise<void> | void; addFonts?(fontes: string[]): Promise<boolean> };
  manualRender(dados: { expectedDisplayTime: number; width: number; height: number; mediaTime: number }, repaint?: boolean): Promise<void>;
  destroy(): Promise<void>;
}

/**
 * As fontes do vídeo, pelo nome que o .ass declara. O JASSUB baixa só
 * as que o arquivo usa, na hora em que precisa.
 */
export const FONTES = Object.fromEntries(
  Object.values(FONTES_DE_VIDEO).map((f) => [f.nomeAss.toLowerCase(), `/fonts/${f.arquivo}`]),
);

/**
 * As fontes que o .ass usa (estilos e `\fn` dos textos de destaque),
 * como URL.
 *
 * Carregadas de ANTEMÃO: pelo nome (`availableFonts`) o libass não as
 * achava e caía na LiberationSans -- a prévia saía com outra fonte e
 * outra quebra de linha, diferente dos exemplos e do arquivo final.
 */
export function fontesDoAss(ass: string): string[] {
  const nomes = new Set<string>();
  for (const linha of ass.split('\n')) {
    if (linha.startsWith('Style: ')) nomes.add(linha.slice(7).split(',')[1]?.trim().toLowerCase() ?? '');
  }
  for (const m of ass.matchAll(/\\fn([^\\}]+)/g)) nomes.add(m[1]!.trim().toLowerCase());
  return [...nomes].map((n) => FONTES[n]).filter((u): u is string => Boolean(u));
}

/** O quadro do vídeo final: é a ele que o PlayRes do .ass se refere. */
const LARGURA = 1080;
const ALTURA = 1920;

export function CamadaDeLegendas({ ass, tempoMs, tempoAoVivo, tocando, onFalha }: Props) {
  const recipiente = useRef<HTMLDivElement>(null);
  const instancia = useRef<Jassub | null>(null);
  const pronto = useRef(false);
  const assAtual = useRef(ass);
  const fontesCarregadas = useRef<Set<string>>(new Set());
  const falhou = useRef(onFalha);
  falhou.current = onFalha;

  const desenhar = (ms: number, repintar = false) => {
    const j = instancia.current;
    if (!j || !pronto.current) return;
    void j
      .manualRender(
        { expectedDisplayTime: performance.now(), width: LARGURA, height: ALTURA, mediaTime: ms / 1000 },
        repintar,
      )
      .catch(() => undefined);
  };

  // ---------- Criação ----------
  // O canvas é criado aqui, e não no JSX: o JASSUB transfere o controle
  // dele para o worker (`transferControlToOffscreen`), o que só pode
  // acontecer UMA vez por canvas. No modo estrito do React o efeito
  // roda duas vezes; com um canvas novo a cada montagem, as duas dão
  // certo.
  useEffect(() => {
    const alvo = recipiente.current;
    if (!alvo) return;

    const canvas = document.createElement('canvas');
    canvas.className = 'palco__camada-legenda';
    canvas.setAttribute('aria-hidden', 'true');
    alvo.appendChild(canvas);

    let cancelado = false;

    void (async () => {
      try {
        if (typeof OffscreenCanvas === 'undefined' || typeof Worker === 'undefined') {
          throw new Error('navegador sem OffscreenCanvas/Worker');
        }
        const { default: JASSUB } = await import('jassub');
        if (cancelado) return;

        const inicial = assAtual.current;
        const iniciais = fontesDoAss(inicial);
        fontesCarregadas.current = new Set(iniciais);
        const j = new JASSUB({
          canvas,
          subContent: inicial,
          fonts: iniciais,
          availableFonts: FONTES,
          // Sem fontes do computador de quem assiste: a prévia tem de
          // usar exatamente as fontes do render.
          queryFonts: false,
        }) as unknown as Jassub;
        instancia.current = j;

        await j.ready;
        if (cancelado) return;
        // O .ass mudou enquanto o libass carregava (o caso da primeira
        // montagem: a transcrição chega depois do plano, e a legenda
        // nascia vazia até religar o olho da faixa). O efeito de conteúdo
        // só guardou o novo; aplica aqui, com as fontes dele.
        if (assAtual.current !== inicial) {
          const novas = fontesDoAss(assAtual.current).filter((u) => !fontesCarregadas.current.has(u));
          novas.forEach((u) => fontesCarregadas.current.add(u));
          if (novas.length && j.renderer.addFonts) await Promise.resolve(j.renderer.addFonts(novas)).catch(() => true);
          if (cancelado) return;
          await j.renderer.setTrack(assAtual.current);
          if (cancelado) return;
        }
        pronto.current = true;
        desenhar(tempoAoVivo.current, true);
      } catch (e) {
        console.warn('[prévia] legenda com libass indisponível, usando CSS:', e);
        if (!cancelado) falhou.current();
      }
    })();

    return () => {
      cancelado = true;
      pronto.current = false;
      const j = instancia.current;
      instancia.current = null;
      if (j) void j.destroy().catch(() => undefined);
      else canvas.remove();
    };
    // Criado uma vez; o conteúdo e o tempo mudam pelos efeitos abaixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Conteúdo ----------
  useEffect(() => {
    assAtual.current = ass;
    const j = instancia.current;
    if (!j || !pronto.current) return;
    // Uma fonte nova (trocada no editor) entra antes do texto que a usa.
    const novas = fontesDoAss(ass).filter((u) => !fontesCarregadas.current.has(u));
    novas.forEach((u) => fontesCarregadas.current.add(u));
    void Promise.resolve(novas.length && j.renderer.addFonts ? j.renderer.addFonts(novas) : true)
      .catch(() => true)
      .then(() => j.renderer.setTrack(ass))
      .then(() => desenhar(tocando ? tempoAoVivo.current : tempoMs, true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ass]);

  // ---------- Tempo, parado ----------
  useEffect(() => {
    if (!tocando) desenhar(tempoMs, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tempoMs, tocando]);

  // ---------- Tempo, tocando: a cada quadro ----------
  // O "pop" da palavra dura 90 ms; atualizar a cada 100 ms, como a
  // timeline, pularia a animação inteira.
  useEffect(() => {
    if (!tocando) return;
    let quadro = 0;
    const passo = () => {
      desenhar(tempoAoVivo.current);
      quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tocando]);

  return <div ref={recipiente} className="palco__camada" aria-hidden />;
}
