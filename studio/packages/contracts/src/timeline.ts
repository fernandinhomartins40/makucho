// ============================================================
// MAKUCHO STUDIO - Timeline editavel
//
// ADR 0008: antecipada do MVP 2 para o MVP 1.
//
// A timeline NAO e um editor livre. Ela ajusta a proposta que a IA
// fez -- mover, encurtar, desativar e reordenar clipes que JA
// existem no EditPlan. Nao ha "adicionar clipe do nada", porque
// toda fala precisa vir do video original (regra de integridade
// editorial, contexto mestre secao 5).
//
// Toda operacao produz um EditPlan novo, validado pelo mesmo schema
// de sempre. A timeline nao tem um caminho mais permissivo que o da
// IA: as duas passam pela mesma porta.
// ============================================================

import { z } from 'zod';
import { editPlanV1Schema } from './edit-plan';
import type { EditPlanV1 } from './edit-plan';

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
});

export const timelineOperationSchema = z
  .discriminatedUnion('op', [
    moverClipeSchema,
    ajustarCorteSchema,
    alternarClipeSchema,
    dividirClipeSchema,
    duplicarClipeSchema,
    reordenarSchema,
    editarLegendaSchema,
    desfazerCorrecaoSchema,
    trocarEstiloLegendaSchema,
    trocarMusicaSchema,
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
        id: `${clip.id}-b${Date.now().toString(36)}`,
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

      const copia = { ...clip, id: `${clip.id}-c${Date.now().toString(36)}` };
      const comCopia = [...clips];
      comCopia.splice(indice + 1, 0, copia);
      novo = { ...novo, clips: recomporTimeline(comCopia) };
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

    case 'trocar_estilo_legenda':
      novo = { ...novo, captions: { ...novo.captions, styleId: operacao.styleId } };
      break;

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
            duckUnderVoice: novo.music?.duckUnderVoice ?? true,
          },
        };
      }
      break;
    }
  }

  // targetDurationMs acompanha os clipes.
  //
  // Encurtar, desativar ou reordenar muda a duracao total, e o schema
  // exige que o campo bata com a soma dos clipes (tolerancia de um
  // frame). Sem recalcular aqui, toda edicao que mexe em duracao
  // seria recusada pela propria validacao -- o campo ficaria falando
  // de um plano que nao existe mais.
  const duracaoAtual = novo.clips.reduce(
    (total, c) => total + (c.sourceEndMs - c.sourceStartMs),
    0,
  );
  novo = { ...novo, targetDurationMs: duracaoAtual };

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
function recomporTimeline<T extends { timelineStartMs: number; sourceStartMs: number; sourceEndMs: number }>(
  clips: readonly T[],
): T[] {
  let posicao = 0;
  return clips.map((clip) => {
    const recomposto = { ...clip, timelineStartMs: posicao };
    posicao += clip.sourceEndMs - clip.sourceStartMs;
    return recomposto;
  });
}

/** Duracao total do plano, somando os clipes ativos. */
export function duracaoDoPlano(plan: EditPlanV1): number {
  return plan.clips.reduce((total, c) => total + (c.sourceEndMs - c.sourceStartMs), 0);
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
    const duracao = clip.sourceEndMs - clip.sourceStartMs;
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
