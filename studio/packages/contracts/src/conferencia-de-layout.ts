// ============================================================
// MAKUCHO STUDIO - A conferência de sobreposição das animações.
//
// A IA escreve o HTML sem ver o resultado. O worker de render (que tem o
// Chrome) abre a animação a 1080x1920, avança a linha do tempo para
// alguns instantes e mede cada texto visível (a caixa do TEXTO, não do
// bloco). Aqui fica o julgamento, puro e testável: texto sobre as áreas
// reservadas da grade (cabeçalho do app e logo, faixa da legenda,
// interface do app, janela do vídeo), texto fora do quadro e texto sobre
// texto. O que sair daqui volta para a IA corrigir, como as outras regras.
// ============================================================

import type { ComposicaoHtml } from './animacao-html';
import { QUADRO_DA_GRADE, gradeDaComposicao, type Retangulo } from './grade-dos-layouts';

export interface JobDeConferencia {
  composicao: ComposicaoHtml;
  duracaoMs: number;
}

/** Um texto visível medido num instante (px no quadro 1080x1920). */
export interface TextoMedido {
  texto: string;
  r: Retangulo;
}

export interface MedidasDaAnimacao {
  /** Segundo da animação em que a medida foi feita. */
  t: number;
  textos: TextoMedido[];
}

/** Os instantes medidos, em fração da duração (entrada feita, meio, antes da saída). */
export const INSTANTES_DA_CONFERENCIA = [0.35, 0.6, 0.85] as const;

/**
 * As fotos para a crítica: o mesmo job, na mesma fila, com este nome. O
 * worker devolve um JPEG (base64) por instante, em 540x960 -- o bastante
 * para julgar composição, hierarquia e contraste, e leve para ir à IA.
 * Onde o vídeo da pessoa aparece (fora do cartão, a outra metade, a janela
 * do pip) sai um cinza neutro.
 */
export const JOB_DE_FOTOS = 'fotografar';
/** Começo (a entrada em curso), meio e o quadro cheio antes da saída. */
export const INSTANTES_DAS_FOTOS = [0.22, 0.55, 0.86] as const;
/** O cinza que faz as vezes do vídeo nas fotos. */
export const COR_DO_VIDEO_NAS_FOTOS = '#6b6f76';

const area = (r: Retangulo) => Math.max(0, r.w) * Math.max(0, r.h);
function intersecao(a: Retangulo, b: Retangulo): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}
const curto = (s: string) => (s.length > 32 ? `${s.slice(0, 30)}…` : s);

/**
 * Os problemas de layout de uma animação, a partir das medidas. Mensagens
 * curtas e acionáveis (vão para a IA). No máximo 6, sem repetir.
 */
export function problemasDeLayout(c: Pick<ComposicaoHtml, 'layout' | 'lado' | 'divisao' | 'canto' | 'tamanhoPip'>, medidas: MedidasDaAnimacao[]): string[] {
  const g = gradeDaComposicao(c);
  const { w: W, h: H } = QUADRO_DA_GRADE;
  // Um aviso por problema (o primeiro instante em que aparece).
  const saida = new Map<string, string>();
  const avisar = (chave: string, msg: string) => {
    if (!saida.has(chave)) saida.set(chave, msg);
  };
  for (const m of medidas) {
    const quando = `aos ${m.t.toFixed(1)} s`;
    const textos = m.textos.filter((x) => area(x.r) > 60);
    for (const x of textos) {
      if (x.r.x < -2 || x.r.y < -2 || x.r.x + x.r.w > W + 2 || x.r.y + x.r.h > H + 2) {
        avisar(`fora|${x.texto}`, `o texto "${curto(x.texto)}" sai do quadro ${quando}: mantenha-o dentro da área útil`);
        continue;
      }
      for (const res of g.reservadas) {
        const i = intersecao(x.r, res.r);
        if (i > 0.12 * area(x.r)) {
          avisar(`res|${x.texto}|${res.nome}`, `o texto "${curto(x.texto)}" invade a área reservada (${res.nome}) ${quando} (texto em y ${Math.round(x.r.y)}-${Math.round(x.r.y + x.r.h)}): leve-o para dentro da área útil`);
        }
      }
    }
    for (let a = 0; a < textos.length; a += 1) {
      for (let b = a + 1; b < textos.length; b += 1) {
        const ta = textos[a]!;
        const tb = textos[b]!;
        const i = intersecao(ta.r, tb.r);
        if (i > 0.25 * Math.min(area(ta.r), area(tb.r))) {
          avisar(`sob|${ta.texto}|${tb.texto}`, `o texto "${curto(ta.texto)}" fica sobre "${curto(tb.texto)}" ${quando}: afaste-os (ou tire um da tela antes do outro entrar)`);
        }
      }
    }
  }
  return [...saida.values()].slice(0, 6);
}
