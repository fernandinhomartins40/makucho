// ============================================================
// Camadas ocultas da timeline (o olho de cada faixa).
//
// Esconder uma faixa tira aquela camada da PRÉVIA e da EXPORTAÇÃO, sem
// apagar nada do plano: é só uma lente sobre ele, guardada por projeto
// no navegador (como os trechos desligados). A timeline continua
// mostrando os itens da faixa, apagados, para a pessoa saber que estão
// lá e religar com um clique.
//
// Toda edição da IA (análise, acabamento, comando) religa todas as
// faixas: o resultado da IA aparece inteiro.
// ============================================================

import type { EditPlanV1 } from '@makucho/studio-contracts';
import { COMPONENTES_DE_TEXTO } from '../components/timeline/camadas';

export const CAMADAS_OCULTAVEIS = ['midia', 'audio', 'legendas', 'textos', 'elementos', 'efeitos', 'sons', 'trilha'] as const;
export type CamadaOcultavel = (typeof CAMADAS_OCULTAVEIS)[number];

export const ehCamadaOcultavel = (v: string): v is CamadaOcultavel => (CAMADAS_OCULTAVEIS as readonly string[]).includes(v);

/** O plano como deve ser visto e exportado, sem as camadas escondidas. */
export function esconderCamadas(plano: EditPlanV1, ocultas: ReadonlySet<CamadaOcultavel>): EditPlanV1 {
  if (!ocultas.size) return plano;
  let p: EditPlanV1 = plano;
  if (ocultas.has('midia')) p = { ...p, mediaLayers: [] };
  if (ocultas.has('audio')) p = { ...p, clips: p.clips.map((c) => ({ ...c, audio: { ...(c.audio ?? {}), muted: true } })) };
  if (ocultas.has('legendas')) p = { ...p, captions: { ...p.captions, enabled: false } };
  if (ocultas.has('textos')) p = { ...p, overlays: p.overlays.filter((o) => !COMPONENTES_DE_TEXTO.has(o.component)) };
  if (ocultas.has('elementos')) p = { ...p, overlays: p.overlays.filter((o) => COMPONENTES_DE_TEXTO.has(o.component)) };
  if (ocultas.has('efeitos')) p = { ...p, screenEffects: [] };
  if (ocultas.has('sons')) p = { ...p, soundEffects: [] };
  if (ocultas.has('trilha')) {
    const { music: _sem, ...resto } = p;
    p = resto as EditPlanV1;
  }
  return p;
}
