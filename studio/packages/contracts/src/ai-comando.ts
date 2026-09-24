// ============================================================
// MAKUCHO STUDIO - Edicao por comando (chamada #7).
//
// A pessoa escreve o que quer ("legenda estilo Hormozi, zoom nas
// partes fortes e sem musica") e a IA devolve OPERACOES da timeline --
// as mesmas que os botoes do editor disparam, validadas pelo mesmo
// schema. A IA nao ganha nenhum poder que a pessoa nao tenha, e cada
// operacao vira uma versao do plano que se desfaz com um Ctrl+Z.
//
// ECONOMIA DE TOKENS
//
// - O plano vai RESUMIDO (`resumoDoPlanoParaIa`): uma linha por
//   trecho, com id, papel, duracao e o comeco da fala -- nao o JSON do
//   EditPlan, que custaria dez vezes mais para dizer o mesmo.
// - Nao vai transcricao palavra a palavra: o comando decide
//   acabamento, nao escolhe fala.
// - O prompt de sistema e fixo e vem primeiro, o que o torna
//   elegivel ao cache de prefixo do provedor (entrada cobrada a uma
//   fracao do preco nas chamadas seguintes).
// - A resposta e curta: operacoes + uma frase.
// ============================================================

import { z } from 'zod';
import type { EditPlanV1 } from './edit-plan';
import { PRESETS_DE_LEGENDA } from './estilos-de-legenda';
import { timelineOperationSchema } from './timeline';
import type { TimelineOperation } from './timeline';

/**
 * Operacoes que o comando pode pedir.
 *
 * Fora da lista: `inserir` e `editar_legenda`/`desfazer_correcao`, que
 * exigem ids de segmento e de palavra que o resumo nao carrega (manda-
 * los custaria a transcricao inteira), e `mover_clipe`, que a
 * timeline continua reescreve de qualquer forma.
 */
export const OPERACOES_DO_COMANDO = [
  'ajustar_corte',
  'alternar_clipe',
  'dividir_clipe',
  'duplicar_clipe',
  'reordenar',
  'trocar_estilo_legenda',
  'trocar_musica',
  'configurar_legenda',
  'definir_transicao',
  'transicao_em_todos',
  'definir_efeito',
  'configurar_video',
  'adicionar_overlay',
  'editar_overlay',
  'remover_overlay',
  'adicionar_efeito_sonoro',
  'remover_efeito_sonoro',
] as const;

export const pedidoDeComandoSchema = z
  .object({
    texto: z.string().trim().min(3).max(500),
  })
  .strict();

export const respostaDoComandoSchema = z
  .object({
    schemaVersion: z.literal('1.0'),
    // Desconhecidas aqui: cada uma e validada sozinha logo abaixo, e a
    // invalida sai sem derrubar as outras.
    operations: z.array(z.unknown()).max(30),
    reply: z.string().max(400),
  })
  .strict();

export type LeituraDoComando =
  | { ok: true; operacoes: TimelineOperation[]; resposta: string; ignoradas: string[] }
  | { ok: false; erro: string; recuperavel: boolean };

/** Le a resposta do modelo, operacao por operacao. */
export function parseComando(bruto: string): LeituraDoComando {
  const semCerca = bruto
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  let json: unknown;
  try {
    json = JSON.parse(semCerca);
  } catch (e) {
    return { ok: false, erro: `JSON invalido: ${(e as Error).message}`, recuperavel: true };
  }

  const lido = respostaDoComandoSchema.safeParse(json);
  if (!lido.success) {
    return {
      ok: false,
      erro: lido.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      recuperavel: false,
    };
  }

  const permitidas = new Set<string>(OPERACOES_DO_COMANDO);
  const operacoes: TimelineOperation[] = [];
  const ignoradas: string[] = [];

  for (const bruta of lido.data.operations) {
    const op = timelineOperationSchema.safeParse(bruta);
    if (!op.success) {
      ignoradas.push(descrever(bruta, op.error.issues[0]?.message ?? 'formato inválido'));
      continue;
    }
    if (!permitidas.has(op.data.op)) {
      ignoradas.push(`${op.data.op}: não pode ser pedido por comando`);
      continue;
    }
    operacoes.push(op.data);
  }

  return { ok: true, operacoes, resposta: lido.data.reply.trim(), ignoradas };
}

function descrever(bruta: unknown, motivo: string): string {
  const nome =
    bruta && typeof bruta === 'object' && 'op' in bruta ? String((bruta as { op: unknown }).op) : 'operação';
  return `${nome}: ${motivo}`;
}

/**
 * O plano em poucas linhas, para o prompt.
 *
 * `falas` e o comeco do texto de cada trecho, por id: e o que deixa a
 * IA entender "tira a parte em que eu falo do preco" sem receber a
 * transcricao inteira.
 */
export function resumoDoPlanoParaIa(
  plano: EditPlanV1,
  falas: Readonly<Record<string, string>> = {},
  recursos: { temLogo?: boolean; temMusica?: boolean; logoAssetId?: string | null; musicaAssetId?: string | null } = {},
): string {
  const seg = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
  const total = plano.clips.reduce((t, c) => t + (c.sourceEndMs - c.sourceStartMs), 0);
  const transicaoAntes = new Map(plano.transitions.map((t) => [t.beforeClipIndex, t.type]));
  const c = plano.captions;

  const linhas = [
    `Duração: ${seg(total)} | original ${seg(plano.sourceDurationMs)}`,
    `Legenda: ${c.enabled ? 'ligada' : 'desligada'}, estilo=${c.styleId}, ${c.wordsPerBlock} palavras/bloco, posição=${c.position}, destaque=${c.highlightActiveWord ? 'sim' : 'não'}, tamanho=${c.sizeScale ?? 1}`,
    `Vídeo: enquadramento=${plano.render.fit ?? 'ajustar'}, voz_limpa=${plano.render.voiceEnhance ? 'sim' : 'não'}`,
    `Música: ${plano.music ? `sim (${plano.music.gainDb}dB, assetId=${plano.music.assetId})` : 'não'}${recursos.musicaAssetId ? ` | trilha da marca: assetId=${recursos.musicaAssetId}` : ' | a marca não tem trilha'}`,
    `Logo da marca: ${recursos.logoAssetId ? `assetId=${recursos.logoAssetId}` : 'não cadastrado'}`,
    '',
    'Trechos (id|papel|início na timeline|duração|origem no bruto|efeito|transição antes|fala):',
  ];

  let inicio = 0;
  plano.clips.forEach((clip, i) => {
    const duracao = clip.sourceEndMs - clip.sourceStartMs;
    const fala = (falas[clip.id] ?? '').replace(/\s+/g, ' ').trim();
    linhas.push(
      [
        clip.id,
        clip.role,
        seg(inicio),
        seg(duracao),
        `${clip.sourceStartMs}-${clip.sourceEndMs}ms`,
        clip.effect ?? '-',
        transicaoAntes.get(i) ?? '-',
        `"${fala.length > 90 ? `${fala.slice(0, 89)}…` : fala}"`,
      ].join('|'),
    );
    inicio += duracao;
  });

  if (plano.overlays.length) {
    linhas.push('', 'Elementos (id|tipo|início|duração|texto):');
    for (const o of plano.overlays) {
      linhas.push([o.id, o.component, seg(o.timelineStartMs), seg(o.durationMs), o.text ?? o.variant ?? ''].join('|'));
    }
  }

  if (plano.soundEffects.length) {
    linhas.push('', `Efeitos sonoros: ${plano.soundEffects.map((s) => `${s.id}@${seg(s.timelineStartMs)}`).join(', ')}`);
  }

  return linhas.join('\n');
}

/** Os estilos de legenda, em uma linha cada, para o prompt. */
export function catalogoDeEstilosParaIa(): string {
  return PRESETS_DE_LEGENDA.map((p) => `${p.id}: ${p.descricao}`).join('\n');
}
