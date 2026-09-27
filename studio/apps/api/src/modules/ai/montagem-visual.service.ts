// ============================================================
// Montagem pelas CENAS (vídeo sem narração).
//
// O caminho da montagem quando o áudio não guia o corte: produto,
// vitrine, promoção, bastidores -- com música, som ambiente ou mudo.
//
//   cenas (worker de mídia) -> visão (o que cada quadro mostra, se
//   presta) -> DeepSeek (escolhe, ordena, escreve os textos) ->
//   compilador (montagem-visual.ts) -> EditPlan
//
// Sem montagem por regra no lugar da IA: se a IA falhar, a proposta
// tenta de novo com ela (proposta.service) e, no fim, mostra o motivo.
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import {
  RAMOS,
  RECEITAS,
  ROTULO_DO_AUDIO,
  VISUAL_RUIM,
  cenasDosCortes,
  compilarMontagemVisual,
  lerPropostaVisual,
  perfilDoAudioSchema,
  ramoOuOutro,
  tipoDeVideoPadrao,
} from '@makucho/studio-contracts';
import type { CenaDoVideo, EditPlanV1, PerfilDoAudio, PropostaVisual, RamoDeNegocio, SegmentoDaTranscricao, TipoDeVideo } from '@makucho/studio-contracts';
import { PrismaService } from '../../common/prisma.service';
import { StorageService } from '../../common/storage.service';
import { VisaoService } from '../banco-de-midia/visao/visao.service';
import { AcabamentoService } from './acabamento.service';
import { AiService } from './ai.service';
import { PromptsService } from './prompts.service';

export type ResultadoDaMontagemVisual =
  | {
      ok: true;
      plano: EditPlanV1;
      avisos: string[];
      /** "ia" quando o modelo montou; "automatica" quando foi por regra. */
      origem: 'ia' | 'automatica';
      /** Por que a IA não montou (só com origem automática). */
      motivo?: string;
      tipo: TipoDeVideo;
      resumoDaIa?: string;
    }
  | { ok: false; erro: string };

@Injectable()
export class MontagemVisualService {
  private readonly log = new Logger(MontagemVisualService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly prompts: PromptsService,
    private readonly acabamento: AcabamentoService,
    private readonly visao: VisaoService,
    private readonly storage: StorageService,
  ) {}

  async montar(workspaceId: string, projectId: string, opcoes: { semCache?: boolean; comIa?: boolean } = {}): Promise<ResultadoDaMontagemVisual> {
    const [projeto, workspace, original, transcricao] = await Promise.all([
      this.prisma.project.findUnique({
        where: { id: projectId },
        select: { title: true, objective: true, videoKind: true, contentBrief: true, audioProfile: true, targetDurationMs: true },
      }),
      this.prisma.workspace.findUnique({ where: { id: workspaceId }, select: { businessType: true } }),
      this.prisma.mediaSource.findFirst({ where: { projectId, kind: 'ORIGINAL' }, orderBy: { createdAt: 'desc' } }),
      this.prisma.transcription.findUnique({
        where: { projectId },
        include: {
          segments: { orderBy: { position: 'asc' }, include: { words: { select: { confidence: true } } } },
          regions: { where: { kind: 'scene' }, orderBy: { startMs: 'asc' } },
        },
      }),
    ]);
    if (!projeto || !original?.durationMs) return { ok: false, erro: 'o vídeo original não foi encontrado' };
    const duracao = original.durationMs;

    const audioLido = perfilDoAudioSchema.safeParse(projeto.audioProfile);
    const audio: PerfilDoAudio | null = audioLido.success ? audioLido.data : null;
    const ramo = ramoOuOutro(workspace?.businessType);
    const resumo = projeto.contentBrief ?? projeto.objective ?? null;
    const tipo = tipoDeVideoPadrao({ escolhido: projeto.videoKind, audio, resumo, ramo });

    const segmentos: SegmentoDaTranscricao[] = (transcricao?.segments ?? []).map((s) => ({
      id: s.id,
      startMs: s.startMs,
      endMs: s.endMs,
      text: s.text,
      minWordConfidence: s.words.length ? Math.min(...s.words.map((w) => w.confidence)) : (s.confidence ?? 1),
    }));

    // ---------- As cenas ----------
    const regioes = (transcricao?.regions ?? []).filter((r) => r.endMs > r.startMs && r.startMs < duracao);
    const base = regioes.length
      ? regioes.map((r) => ({ inicioMs: r.startMs, fimMs: Math.min(r.endMs, duracao), quadro: (r.metadata as { quadro?: string } | null)?.quadro }))
      : cenasDosCortes([], duracao).map((c) => ({ ...c, quadro: undefined }));
    const cenas: CenaDoVideo[] = base.map((c, i) => {
      const fala = segmentos
        .filter((s) => Math.min(s.endMs, c.fimMs) - Math.max(s.startMs, c.inicioMs) > 200)
        .map((s) => s.text)
        .join(' ')
        .slice(0, 140);
      return { indice: i, inicioMs: c.inicioMs, fimMs: c.fimMs, ...(fala ? { fala } : {}) };
    });
    await this.olhar(cenas, base.map((c) => c.quadro), ramo);

    // ---------- A IA monta (sem ela, não há montagem: é uma ferramenta de IA) ----------
    const acabamento = await this.acabamento.contexto(workspaceId);
    const r = await this.pedirAIa({ workspaceId, projectId, cenas, tipo, ramo, audio, resumo, titulo: projeto.title, duracao, temTrilha: Boolean(acabamento?.musicaAssetId), temLogo: Boolean(acabamento?.logoAssetId), semCache: Boolean(opcoes.semCache) });
    if (!r.ok) return { ok: false, erro: r.erro };
    const proposta = r.proposta;
    const compilado = compilarMontagemVisual({ proposta, cenas, projectId, sourceMediaId: original.id, sourceDurationMs: duracao, tipo, audio, segmentos, ...(acabamento ? { acabamento } : {}) });
    if (!compilado.ok) {
      this.log.warn(`montagem pelas cenas da IA recusada no projeto ${projectId}: ${compilado.erro}`);
      return { ok: false, erro: `a proposta da IA não pôde ser usada (${compilado.erro})` };
    }

    const avisos = [
      `${audio ? ROTULO_DO_AUDIO[audio.tipo] : 'Sem narração'}: o vídeo foi montado pelas cenas (${RECEITAS[tipo].rotulo.toLowerCase()}).`,
      ...compilado.avisos,
    ];
    return {
      ok: true,
      plano: compilado.plano,
      avisos,
      origem: 'ia',
      tipo,
      ...(proposta.analysis?.topic ? { resumoDaIa: proposta.analysis.topic } : {}),
    };
  }

  /**
   * As cenas do vídeo com o que a visão viu em cada uma (o agente usa
   * para "olhar" o vídeo antes de decidir).
   */
  async cenasDescritas(workspaceId: string, projectId: string): Promise<CenaDoVideo[]> {
    const [workspace, original, transcricao] = await Promise.all([
      this.prisma.workspace.findUnique({ where: { id: workspaceId }, select: { businessType: true } }),
      this.prisma.mediaSource.findFirst({ where: { projectId, kind: 'ORIGINAL' }, orderBy: { createdAt: 'desc' } }),
      this.prisma.transcription.findUnique({
        where: { projectId },
        include: { segments: { orderBy: { position: 'asc' } }, regions: { where: { kind: 'scene' }, orderBy: { startMs: 'asc' } } },
      }),
    ]);
    const duracao = original?.durationMs ?? 0;
    if (!duracao) return [];
    const regioes = (transcricao?.regions ?? []).filter((r) => r.endMs > r.startMs && r.startMs < duracao);
    const base = regioes.length
      ? regioes.map((r) => ({ inicioMs: r.startMs, fimMs: Math.min(r.endMs, duracao), quadro: (r.metadata as { quadro?: string } | null)?.quadro }))
      : cenasDosCortes([], duracao).map((c) => ({ ...c, quadro: undefined }));
    const cenas: CenaDoVideo[] = base.map((c, i) => {
      const fala = (transcricao?.segments ?? [])
        .filter((s) => Math.min(s.endMs, c.fimMs) - Math.max(s.startMs, c.inicioMs) > 200)
        .map((s) => s.text)
        .join(' ')
        .slice(0, 140);
      return { indice: i, inicioMs: c.inicioMs, fimMs: c.fimMs, ...(fala ? { fala } : {}) };
    });
    await this.olhar(cenas, base.map((c) => c.quadro), ramoOuOutro(workspace?.businessType));
    return cenas;
  }

  /** A visão olha o quadro de cada cena: o que mostra e se presta. */
  private async olhar(cenas: CenaDoVideo[], quadros: ReadonlyArray<string | undefined>, ramo: RamoDeNegocio) {
    const arquivos = await Promise.all(quadros.map((q) => (q ? this.storage.ler(q).catch(() => null) : Promise.resolve(null))));
    const comArquivo = arquivos.flatMap((b, i) => (b ? [{ b, i }] : []));
    if (!comArquivo.length) return;
    const rotulos = [...RAMOS[ramo].vocabularioVisual, ...VISUAL_RUIM];
    const vistos = await this.visao.olharQuadros(comArquivo.map((x) => x.b), rotulos).catch(() => null);
    if (!vistos) return;
    const nitidezes = vistos.flatMap((v) => (v ? [v.nitidez] : [])).sort((a, b) => a - b);
    const mediana = nitidezes[Math.floor(nitidezes.length / 2)] ?? 0;
    const ruins = new Set<string>(VISUAL_RUIM);
    comArquivo.forEach(({ i }, j) => {
      const v = vistos[j];
      if (!v) return;
      const cena = cenas[i]!;
      const topo = v.rotulos[0];
      cena.rotulos = v.rotulos.filter((r) => !ruins.has(r.texto) && r.nota >= 8);
      cena.nitidez = v.nitidez;
      // Escuro, tremido (bem abaixo do resto do vídeo) ou "chão".
      cena.ruim = v.brilho < 35 || (mediana > 0 && v.nitidez < mediana * 0.35) || Boolean(topo && ruins.has(topo.texto) && topo.nota >= 50);
    });
  }

  private async pedirAIa(e: {
    workspaceId: string;
    projectId: string;
    cenas: readonly CenaDoVideo[];
    tipo: TipoDeVideo;
    ramo: RamoDeNegocio;
    audio: PerfilDoAudio | null;
    resumo: string | null;
    titulo: string | null;
    duracao: number;
    temTrilha: boolean;
    temLogo: boolean;
    semCache: boolean;
  }): Promise<{ ok: true; proposta: PropostaVisual } | { ok: false; erro: string }> {
    const receita = RECEITAS[e.tipo];
    const alvo = Math.min(receita.duracaoAlvoMs, Math.round(e.duracao * 0.9));
    const titulo = e.titulo && !/^vídeo sem título$/i.test(e.titulo) ? e.titulo : null;
    const linhas = e.cenas.map((c) => {
      const vistos = c.rotulos?.length ? c.rotulos.map((r) => `${r.texto} ${r.nota}%`).join(', ') : 'sem leitura da visão';
      const qualidade = c.ruim ? 'RUIM (tremida, escura ou sem assunto)' : 'boa';
      return `#${c.indice} [${c.inicioMs}–${c.fimMs}] ${vistos} · ${qualidade}${c.fala ? ` · fala: "${c.fala}"` : ''}`;
    });
    const usuario = [
      `Tipo de vídeo: ${receita.rotulo}. ${receita.orientacao}`,
      `Ramo do negócio: ${RAMOS[e.ramo].rotulo}. Chamada padrão: "${RAMOS[e.ramo].chamadaPadrao}".`,
      `Áudio: ${e.audio ? ROTULO_DO_AUDIO[e.audio.tipo] : 'sem narração'}.`,
      `Duração alvo: ${Math.round(alvo / 1000)} s (gravado: ${Math.round(e.duracao / 1000)} s). Ritmo: ~${(receita.cenaMediaMs / 1000).toFixed(1)} s por cena.`,
      `Textos na tela: ${receita.textosNaTela ? 'sim' : 'não (deixe texts vazio)'}.`,
      `Kit de marca: ${e.temTrilha ? 'tem trilha' : 'sem trilha'}; ${e.temLogo ? 'tem logo no canto' : 'sem logo'}.`,
      ...(titulo ? [`Título do projeto: ${titulo}`] : []),
      e.resumo ? `O que tem neste vídeo (escrito por quem gravou): "${e.resumo.replace(/\s+/g, ' ').slice(0, 400)}"` : 'Resumo: não informado (não invente preço, oferta nem nome de produto).',
      '',
      'Cenas (#índice [início–fim em ms] o que a visão viu · qualidade · fala):',
      ...linhas,
    ].join('\n');

    const { texto: sistema, versao } = this.prompts.obter('montar_por_cenas');
    try {
      const resposta = await this.ai.chamar({
        workspaceId: e.workspaceId,
        projectId: e.projectId,
        chamada: 'montar_por_cenas',
        sistema,
        usuario,
        maxTokens: 8000,
        promptVersion: versao,
        semCache: e.semCache,
        raciocinio: 'desligado',
      });
      const lida = lerPropostaVisual(resposta.texto);
      await this.ai.concluirAnalise(e.projectId, lida.ok, lida.ok ? undefined : lida.erro);
      if (!lida.ok) {
        this.log.warn(`montagem pelas cenas ilegível no projeto ${e.projectId}: ${lida.erro}`);
        return { ok: false, erro: 'a IA devolveu uma resposta que não pôde ser lida' };
      }
      return lida;
    } catch (err) {
      const publico =
        err && typeof err === 'object' && 'publico' in err ? String((err as { publico: unknown }).publico) : err instanceof Error ? err.message : 'a IA falhou';
      return { ok: false, erro: publico };
    }
  }
}
