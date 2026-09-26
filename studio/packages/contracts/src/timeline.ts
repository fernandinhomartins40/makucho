// ============================================================
// MAKUCHO STUDIO - Timeline editavel
//
// ADR 0008: antecipada do MVP 2 para o MVP 1.
//
// A timeline NAO e um editor livre. Ela ajusta a proposta que a IA
// fez -- mover, encurtar, desativar e reordenar clipes que JA
// existem no EditPlan.
//
// `inserir` acrescenta um trecho, e isso NAO e excecao a regra de
// integridade editorial (contexto mestre, secao 5): o trecho vem do
// video ORIGINAL, pelos tempos dele, e carrega
// `transcriptSegmentIds` como qualquer outro clipe. Continua nao
// havendo "adicionar clipe do nada" -- o que ha e trazer para a
// timeline uma fala que ja foi gravada e ficou de fora.
//
// Toda operacao produz um EditPlan novo, validado pelo mesmo schema
// de sempre. A timeline nao tem um caminho mais permissivo que o da
// IA: as duas passam pela mesma porta.
// ============================================================

import { z } from 'zod';
import {
  OVERLAY_COMPONENTS,
  editPlanV1Schema,
  efeitoDeTrechoSchema,
  estiloDoTextoSchema,
  tipoDeTransicaoSchema, duracaoNaTimeline } from './edit-plan';
import type { EditPlanV1, EstiloDoTexto, TipoDeTransicao } from './edit-plan';
import { corDoTrechoSchema, corEhNeutra } from './cor';
import { TIPOS_DE_EFEITO_DE_TELA, definicaoDoEfeitoDeTela } from './efeitos-de-tela';
import { KEN_BURNS, LAYOUTS_DE_MIDIA, MOLDURAS, REVELACOES } from './midias';
import { ENTRADAS_DE_MIDIA, LOOPS_DE_MIDIA, SAIDAS_DE_MIDIA, keyframeDaMidiaSchema } from './animacao-da-midia';
import { presetDaLegenda } from './estilos-de-legenda';
import { TRANSICOES_DO_CATALOGO } from './transicoes';
import { clipRoleSchema, semanticRiskSchema } from './vocabulary';

// ---------- Tracks ----------
//
// As cinco da secao 17 do contexto mestre.
export const TRACKS = ['video', 'text', 'assets', 'music', 'effects'] as const;
export const trackSchema = z.enum(TRACKS);
export type Track = z.infer<typeof trackSchema>;

// ---------- Operacoes ----------
//
// Cada uma descreve uma intencao do usuario, nao um estado final.
// Guardar a intencao permite desfazer e auditar o que foi mudado --
// um EditPlan inteiro sobrescrito nao diz o que o usuario fez.

const idSchema = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);
const msSchema = z.number().int().nonnegative();

/** Move um clipe na linha do tempo, sem alterar o trecho de origem. */
export const moverClipeSchema = z.object({
  op: z.literal('mover_clipe'),
  clipId: idSchema,
  timelineStartMs: msSchema,
});

/**
 * Encurta ou estende um clipe pelas bordas.
 *
 * Os novos limites continuam apontando para o ORIGINAL: o usuario
 * escolhe onde o trecho comeca e termina, nunca inventa conteudo.
 */
// Sem .refine() aqui: o discriminatedUnion le o shape de cada membro
// para encontrar o campo "op", e um refine devolve ZodEffects, que nao
// expoe shape. A regra de inicio < fim e aplicada na uniao inteira,
// logo abaixo.
export const ajustarCorteSchema = z.object({
  op: z.literal('ajustar_corte'),
  clipId: idSchema,
  sourceStartMs: msSchema,
  sourceEndMs: msSchema,
});

/**
 * Tira um clipe do video sem apaga-lo.
 *
 * "Desativar" e nao "remover" porque o contexto mestre (secao 13)
 * exige que o usuario possa RESTAURAR um trecho descartado. Um
 * delete verdadeiro tornaria isso impossivel.
 */
export const alternarClipeSchema = z.object({
  op: z.literal('alternar_clipe'),
  clipId: idSchema,
  enabled: z.boolean(),
});

/**
 * Parte um clipe em dois no ponto indicado.
 *
 * As duas metades continuam apontando para o ORIGINAL: dividir nao
 * cria conteudo, so escolhe onde um trecho vira dois. E o que
 * permite descartar o meio de uma fala sem perder as pontas.
 */
export const dividirClipeSchema = z.object({
  op: z.literal('dividir_clipe'),
  clipId: idSchema,
  // Ponto do corte no ORIGINAL, nao na timeline: e a unica
  // referencia que sobrevive a reordenacoes.
  sourceMs: msSchema,
  /** Id da segunda metade, escolhido por quem pede (ver `comIdsNovos`). */
  novoClipId: idSchema.optional(),
});

/**
 * Repete um clipe logo depois do original.
 *
 * A copia aponta para o MESMO trecho da gravacao. Util para repetir
 * uma frase de efeito sem regravar nada.
 */
export const duplicarClipeSchema = z.object({
  op: z.literal('duplicar_clipe'),
  clipId: idSchema,
  /** Id da cópia, escolhido por quem pede (ver `comIdsNovos`). */
  novoClipId: idSchema.optional(),
});

/**
 * Traz para a timeline um trecho do original que ficou de fora.
 *
 * E a operacao que aplica um candidato da chamada #4. O candidato
 * chega como PROPOSTA -- a IA sugere, o usuario clica, e o que entra
 * na timeline passa por aqui, pelo mesmo contrato de sempre.
 *
 * `transcriptSegmentIds` e obrigatorio pelo mesmo motivo do
 * `clipSchema`: sem ao menos um segmento, a fala nao tem origem
 * comprovavel, e e exatamente o caso que a regra de integridade
 * editorial proibe.
 */
export const inserirClipeSchema = z.object({
  op: z.literal('inserir'),
  sourceStartMs: z.number().int().nonnegative(),
  sourceEndMs: z.number().int().nonnegative(),
  role: clipRoleSchema,
  transcriptSegmentIds: z.array(idSchema).min(1),
  reason: z.string().min(1).max(500),
  semanticRisk: semanticRiskSchema,
  /**
   * Depois de qual clipe entrar. Ausente = no fim.
   *
   * Por ID e nao por indice: indice muda quando outra operacao
   * reordena, e uma insercao pendente na tela apontaria para o
   * lugar errado.
   */
  aposClipId: idSchema.optional(),
  /** Id do trecho novo, escolhido por quem pede (ver `comIdsNovos`). */
  novoClipId: idSchema.optional(),
});

/** Troca a ordem dos clipes. A validacao semantica roda depois. */
export const reordenarSchema = z.object({
  op: z.literal('reordenar'),
  clipIds: z.array(idSchema).min(1).max(60),
});

/**
 * Corrige a transcricao de UMA palavra.
 *
 * Antes esta operacao recebia `clipId` + `text` e nao fazia nada: o
 * `case` era um comentario e um `break`. O usuario editava, o plano
 * salvava uma versao nova, e o render ignorava -- a legenda saia do
 * whisper de novo. Dois defeitos ao mesmo tempo:
 *
 *   - nao havia ONDE a correcao ficar: a captionTrack nao tinha
 *     campo para guardar nada;
 *   - `clipId` nao e ancora suficiente. Um clipe de 4s tem varios
 *     blocos de legenda, e "a legenda do clipe" nao existe como
 *     coisa unica.
 *
 * A ancora agora e a PALAVRA: a menor unidade com tempo proprio, e a
 * unica que sobrevive a um ajuste de corte ou a uma mudanca de
 * `wordsPerBlock`.
 */
export const editarLegendaSchema = z.object({
  op: z.literal('editar_legenda'),
  wordId: idSchema,
  text: z.string().min(1).max(80),
  /** O que o whisper transcreveu, para exibir ao lado e desfazer. */
  original: z.string().max(80),
});

/** Desfaz uma correcao: a legenda volta ao que o whisper ouviu. */
export const desfazerCorrecaoSchema = z.object({
  op: z.literal('desfazer_correcao'),
  wordId: idSchema,
});

export const trocarEstiloLegendaSchema = z.object({
  op: z.literal('trocar_estilo_legenda'),
  styleId: idSchema,
});

export const trocarMusicaSchema = z.object({
  op: z.literal('trocar_musica'),
  assetId: idSchema.nullable(),
  gainDb: z.number().min(-40).max(0).optional(),
  /** Abaixar a trilha enquanto alguem fala. */
  duckUnderVoice: z.boolean().optional(),
});

// ---------- Acabamento: legenda, video, efeitos e textos ----------
//
// Estas operacoes sao o vocabulario COMPLETO de acabamento do Studio.
// O editor as dispara por clique, e a IA as devolve no comando em
// linguagem natural (ai-comando.ts): as duas passam pela mesma porta,
// validadas pelo mesmo schema -- a IA nao tem um caminho mais
// permissivo que o da pessoa.

/** Liga, desliga ou ajusta a legenda sem trocar o estilo. */
export const configurarLegendaSchema = z.object({
  op: z.literal('configurar_legenda'),
  enabled: z.boolean().optional(),
  wordsPerBlock: z.number().int().min(1).max(8).optional(),
  position: z.enum(['top', 'center', 'bottom']).optional(),
  highlightActiveWord: z.boolean().optional(),
  sizeScale: z.number().min(0.5).max(2.2).optional(),
  /** Posição livre da base do bloco (0-1); `null` volta à `position`. */
  y: z.number().min(0.08).max(0.97).nullable().optional(),
  /** `null` volta ao do estilo. */
  fontId: z.string().max(40).nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  highlightColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  /** Como cada bloco entra; `null` tira. */
  blockEntrance: z.enum(['nenhuma', 'surgir', 'pop', 'subir', 'zoom', 'desfocar']).nullable().optional(),
});

/** Exclui legendas: as palavras continuam na fala, somem da tela. */
export const ocultarLegendaSchema = z.object({
  op: z.literal('ocultar_legenda'),
  wordIds: z.array(idSchema).min(1).max(80),
});

/** Desfaz a exclusão. */
export const restaurarLegendaSchema = z.object({
  op: z.literal('restaurar_legenda'),
  wordIds: z.array(idSchema).min(1).max(80),
});

/** Uma legenda escrita à mão, no tempo da timeline. */
export const adicionarLegendaSchema = z.object({
  op: z.literal('adicionar_legenda'),
  /** Id escolhido por quem pede (ver `comIdsNovos`). */
  id: idSchema.optional(),
  timelineStartMs: msSchema,
  durationMs: z.number().int().min(200).max(20_000),
  text: z.string().trim().min(1).max(160),
});

export const editarLegendaManualSchema = z.object({
  op: z.literal('editar_legenda_manual'),
  legendaId: idSchema,
  text: z.string().trim().min(1).max(160).optional(),
  timelineStartMs: msSchema.optional(),
  durationMs: z.number().int().min(200).max(20_000).optional(),
});

export const removerLegendaManualSchema = z.object({
  op: z.literal('remover_legenda_manual'),
  legendaId: idSchema,
});

/**
 * A transicao que ENTRA num trecho (entre ele e o anterior).
 *
 * Por `clipId` e nao por indice: o indice muda quando algo e
 * reordenado. `cut` remove a transicao.
 */
export const definirTransicaoSchema = z.object({
  op: z.literal('definir_transicao'),
  clipId: idSchema,
  type: tipoDeTransicaoSchema,
  durationMs: z.number().int().min(150).max(1500).optional(),
});

/** A mesma transicao em todos os cortes (ou nenhuma, com `cut`). */
export const transicaoEmTodosSchema = z.object({
  op: z.literal('transicao_em_todos'),
  type: tipoDeTransicaoSchema,
  durationMs: z.number().int().min(150).max(1500).optional(),
});

/** Efeito de um trecho; `nenhum` remove. */
export const definirEfeitoSchema = z.object({
  op: z.literal('definir_efeito'),
  clipId: idSchema,
  effect: z.union([efeitoDeTrechoSchema, z.literal('nenhum')]),
});

/** Velocidade de um trecho (0,25x a 4x); 1 volta ao normal. */
export const definirVelocidadeSchema = z.object({
  op: z.literal('definir_velocidade'),
  clipId: idSchema,
  speed: z.number().min(0.25).max(4),
});

/** Filtro e ajustes de cor de um trecho; `null` volta à cor original. */
export const definirCorSchema = z.object({
  op: z.literal('definir_cor'),
  clipId: idSchema,
  color: corDoTrechoSchema.nullable(),
});

/** A mesma cor em todos os trechos (ou nenhuma). */
export const corEmTodosSchema = z.object({
  op: z.literal('cor_em_todos'),
  color: corDoTrechoSchema.nullable(),
});

/**
 * Vinheta de abertura/encerramento da marca (asset INTRO/OUTRO): entra
 * inteira antes/depois do vídeo. `null` tira. A duração é a do arquivo,
 * medida no envio -- quem pede informa, o render corta nela.
 */
export const definirAberturaSchema = z.object({
  op: z.literal('definir_abertura'),
  assetId: idSchema.nullable(),
  durationMs: z.number().int().min(200).max(30_000).optional(),
});

export const definirEncerramentoSchema = z.object({
  op: z.literal('definir_encerramento'),
  assetId: idSchema.nullable(),
  durationMs: z.number().int().min(200).max(30_000).optional(),
});

/** Enquadramento e limpeza de voz. */
export const configurarVideoSchema = z.object({
  op: z.literal('configurar_video'),
  fit: z.enum(['ajustar', 'preencher', 'desfoque']).optional(),
  voiceEnhance: z.boolean().optional(),
});

/**
 * Um texto ou imagem sobre o video.
 *
 * `text` e elemento grafico (titulo, chamada), nao legenda: a regra de
 * que legenda so sai da fala continua intacta, porque a legenda nao
 * passa por aqui.
 */
export const adicionarOverlaySchema = z.object({
  op: z.literal('adicionar_overlay'),
  /** Id escolhido por quem pede (ver `comIdsNovos`). */
  id: idSchema.optional(),
  component: z.enum(OVERLAY_COMPONENTS),
  text: z.string().min(1).max(200).optional(),
  assetId: idSchema.optional(),
  variant: z.string().max(40).optional(),
  timelineStartMs: msSchema,
  durationMs: z.number().int().min(300).max(600_000),
  style: estiloDoTextoSchema.optional(),
});

export const editarOverlaySchema = z.object({
  op: z.literal('editar_overlay'),
  overlayId: idSchema,
  text: z.string().min(1).max(200).optional(),
  variant: z.string().max(40).optional(),
  timelineStartMs: msSchema.optional(),
  durationMs: z.number().int().min(300).max(600_000).optional(),
  /** Mesclado ao estilo atual: mudar a cor não apaga a posição. */
  style: estiloDoTextoSchema.optional(),
  /**
   * Troca o estilo inteiro (um estilo pronto), guardando só a posição
   * -- nada do estilo anterior "vaza" para o novo.
   */
  replaceStyle: z.boolean().optional(),
});

export const removerOverlaySchema = z.object({
  op: z.literal('remover_overlay'),
  overlayId: idSchema,
});

/** Efeito sonoro num ponto da timeline (embutido ou do workspace). */
export const adicionarEfeitoSonoroSchema = z.object({
  op: z.literal('adicionar_efeito_sonoro'),
  /** Id escolhido por quem pede (ver `comIdsNovos`). */
  id: idSchema.optional(),
  assetId: idSchema,
  timelineStartMs: msSchema,
  gainDb: z.number().min(-40).max(6).optional(),
});

/** Move ou muda o volume de um efeito sonoro. */
export const editarEfeitoSonoroSchema = z.object({
  op: z.literal('editar_efeito_sonoro'),
  soundEffectId: idSchema,
  timelineStartMs: msSchema.optional(),
  gainDb: z.number().min(-40).max(6).optional(),
});

/**
 * O som de um trecho, independente da imagem: volume, mudo, fades e
 * J/L-cut (ver `audioDoTrechoSchema`). `null` volta ao padrão.
 */
export const ajustarAudioDoClipeSchema = z.object({
  op: z.literal('ajustar_audio_do_clipe'),
  clipId: idSchema,
  gainDb: z.number().min(-30).max(12).nullable().optional(),
  muted: z.boolean().nullable().optional(),
  fadeInMs: z.number().int().min(0).max(3000).nullable().optional(),
  fadeOutMs: z.number().int().min(0).max(3000).nullable().optional(),
  leadMs: z.number().int().min(0).max(3000).nullable().optional(),
  tailMs: z.number().int().min(0).max(3000).nullable().optional(),
});

/** Volume, fades e ducking da trilha de fundo. */
export const configurarMusicaSchema = z.object({
  op: z.literal('configurar_musica'),
  gainDb: z.number().min(-40).max(0).optional(),
  fadeInMs: z.number().int().min(0).max(5000).optional(),
  fadeOutMs: z.number().int().min(0).max(5000).optional(),
  duckUnderVoice: z.boolean().optional(),
});

/** Um efeito de tela novo (vinheta, flash, tremor...) na faixa Efeitos. */
export const adicionarEfeitoDeTelaSchema = z.object({
  op: z.literal('adicionar_efeito_de_tela'),
  /** Id escolhido por quem pede (ver `comIdsNovos`). */
  id: idSchema.optional(),
  type: z.enum(TIPOS_DE_EFEITO_DE_TELA),
  timelineStartMs: msSchema,
  durationMs: z.number().int().min(100).max(600_000),
  intensity: z.number().min(0).max(1).optional(),
});

/** Move, estica, troca o tipo ou a intensidade de um efeito de tela. */
export const editarEfeitoDeTelaSchema = z.object({
  op: z.literal('editar_efeito_de_tela'),
  effectId: idSchema,
  type: z.enum(TIPOS_DE_EFEITO_DE_TELA).optional(),
  timelineStartMs: msSchema.optional(),
  durationMs: z.number().int().min(100).max(600_000).optional(),
  intensity: z.number().min(0).max(1).optional(),
});

export const removerEfeitoDeTelaSchema = z.object({
  op: z.literal('remover_efeito_de_tela'),
  effectId: idSchema,
});

const mudancasDaMidia = {
  timelineStartMs: msSchema.optional(),
  durationMs: z.number().int().min(100).max(600_000).optional(),
  layout: z.enum(LAYOUTS_DE_MIDIA).optional(),
  x: z.number().min(0).max(1).optional(),
  y: z.number().min(0).max(1).optional(),
  width: z.number().min(0.05).max(1).optional(),
  opacity: z.number().min(0).max(1).optional(),
  radius: z.number().min(0).max(0.5).optional(),
  fadeInMs: z.number().int().min(0).max(3000).optional(),
  fadeOutMs: z.number().int().min(0).max(3000).optional(),
  sourceStartMs: msSchema.optional(),
  volume: z.number().min(0).max(2).optional(),
  animIn: z.enum(ENTRADAS_DE_MIDIA).optional(),
  animLoop: z.enum(LOOPS_DE_MIDIA).optional(),
  animOut: z.enum(SAIDAS_DE_MIDIA).optional(),
  followPerson: z.boolean().optional(),
  kenBurns: z.enum(KEN_BURNS).optional(),
  reveal: z.enum(REVELACOES).optional(),
  revealMs: z.number().int().min(100).max(10_000).optional(),
  frame: z.enum(MOLDURAS).optional(),
  frameColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  /** Troca a lista inteira; `null` tira os keyframes. */
  keyframes: z.array(keyframeDaMidiaSchema).max(24).nullable().optional(),
};

/** Uma imagem ou vídeo do workspace por cima do vídeo (B-roll, PiP...). */
export const adicionarMidiaSchema = z.object({
  op: z.literal('adicionar_midia'),
  /** Id escolhido por quem pede (ver `comIdsNovos`). */
  id: idSchema.optional(),
  assetId: idSchema,
  kind: z.enum(['image', 'video', 'sticker']),
  ...mudancasDaMidia,
  timelineStartMs: msSchema,
  durationMs: z.number().int().min(100).max(600_000),
  layout: z.enum(LAYOUTS_DE_MIDIA),
});

export const editarMidiaSchema = z.object({
  op: z.literal('editar_midia'),
  mediaId: idSchema,
  ...mudancasDaMidia,
  /** Troca o arquivo (ex.: a mesma imagem com o fundo removido). */
  assetId: idSchema.optional(),
});

export const removerMidiaSchema = z.object({
  op: z.literal('remover_midia'),
  mediaId: idSchema,
});

export const removerEfeitoSonoroSchema = z.object({
  op: z.literal('remover_efeito_sonoro'),
  /** Um id, ou `todos` para limpar a faixa de efeitos. */
  soundEffectId: idSchema,
});

export const timelineOperationSchema = z
  .discriminatedUnion('op', [
    moverClipeSchema,
    ajustarCorteSchema,
    alternarClipeSchema,
    dividirClipeSchema,
    duplicarClipeSchema,
    inserirClipeSchema,
    reordenarSchema,
    editarLegendaSchema,
    desfazerCorrecaoSchema,
    ocultarLegendaSchema,
    restaurarLegendaSchema,
    adicionarLegendaSchema,
    editarLegendaManualSchema,
    removerLegendaManualSchema,
    trocarEstiloLegendaSchema,
    trocarMusicaSchema,
    configurarMusicaSchema,
    ajustarAudioDoClipeSchema,
    editarEfeitoSonoroSchema,
    configurarLegendaSchema,
    definirTransicaoSchema,
    transicaoEmTodosSchema,
    definirEfeitoSchema,
    definirVelocidadeSchema,
    definirCorSchema,
    corEmTodosSchema,
    adicionarEfeitoDeTelaSchema,
    editarEfeitoDeTelaSchema,
    removerEfeitoDeTelaSchema,
    adicionarMidiaSchema,
    editarMidiaSchema,
    removerMidiaSchema,
    configurarVideoSchema,
    definirAberturaSchema,
    definirEncerramentoSchema,
    adicionarOverlaySchema,
    editarOverlaySchema,
    removerOverlaySchema,
    adicionarEfeitoSonoroSchema,
    removerEfeitoSonoroSchema,
  ])
  // As regras que cruzam campos ficam aqui, depois da discriminacao:
  // um .refine() dentro do membro impediria o Zod de ler o campo "op".
  .superRefine((operacao, ctx) => {
    if (operacao.op === 'dividir_clipe' && operacao.sourceMs === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sourceMs'],
        message: 'o ponto de divisao precisa cair dentro do trecho',
      });
    }

    if (operacao.op === 'ajustar_corte' && operacao.sourceEndMs <= operacao.sourceStartMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sourceEndMs'],
        message: 'o fim do trecho deve vir depois do inicio',
      });
    }
  });

export type TimelineOperation = z.infer<typeof timelineOperationSchema>;

// ---------- Aplicacao ----------

export interface ResultadoDaOperacao {
  ok: boolean;
  plan?: EditPlanV1;
  erro?: string;
}

/**
 * Aplica uma operacao ao EditPlan.
 *
 * O resultado passa pelo `editPlanV1Schema` completo antes de voltar:
 * sobreposicao de clipes, corte alem da duracao do original e
 * duracao incoerente continuam sendo recusados, venha a mudanca da
 * IA ou do usuario.
 *
 * NAO grava nada. Quem persiste (e cria a versao) e o chamador.
 */
export function aplicarOperacao(
  plan: EditPlanV1,
  operacao: TimelineOperation,
): ResultadoDaOperacao {
  // Copia profunda dos clipes: mutar o plano recebido faria o
  // chamador perder a versao anterior, e com ela o "desfazer".
  const clips = plan.clips.map((c) => ({ ...c }));
  let novo: EditPlanV1 = { ...plan, clips };

  // As transicoes guardam o INDICE do trecho que antecedem. Antes de
  // qualquer operacao elas sao ancoradas no id do trecho, e no fim
  // voltam a indice: dividir, duplicar, inserir, reordenar ou
  // desativar mudam indices, e uma transicao presa ao numero passaria
  // a entrar no trecho errado.
  const transicoesPorClipe = new Map<string, EditPlanV1['transitions'][number]>();
  for (const t of plan.transitions) {
    const alvo = plan.clips[t.beforeClipIndex];
    if (alvo) transicoesPorClipe.set(alvo.id, t);
  }

  switch (operacao.op) {
    case 'mover_clipe': {
      const clip = clips.find((c) => c.id === operacao.clipId);
      if (!clip) return { ok: false, erro: 'clipe nao encontrado' };
      clip.timelineStartMs = operacao.timelineStartMs;
      break;
    }

    case 'ajustar_corte': {
      const clip = clips.find((c) => c.id === operacao.clipId);
      if (!clip) return { ok: false, erro: 'clipe nao encontrado' };

      // O corte nao pode passar do fim do video original -- o schema
      // tambem barra, mas aqui a mensagem e util ao usuario.
      if (operacao.sourceEndMs > plan.sourceDurationMs) {
        return {
          ok: false,
          erro: 'o trecho escolhido ultrapassa a duracao do video original',
        };
      }

      clip.sourceStartMs = operacao.sourceStartMs;
      clip.sourceEndMs = operacao.sourceEndMs;

      // Mudar a duracao de um clipe desloca todos os seguintes: sem
      // isso, sobraria um buraco ou uma sobreposicao.
      novo = { ...novo, clips: recomporTimeline(clips) };
      break;
    }

    case 'alternar_clipe': {
      const clip = clips.find((c) => c.id === operacao.clipId);
      if (!clip) return { ok: false, erro: 'clipe nao encontrado' };

      // Um EditPlan sem nenhum clipe nao renderiza nada.
      const restantes = clips.filter((c) => c.id !== operacao.clipId).length;
      if (!operacao.enabled && restantes === 0) {
        return { ok: false, erro: 'o video precisa de ao menos um trecho ativo' };
      }

      // Desativar remove da timeline ATIVA; o clipe continua no
      // historico de versoes e pode voltar.
      if (!operacao.enabled) {
        novo = {
          ...novo,
          clips: recomporTimeline(clips.filter((c) => c.id !== operacao.clipId)),
        };
      }
      break;
    }

    case 'dividir_clipe': {
      const indice = clips.findIndex((c) => c.id === operacao.clipId);
      const clip = clips[indice];
      if (!clip) return { ok: false, erro: 'clipe nao encontrado' };

      // Uma divisao a menos de meio segundo de qualquer borda produz
      // um fragmento que nao da para ouvir nem selecionar.
      const MINIMO_MS = 500;
      if (
        operacao.sourceMs <= clip.sourceStartMs + MINIMO_MS ||
        operacao.sourceMs >= clip.sourceEndMs - MINIMO_MS
      ) {
        return {
          ok: false,
          erro: 'o ponto de divisao esta perto demais da borda do trecho',
        };
      }

      // A segunda metade herda funcao, origem e motivo: ela nasce do
      // mesmo trecho da gravacao, entao a justificativa da IA
      // continua valendo para as duas.
      const segunda = {
        ...clip,
        id: livre(operacao.novoClipId, clips, `${clip.id}-b`.slice(0, 48)),
        sourceStartMs: operacao.sourceMs,
      };
      clip.sourceEndMs = operacao.sourceMs;

      const divididos = [...clips];
      divididos.splice(indice + 1, 0, segunda);
      novo = { ...novo, clips: recomporTimeline(divididos) };
      break;
    }

    case 'duplicar_clipe': {
      const indice = clips.findIndex((c) => c.id === operacao.clipId);
      const clip = clips[indice];
      if (!clip) return { ok: false, erro: 'clipe nao encontrado' };

      const copia = { ...clip, id: livre(operacao.novoClipId, clips, `${clip.id}-c`.slice(0, 48)) };
      const comCopia = [...clips];
      comCopia.splice(indice + 1, 0, copia);
      novo = { ...novo, clips: recomporTimeline(comCopia) };
      break;
    }

    case 'inserir': {
      if (operacao.sourceEndMs <= operacao.sourceStartMs) {
        return { ok: false, erro: 'o fim do trecho precisa vir depois do inicio' };
      }

      // O trecho tem de existir na gravacao. Um tempo alem do fim
      // faria o FFmpeg produzir um clip mudo e mais curto, sem erro:
      // a falha so apareceria no video final, depois do render.
      if (operacao.sourceEndMs > plan.sourceDurationMs) {
        return {
          ok: false,
          erro: `o trecho passa do fim da gravacao (${plan.sourceDurationMs}ms)`,
        };
      }

      // Teto de clipes, o mesmo do schema: recusar aqui da uma
      // mensagem que explica, em vez de um erro de validacao no fim.
      if (clips.length >= 60) {
        return { ok: false, erro: 'a timeline ja tem o maximo de trechos' };
      }

      const clipeNovo = {
        id: livre(operacao.novoClipId, clips, 'ins'),
        sourceStartMs: operacao.sourceStartMs,
        sourceEndMs: operacao.sourceEndMs,
        // Recomposto logo abaixo; o valor aqui e so para satisfazer
        // o tipo.
        timelineStartMs: 0,
        role: operacao.role,
        transcriptSegmentIds: operacao.transcriptSegmentIds,
        semanticRisk: operacao.semanticRisk,
        reason: operacao.reason,
      };

      const comNovo = [...clips];

      if (operacao.aposClipId) {
        const onde = comNovo.findIndex((c) => c.id === operacao.aposClipId);
        if (onde === -1) return { ok: false, erro: 'o trecho de referencia nao existe' };
        comNovo.splice(onde + 1, 0, clipeNovo);
      } else {
        comNovo.push(clipeNovo);
      }

      novo = { ...novo, clips: recomporTimeline(comNovo) };
      break;
    }

    case 'reordenar': {
      const porId = new Map(clips.map((c) => [c.id, c]));
      const reordenados = operacao.clipIds
        .map((id) => porId.get(id))
        .filter((c): c is (typeof clips)[number] => c !== undefined);

      if (reordenados.length !== clips.length) {
        return { ok: false, erro: 'a nova ordem nao inclui todos os trechos' };
      }

      novo = { ...novo, clips: recomporTimeline(reordenados) };
      break;
    }

    case 'editar_legenda': {
      // A correcao ENTRA no plano. Antes este case era um `break`
      // vazio: a operacao era aceita, uma versao era salva, e o
      // render ignorava tudo -- a legenda saia do whisper de novo.
      if (operacao.text.trim() === operacao.original.trim()) {
        return { ok: false, erro: 'a correcao e igual ao original' };
      }

      // Substitui a correcao existente da mesma palavra em vez de
      // empilhar: duas correcoes para a mesma palavra fariam o
      // resultado depender da ordem do array.
      const outras = novo.captions.corrections.filter((c) => c.wordId !== operacao.wordId);

      novo = {
        ...novo,
        captions: {
          ...novo.captions,
          corrections: [
            ...outras,
            {
              wordId: operacao.wordId,
              text: operacao.text.trim(),
              // O original vem da primeira correcao, nao da ultima:
              // corrigir duas vezes nao pode fazer o "original"
              // passar a ser a correcao anterior -- isso apagaria o
              // que o whisper realmente ouviu.
              original:
                novo.captions.corrections.find((c) => c.wordId === operacao.wordId)?.original ??
                operacao.original,
            },
          ],
        },
      };
      break;
    }

    case 'desfazer_correcao': {
      const tinha = novo.captions.corrections.some((c) => c.wordId === operacao.wordId);
      if (!tinha) {
        return { ok: false, erro: 'esta palavra nao tem correcao para desfazer' };
      }

      novo = {
        ...novo,
        captions: {
          ...novo.captions,
          corrections: novo.captions.corrections.filter((c) => c.wordId !== operacao.wordId),
        },
      };
      break;
    }

    case 'trocar_estilo_legenda': {
      // Um estilo do catalogo traz o agrupamento e a posicao para os
      // quais foi desenhado: "Uma palavra" com tres palavras por bloco,
      // embaixo, nao e o estilo que a pessoa viu na amostra. Depois
      // disso, `configurar_legenda` ajusta o que ela quiser.
      const preset = presetDaLegenda(operacao.styleId);
      novo = {
        ...novo,
        captions: {
          ...novo.captions,
          styleId: preset?.id ?? operacao.styleId,
          ...(preset ? { wordsPerBlock: preset.palavrasPorBloco, position: preset.posicao } : {}),
        },
      };
      break;
    }

    case 'trocar_musica': {
      if (operacao.assetId === null) {
        const { music: _removida, ...semMusica } = novo;
        novo = semMusica as EditPlanV1;
      } else {
        novo = {
          ...novo,
          music: {
            assetId: operacao.assetId,
            gainDb: operacao.gainDb ?? -18,
            fadeInMs: novo.music?.fadeInMs ?? 800,
            fadeOutMs: novo.music?.fadeOutMs ?? 1200,
            duckUnderVoice: operacao.duckUnderVoice ?? novo.music?.duckUnderVoice ?? true,
          },
        };
      }
      break;
    }

    case 'configurar_musica': {
      if (!novo.music) return { ok: false, erro: 'o video nao tem trilha de fundo' };
      const { op: _op, ...mudancas } = operacao;
      const definidas = Object.fromEntries(Object.entries(mudancas).filter(([, v]) => v !== undefined));
      novo = { ...novo, music: { ...novo.music, ...definidas } };
      break;
    }

    case 'ajustar_audio_do_clipe': {
      const clip = clips.find((c) => c.id === operacao.clipId);
      if (!clip) return { ok: false, erro: 'clipe nao encontrado' };
      const { op: _op, clipId: _id, ...mudancas } = operacao;
      const audio: Record<string, unknown> = { ...(clip.audio ?? {}) };
      for (const [chave, valor] of Object.entries(mudancas)) {
        if (valor === undefined) continue;
        if (valor === null) delete audio[chave];
        else audio[chave] = valor;
      }
      if (Object.keys(audio).length) clip.audio = audio as NonNullable<typeof clip.audio>;
      else delete clip.audio;
      novo = { ...novo, clips };
      break;
    }

    case 'editar_efeito_sonoro': {
      const efeito = novo.soundEffects.find((e) => e.id === operacao.soundEffectId);
      if (!efeito) return { ok: false, erro: 'efeito sonoro nao encontrado' };
      novo = {
        ...novo,
        soundEffects: novo.soundEffects.map((e) =>
          e.id === operacao.soundEffectId
            ? {
                ...e,
                ...(operacao.timelineStartMs !== undefined ? { timelineStartMs: operacao.timelineStartMs } : {}),
                ...(operacao.gainDb !== undefined ? { gainDb: operacao.gainDb } : {}),
              }
            : e,
        ),
      };
      break;
    }

    case 'configurar_legenda': {
      const { op: _op, ...mudancas } = operacao;
      const captions: Record<string, unknown> = { ...novo.captions };
      for (const [chave, valor] of Object.entries(mudancas)) {
        if (valor === undefined) continue;
        // `null` volta ao valor do estilo: tira a escolha do plano.
        if (valor === null) delete captions[chave];
        else captions[chave] = valor;
      }
      novo = { ...novo, captions: captions as EditPlanV1['captions'] };
      break;
    }

    case 'ocultar_legenda': {
      const ocultas = new Set(novo.captions.hiddenWordIds ?? []);
      operacao.wordIds.forEach((id) => ocultas.add(id));
      novo = { ...novo, captions: { ...novo.captions, hiddenWordIds: [...ocultas].slice(0, 3000) } };
      break;
    }

    case 'restaurar_legenda': {
      const tirar = new Set(operacao.wordIds);
      const restantes = (novo.captions.hiddenWordIds ?? []).filter((id) => !tirar.has(id));
      novo = { ...novo, captions: { ...novo.captions, hiddenWordIds: restantes } };
      break;
    }

    case 'adicionar_legenda': {
      const manuais = novo.captions.manual ?? [];
      if (manuais.length >= 200) return { ok: false, erro: 'o video ja tem o maximo de legendas manuais' };
      novo = {
        ...novo,
        captions: {
          ...novo.captions,
          manual: [
            ...manuais,
            {
              id: livre(operacao.id, novo.captions.manual ?? [], 'lg'),
              timelineStartMs: operacao.timelineStartMs,
              durationMs: operacao.durationMs,
              text: operacao.text,
            },
          ],
        },
      };
      break;
    }

    case 'editar_legenda_manual': {
      const manuais = novo.captions.manual ?? [];
      if (!manuais.some((m) => m.id === operacao.legendaId)) return { ok: false, erro: 'legenda nao encontrada' };
      const { op: _op, legendaId, ...mudancas } = operacao;
      const definidas = Object.fromEntries(Object.entries(mudancas).filter(([, v]) => v !== undefined));
      novo = {
        ...novo,
        captions: { ...novo.captions, manual: manuais.map((m) => (m.id === legendaId ? { ...m, ...definidas } : m)) },
      };
      break;
    }

    case 'remover_legenda_manual': {
      const manuais = novo.captions.manual ?? [];
      if (!manuais.some((m) => m.id === operacao.legendaId)) return { ok: false, erro: 'legenda nao encontrada' };
      novo = { ...novo, captions: { ...novo.captions, manual: manuais.filter((m) => m.id !== operacao.legendaId) } };
      break;
    }

    case 'definir_transicao': {
      const indice = clips.findIndex((c) => c.id === operacao.clipId);
      if (indice === -1) return { ok: false, erro: 'clipe nao encontrado' };
      if (indice === 0) {
        return { ok: false, erro: 'o primeiro trecho nao tem corte antes dele' };
      }
      definirTransicao(transicoesPorClipe, operacao.clipId, operacao.type, operacao.durationMs);
      break;
    }

    case 'transicao_em_todos':
      transicoesPorClipe.clear();
      clips.slice(1).forEach((c) => {
        definirTransicao(transicoesPorClipe, c.id, operacao.type, operacao.durationMs);
      });
      break;

    case 'definir_efeito': {
      const clip = clips.find((c) => c.id === operacao.clipId);
      if (!clip) return { ok: false, erro: 'clipe nao encontrado' };
      if (operacao.effect === 'nenhum') delete clip.effect;
      else clip.effect = operacao.effect;
      break;
    }

    case 'definir_velocidade': {
      const clip = clips.find((c) => c.id === operacao.clipId);
      if (!clip) return { ok: false, erro: 'clipe nao encontrado' };
      // Abaixo de meio segundo na timeline não é um trecho, é um tique.
      if ((clip.sourceEndMs - clip.sourceStartMs) / operacao.speed < 500) {
        return { ok: false, erro: 'rápido demais: o trecho ficaria com menos de meio segundo' };
      }
      if (Math.abs(operacao.speed - 1) < 0.001) delete clip.speed;
      else clip.speed = Math.round(operacao.speed * 100) / 100;
      novo = { ...novo, clips: recomporTimeline(clips) };
      break;
    }

    case 'definir_cor': {
      const clip = clips.find((c) => c.id === operacao.clipId);
      if (!clip) return { ok: false, erro: 'clipe nao encontrado' };
      if (!operacao.color || corEhNeutra(operacao.color)) delete clip.color;
      else clip.color = operacao.color;
      break;
    }

    case 'cor_em_todos':
      for (const clip of clips) {
        if (!operacao.color || corEhNeutra(operacao.color)) delete clip.color;
        else clip.color = operacao.color;
      }
      break;

    case 'definir_abertura':
    case 'definir_encerramento': {
      const campo = operacao.op === 'definir_abertura' ? 'intro' : 'outro';
      if (operacao.assetId === null) {
        const { [campo]: _fora, ...resto } = novo;
        novo = resto as EditPlanV1;
        break;
      }
      const atual = novo[campo];
      const durationMs = operacao.durationMs ?? (atual?.assetId === operacao.assetId ? atual.durationMs : undefined);
      if (!durationMs) return { ok: false, erro: 'a vinheta precisa da duração' };
      novo = { ...novo, [campo]: { assetId: operacao.assetId, durationMs } };
      break;
    }

    case 'configurar_video':
      novo = {
        ...novo,
        render: {
          ...novo.render,
          ...(operacao.fit !== undefined ? { fit: operacao.fit } : {}),
          ...(operacao.voiceEnhance !== undefined ? { voiceEnhance: operacao.voiceEnhance } : {}),
        },
      };
      break;

    case 'adicionar_overlay': {
      if (novo.overlays.length >= 40) {
        return { ok: false, erro: 'o video ja tem o maximo de elementos sobre a imagem' };
      }
      const precisaDeTexto = ['HookTitle', 'CTA', 'LowerThird', 'QuoteCard', 'StatCard', 'Destaque'];
      if (precisaDeTexto.includes(operacao.component) && !operacao.text) {
        return { ok: false, erro: `${operacao.component} precisa de texto` };
      }
      if (['LogoBug', 'ImageOverlay'].includes(operacao.component) && !operacao.assetId) {
        return { ok: false, erro: `${operacao.component} precisa de uma imagem` };
      }
      // Um de cada: dois logos, dois titulos de abertura ou duas
      // barras de progresso no mesmo video sao sempre engano.
      const unicos = ['LogoBug', 'HookTitle', 'ProgressBar'];
      const restantes = unicos.includes(operacao.component)
        ? novo.overlays.filter((o) => o.component !== operacao.component)
        : novo.overlays;
      novo = {
        ...novo,
        overlays: [
          ...restantes,
          {
            id: livre(operacao.id, novo.overlays, 'ov'),
            component: operacao.component,
            ...(operacao.text ? { text: operacao.text } : {}),
            ...(operacao.assetId ? { assetId: operacao.assetId } : {}),
            ...(operacao.variant ? { variant: operacao.variant } : {}),
            ...(operacao.style ? { style: operacao.style } : {}),
            timelineStartMs: operacao.timelineStartMs,
            durationMs: operacao.durationMs,
          },
        ],
      };
      break;
    }

    case 'editar_overlay': {
      const posicaoDo = (e?: EstiloDoTexto) => ({
        ...(e?.x !== undefined ? { x: e.x } : {}),
        ...(e?.y !== undefined ? { y: e.y } : {}),
      });
      const semIndefinidos = (e: EstiloDoTexto) =>
        Object.fromEntries(Object.entries(e).filter(([, v]) => v !== undefined)) as EstiloDoTexto;
      if (!novo.overlays.some((o) => o.id === operacao.overlayId)) {
        return { ok: false, erro: 'elemento nao encontrado' };
      }
      const { op: _op, overlayId, style, replaceStyle, ...mudancas } = operacao;
      const definidas = Object.fromEntries(
        Object.entries(mudancas).filter(([, v]) => v !== undefined),
      );
      novo = {
        ...novo,
        overlays: novo.overlays.map((o) =>
          o.id === overlayId
            ? {
                ...o,
                ...definidas,
                ...(style
                  ? {
                      style: replaceStyle
                        ? { ...posicaoDo(o.style), ...semIndefinidos(style) }
                        : { ...(o.style ?? {}), ...semIndefinidos(style) },
                    }
                  : {}),
              }
            : o,
        ),
      };
      break;
    }

    case 'remover_overlay':
      if (!novo.overlays.some((o) => o.id === operacao.overlayId)) {
        return { ok: false, erro: 'elemento nao encontrado' };
      }
      novo = { ...novo, overlays: novo.overlays.filter((o) => o.id !== operacao.overlayId) };
      break;

    case 'adicionar_efeito_de_tela': {
      const lista = novo.screenEffects ?? [];
      if (lista.length >= 40) return { ok: false, erro: 'o video ja tem o maximo de efeitos de tela' };
      novo = {
        ...novo,
        screenEffects: [
          ...lista,
          {
            id: livre(operacao.id, lista, 'ef'),
            type: operacao.type,
            timelineStartMs: operacao.timelineStartMs,
            durationMs: operacao.durationMs,
            intensity: operacao.intensity ?? definicaoDoEfeitoDeTela(operacao.type)?.intensidadePadrao ?? 0.6,
          },
        ],
      };
      break;
    }

    case 'editar_efeito_de_tela': {
      const lista = novo.screenEffects ?? [];
      const atual = lista.find((e) => e.id === operacao.effectId);
      if (!atual) return { ok: false, erro: 'efeito nao encontrado' };
      novo = {
        ...novo,
        screenEffects: lista.map((e) =>
          e.id === operacao.effectId
            ? {
                ...e,
                ...(operacao.type !== undefined ? { type: operacao.type } : {}),
                ...(operacao.timelineStartMs !== undefined ? { timelineStartMs: operacao.timelineStartMs } : {}),
                ...(operacao.durationMs !== undefined ? { durationMs: operacao.durationMs } : {}),
                ...(operacao.intensity !== undefined ? { intensity: operacao.intensity } : {}),
              }
            : e,
        ),
      };
      break;
    }

    case 'remover_efeito_de_tela': {
      const lista = novo.screenEffects ?? [];
      if (!lista.some((e) => e.id === operacao.effectId)) return { ok: false, erro: 'efeito nao encontrado' };
      const resto = lista.filter((e) => e.id !== operacao.effectId);
      novo = { ...novo, screenEffects: resto };
      if (!resto.length) delete novo.screenEffects;
      break;
    }

    case 'adicionar_midia': {
      const lista = novo.mediaLayers ?? [];
      if (lista.length >= 20) return { ok: false, erro: 'o video ja tem o maximo de midias sobrepostas' };
      const { op: _op, id: pedido, keyframes, ...campos } = operacao;
      novo = { ...novo, mediaLayers: [...lista, { ...campos, ...(keyframes?.length ? { keyframes } : {}), id: livre(pedido, lista, 'md') }] };
      break;
    }

    case 'editar_midia': {
      const lista = novo.mediaLayers ?? [];
      if (!lista.some((m) => m.id === operacao.mediaId)) return { ok: false, erro: 'midia nao encontrada' };
      const { op: _op, mediaId, ...mudancas } = operacao;
      const definidas = Object.fromEntries(Object.entries(mudancas).filter(([, v]) => v !== undefined));
      novo = {
        ...novo,
        mediaLayers: lista.map((m) => {
          if (m.id !== mediaId) return m;
          const nova = { ...m, ...definidas } as typeof m & { keyframes?: unknown };
          // `null` tira os keyframes; lista vazia também.
          if (!nova.keyframes || (Array.isArray(nova.keyframes) && !nova.keyframes.length)) delete nova.keyframes;
          return nova as typeof m;
        }),
      };
      break;
    }

    case 'remover_midia': {
      const lista = novo.mediaLayers ?? [];
      if (!lista.some((m) => m.id === operacao.mediaId)) return { ok: false, erro: 'midia nao encontrada' };
      const resto = lista.filter((m) => m.id !== operacao.mediaId);
      novo = { ...novo, mediaLayers: resto };
      if (!resto.length) delete novo.mediaLayers;
      break;
    }

    case 'adicionar_efeito_sonoro':
      if (novo.soundEffects.length >= 40) {
        return { ok: false, erro: 'o video ja tem o maximo de efeitos sonoros' };
      }
      novo = {
        ...novo,
        soundEffects: [
          ...novo.soundEffects,
          {
            id: livre(operacao.id, novo.soundEffects, 'sf'),
            assetId: operacao.assetId,
            timelineStartMs: operacao.timelineStartMs,
            gainDb: operacao.gainDb ?? -8,
          },
        ],
      };
      break;

    case 'remover_efeito_sonoro':
      novo = {
        ...novo,
        soundEffects:
          operacao.soundEffectId === 'todos'
            ? []
            : novo.soundEffects.filter((e) => e.id !== operacao.soundEffectId),
      };
      break;
  }

  // As transicoes voltam a indice, agora sobre a ordem nova. Uma que
  // apontava para um trecho que saiu da timeline sai junto; uma que
  // caiu no primeiro trecho perde o sentido (nao ha corte antes dele).
  novo = {
    ...novo,
    transitions: novo.clips.flatMap((c, i) => {
      const t = transicoesPorClipe.get(c.id);
      return t && i > 0 ? [{ ...t, beforeClipIndex: i }] : [];
    }),
  };

  // targetDurationMs acompanha os clipes.
  //
  // Encurtar, desativar ou reordenar muda a duracao total, e o schema
  // exige que o campo bata com a soma dos clipes (tolerancia de um
  // frame). Sem recalcular aqui, toda edicao que mexe em duracao
  // seria recusada pela propria validacao -- o campo ficaria falando
  // de um plano que nao existe mais.
  const duracaoAtual = novo.clips.reduce((total, c) => total + duracaoNaTimeline(c), 0);
  novo = { ...novo, targetDurationMs: duracaoAtual };

  // Textos, imagens e efeitos sonoros que ficaram alem do fim (o video
  // encolheu) sao cortados ou saem: no render, um elemento depois do
  // ultimo quadro nao aparece, e na tela ele confundiria.
  novo = {
    ...novo,
    overlays: novo.overlays
      .filter((o) => o.timelineStartMs < duracaoAtual - 100)
      .map((o) =>
        o.timelineStartMs + o.durationMs > duracaoAtual
          ? { ...o, durationMs: duracaoAtual - o.timelineStartMs }
          : o,
      ),
    soundEffects: novo.soundEffects.filter((e) => e.timelineStartMs < duracaoAtual),
  };

  // A mesma porta por onde a proposta da IA passa. Se a edicao do
  // usuario produziu um plano invalido, ela e recusada -- com o
  // motivo, para a interface explicar.
  const validado = editPlanV1Schema.safeParse(novo);
  if (!validado.success) {
    return {
      ok: false,
      erro: validado.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; '),
    };
  }

  return { ok: true, plan: validado.data };
}

/**
 * Reposiciona os clipes em sequencia, sem buracos nem sobreposicao.
 *
 * A timeline do MVP 1 e continua: um corte termina e o proximo
 * comeca. Espaco vazio no meio viraria tela preta no render, que
 * nunca e o que o usuario quis.
 */
function recomporTimeline<T extends { timelineStartMs: number; sourceStartMs: number; sourceEndMs: number; speed?: number | undefined }>(
  clips: readonly T[],
): T[] {
  let posicao = 0;
  return clips.map((clip) => {
    const recomposto = { ...clip, timelineStartMs: posicao };
    posicao += duracaoNaTimeline(clip);
    return recomposto;
  });
}

/** Duracao padrao de cada transicao: rapida o bastante para video falado. */
export const DURACAO_PADRAO_DA_TRANSICAO: Readonly<Record<TipoDeTransicao, number>> = Object.fromEntries(
  TRANSICOES_DO_CATALOGO.map((t) => [t.id, t.duracaoPadraoMs]),
) as Record<TipoDeTransicao, number>;

function definirTransicao(
  mapa: Map<string, EditPlanV1['transitions'][number]>,
  clipId: string,
  tipo: TipoDeTransicao,
  durationMs?: number,
) {
  if (tipo === 'cut') {
    mapa.delete(clipId);
    return;
  }
  mapa.set(clipId, {
    id: `tr-${clipId}`.slice(0, 64),
    type: tipo,
    beforeClipIndex: 0, // recalculado no fim de aplicarOperacao
    durationMs: durationMs ?? DURACAO_PADRAO_DA_TRANSICAO[tipo],
  });
}

/** Id curto e unico o bastante para elementos do plano. */
function novoId(prefixo: string): string {
  return `${prefixo}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** O id pedido, se ainda não existe; senão, um novo. */
function livre(pedido: string | undefined, existentes: ReadonlyArray<{ id: string }>, prefixo: string): string {
  return pedido && !existentes.some((e) => e.id === pedido) ? pedido : novoId(prefixo);
}

/**
 * Dá id às operações que criam algo, ANTES de aplicá-las.
 *
 * O editor aplica a operação na tela e manda a mesma ao servidor, que
 * a aplica de novo. Se cada lado sorteasse o próprio id, o elemento
 * criado teria um id na tela e outro no banco -- e a edição seguinte
 * ("mover o destaque") falharia com "elemento não encontrado". Com o
 * id escolhido aqui e enviado junto, os dois lados criam o mesmo.
 */
export function comIdsNovos<T extends TimelineOperation>(operacao: T): T {
  switch (operacao.op) {
    case 'adicionar_legenda':
      return operacao.id ? operacao : { ...operacao, id: novoId('lg') };
    case 'adicionar_overlay':
      return operacao.id ? operacao : { ...operacao, id: novoId('ov') };
    case 'adicionar_efeito_sonoro':
      return operacao.id ? operacao : { ...operacao, id: novoId('sf') };
    case 'adicionar_efeito_de_tela':
      return operacao.id ? operacao : { ...operacao, id: novoId('ef') };
    case 'adicionar_midia':
      return operacao.id ? operacao : { ...operacao, id: novoId('md') };
    case 'dividir_clipe':
    case 'duplicar_clipe':
    case 'inserir':
      return operacao.novoClipId ? operacao : { ...operacao, novoClipId: novoId('cl') };
    default:
      return operacao;
  }
}

/** Duracao total do plano, somando os clipes ativos. */
export function duracaoDoPlano(plan: EditPlanV1): number {
  return plan.clips.reduce((total, c) => total + duracaoNaTimeline(c), 0);
}

/**
 * Aplica varias operacoes em sequencia.
 *
 * Para na primeira que falhar e devolve o plano ANTERIOR: aplicar
 * metade das mudancas deixaria o usuario com um estado que ele nao
 * pediu e nao consegue explicar.
 */
export function aplicarOperacoes(
  plan: EditPlanV1,
  operacoes: readonly TimelineOperation[],
): ResultadoDaOperacao {
  let atual = plan;

  for (const [indice, operacao] of operacoes.entries()) {
    const resultado = aplicarOperacao(atual, operacao);
    if (!resultado.ok || !resultado.plan) {
      return {
        ok: false,
        erro: `operacao ${indice + 1} (${operacao.op}): ${resultado.erro ?? 'falhou'}`,
      };
    }
    atual = resultado.plan;
  }

  return { ok: true, plan: atual };
}

// ---------- Visao da timeline ----------
//
// O que a interface precisa para desenhar. Derivado do EditPlan --
// nao e estado proprio, senao os dois divergem.
export interface ItemDeTrack {
  id: string;
  track: Track;
  startMs: number;
  endMs: number;
  label: string;
  /** Referencia ao original, para o usuario saber de onde veio. */
  sourceStartMs?: number;
  sourceEndMs?: number;
  semanticRisk?: 'low' | 'medium' | 'high';
}

export function montarVisao(plan: EditPlanV1): Record<Track, ItemDeTrack[]> {
  const visao: Record<Track, ItemDeTrack[]> = {
    video: [],
    text: [],
    assets: [],
    music: [],
    effects: [],
  };

  for (const clip of plan.clips) {
    const duracao = duracaoNaTimeline(clip);
    visao.video.push({
      id: clip.id,
      track: 'video',
      startMs: clip.timelineStartMs,
      endMs: clip.timelineStartMs + duracao,
      label: clip.role,
      sourceStartMs: clip.sourceStartMs,
      sourceEndMs: clip.sourceEndMs,
      // A interface destaca o risco: trecho de risco alto exige
      // confirmacao antes do render (plano, secao 9.3).
      semanticRisk: clip.semanticRisk,
    });
  }

  for (const overlay of plan.overlays) {
    visao.assets.push({
      id: overlay.id,
      track: 'assets',
      startMs: overlay.timelineStartMs,
      endMs: overlay.timelineStartMs + overlay.durationMs,
      label: overlay.component,
    });
  }

  if (plan.music) {
    visao.music.push({
      id: plan.music.assetId,
      track: 'music',
      startMs: 0,
      endMs: duracaoDoPlano(plan),
      label: 'trilha',
    });
  }

  for (const efeito of plan.soundEffects) {
    visao.effects.push({
      id: efeito.id,
      track: 'effects',
      startMs: efeito.timelineStartMs,
      endMs: efeito.timelineStartMs + 500,
      label: 'efeito',
    });
  }

  return visao;
}
