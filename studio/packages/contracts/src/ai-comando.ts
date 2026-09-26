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

import { duracaoNaTimeline } from './edit-plan';
import { z } from 'zod';
import type { EditPlanV1, EstiloDoTexto } from './edit-plan';
import { FONTES_DE_VIDEO, PRESETS_DE_LEGENDA } from './estilos-de-legenda';
import { aplicarOperacao, timelineOperationSchema } from './timeline';
import type { TimelineOperation } from './timeline';
import { ANIMACOES_DURANTE, ENTRADAS_DE_TEXTO, PRESETS_DE_TEXTO, SAIDAS_DE_TEXTO, TEXTOS_DE_TELA } from './textos-de-tela';
import { PACOTES_DE_ESTILO, operacoesDoPacote } from './pacotes';
import type { PacoteSalvo } from './pacotes';
import { STICKERS, definicaoDoSticker } from './stickers';
import { EFEITOS_DE_TELA } from './efeitos-de-tela';
import { APARENCIAS } from './cor';
import { SONS_EMBUTIDOS } from './sons';
import { LAYOUTS_DE_MIDIA, MOLDURAS } from './midias';
import { TRANSICOES_DO_CATALOGO } from './transicoes';
import { ENTRADAS_DE_MIDIA, LOOPS_DE_MIDIA, SAIDAS_DE_MIDIA } from './animacao-da-midia';
import type { IntervaloDeFala } from './protecao-da-fala';
import { ehEfeitoSonoroEmbutido } from './edit-plan';

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
  'configurar_musica',
  'ajustar_audio_do_clipe',
  'editar_efeito_sonoro',
  'configurar_legenda',
  'definir_transicao',
  'transicao_em_todos',
  'definir_efeito',
  'definir_velocidade',
  'configurar_video',
  'adicionar_overlay',
  'editar_overlay',
  'remover_overlay',
  'adicionar_efeito_sonoro',
  'remover_efeito_sonoro',
  // Cor, efeitos de tela, stickers e legendas escritas à mão: tudo o que
  // a pessoa faz por clique, a IA pode fazer por pedido.
  'definir_cor',
  'cor_em_todos',
  'adicionar_efeito_de_tela',
  'editar_efeito_de_tela',
  'remover_efeito_de_tela',
  'adicionar_midia',
  'editar_midia',
  'remover_midia',
  'adicionar_legenda',
  'editar_legenda_manual',
  'remover_legenda_manual',
  // Vinhetas da biblioteca da marca.
  'definir_abertura',
  'definir_encerramento',
] as const;

// ---------- Atalhos (macros) ----------
//
// Operações que o SERVIDOR expande em várias da timeline. Existem por
// economia e por qualidade: em vez de a IA escrever um estilo inteiro
// (20 campos, fácil de errar) para cada texto, ela diz "estilo pronto X
// nos textos" e o código aplica exatamente o que o botão aplicaria.

/** Um estilo pronto de texto (PRESETS_DE_TEXTO) num texto, num tipo ou em todos. */
export const macroEstiloDeTextoSchema = z
  .object({
    op: z.literal('estilo_de_texto'),
    /** Id de um elemento, um componente (HookTitle, CTA...) ou "todos". */
    alvo: z.string().min(1).max(64),
    preset: z.string().min(1).max(40),
    /** Por cima do estilo pronto (ex.: a cor da marca no fundo). */
    ajustes: z
      .object({
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        bgColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        outlineColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        fontId: z.string().max(40).optional(),
        sizeScale: z.number().min(0.4).max(3).optional(),
        uppercase: z.boolean().optional(),
        entrada: z.enum(ENTRADAS_DE_TEXTO).optional(),
        saida: z.enum(SAIDAS_DE_TEXTO).optional(),
        durante: z.enum(ANIMACOES_DURANTE).optional(),
        atras: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

/** Um pacote de estilo inteiro (legenda, transições, zoom, cor, efeitos, sons). */
export const macroAplicarPacoteSchema = z
  .object({
    op: z.literal('aplicar_pacote'),
    id: z.string().min(1).max(64),
  })
  .strict();

export const macroDoComandoSchema = z.discriminatedUnion('op', [macroEstiloDeTextoSchema, macroAplicarPacoteSchema]);
export type MacroDoComando = z.infer<typeof macroDoComandoSchema>;
export type OperacaoDoComando = TimelineOperation | MacroDoComando;

const ehMacro = (o: OperacaoDoComando): o is MacroDoComando => o.op === 'estilo_de_texto' || o.op === 'aplicar_pacote';

/** O que a pessoa está vendo no editor: dá sentido a "isso", "aqui", "agora". */
export const contextoDoComandoSchema = z
  .object({
    selecionado: z
      .object({ tipo: z.string().max(20), id: z.string().max(64) })
      .strict()
      .optional(),
    cursorMs: z.number().int().min(0).max(3_600_000).optional(),
    /** A troca anterior: permite responder "sim", "todos", "o primeiro". */
    anterior: z
      .object({ pedido: z.string().max(500), resposta: z.string().max(600) })
      .strict()
      .optional(),
  })
  .strict();

export type ContextoDoComando = z.infer<typeof contextoDoComandoSchema>;

export const pedidoDeComandoSchema = z
  .object({
    texto: z.string().trim().min(2).max(500),
    contexto: contextoDoComandoSchema.optional(),
  })
  .strict();

export const respostaDoComandoSchema = z
  .object({
    schemaVersion: z.literal('1.0'),
    // Desconhecidas aqui: cada uma e validada sozinha logo abaixo, e a
    // invalida sai sem derrubar as outras.
    operations: z.array(z.unknown()).max(40),
    reply: z.string().max(600),
  })
  .strict();

export type LeituraDoComando =
  | { ok: true; operacoes: OperacaoDoComando[]; resposta: string; ignoradas: string[] }
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
  const operacoes: OperacaoDoComando[] = [];
  const ignoradas: string[] = [];

  for (const bruta of lido.data.operations) {
    const macro = macroDoComandoSchema.safeParse(bruta);
    if (macro.success) {
      operacoes.push(macro.data);
      continue;
    }
    const op = timelineOperationSchema.safeParse(bruta);
    if (!op.success) {
      ignoradas.push(descrever(bruta, op.error.issues[0]?.message ?? 'formato inválido'));
      continue;
    }
    if (!permitidas.has(op.data.op)) {
      ignoradas.push(`${op.data.op}: não pode ser pedido por comando`);
      continue;
    }
    // Sticker só do catálogo: o id vira nome de arquivo no render. Os
    // arquivos do workspace (fotos, vídeos, sons, vinhetas) são
    // conferidos contra a biblioteca da marca em `aplicarComando`.
    if (op.data.op === 'adicionar_midia' && op.data.kind === 'sticker' && !definicaoDoSticker(op.data.assetId)) {
      ignoradas.push(`adicionar_midia: o sticker "${op.data.assetId}" não existe`);
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
/** O som do trecho em poucas letras: "mudo", "+3dB J800", "-". */
function somDoTrecho(a: EditPlanV1['clips'][number]['audio']): string {
  if (!a) return '-';
  if (a.muted) return 'mudo';
  const partes = [
    a.gainDb ? `${a.gainDb > 0 ? '+' : ''}${a.gainDb}dB` : '',
    a.leadMs ? `J${a.leadMs}` : '',
    a.tailMs ? `L${a.tailMs}` : '',
    a.fadeInMs ? `in${a.fadeInMs}` : '',
    a.fadeOutMs ? `out${a.fadeOutMs}` : '',
  ].filter(Boolean);
  return partes.join(' ') || '-';
}

/**
 * Um arquivo da biblioteca da marca, como a IA o vê: tipo, nome e para
 * que serve (escrito pela pessoa no Kit de marca). Sem o arquivo em si
 * -- a IA escolhe pela descrição, e o servidor confere o id.
 */
export interface ItemDaBibliotecaDaMarca {
  assetId: string;
  /** AssetKind: LOGO, LOGO_NEGATIVE, MUSIC, SOUND_EFFECT, INTRO... */
  tipo: string;
  nome: string;
  uso?: string;
  duracaoMs?: number | null;
  /**
   * O pedido que gerou o arquivo (kit criativo: o estilo da trilha no
   * Suno, a cena do vídeo): diz à IA como ele é, sem ela ouvir ou ver.
   */
  criadoCom?: string;
}

const NOME_DO_TIPO: Record<string, string> = {
  LOGO: 'logo principal',
  LOGO_NEGATIVE: 'logo para fundo escuro',
  LOGO_COMPACT: 'ícone da marca',
  WATERMARK: "marca d'água",
  IMAGE: 'imagem',
  VIDEO: 'vídeo',
  MUSIC: 'trilha',
  SOUND_EFFECT: 'som',
  INTRO: 'vinheta de abertura',
  OUTRO: 'vinheta de encerramento',
};

export interface RecursosDoResumo {
  /** O que a marca guarda para a IA usar. */
  biblioteca?: readonly ItemDaBibliotecaDaMarca[];
  temLogo?: boolean;
  temMusica?: boolean;
  logoAssetId?: string | null;
  musicaAssetId?: string | null;
  /** Estilos que a pessoa salvou no Kit de marca. */
  pacotesSalvos?: readonly PacoteSalvo[];
  /** Cores da marca (primária, destaque...), para textos coerentes. */
  coresDaMarca?: Readonly<Record<string, string>>;
  contexto?: ContextoDoComando;
}

/** O estilo de um texto de tela em poucas letras. */
function estiloCurto(e: EstiloDoTexto | undefined): string {
  if (!e) return 'padrão';
  const partes = [
    e.preset ? `preset=${e.preset}` : '',
    e.fontId ? `fonte=${e.fontId}` : '',
    e.color ? `cor=${e.color}` : '',
    e.bgShape && e.bgShape !== 'nenhum' ? `fundo=${e.bgShape}${e.bgColor ?? ''}` : '',
    e.outlineWidth ? `contorno=${e.outlineWidth}` : '',
    e.sizeScale && e.sizeScale !== 1 ? `tam=${e.sizeScale}` : '',
    e.entrada && e.entrada !== 'nenhuma' ? `entra=${e.entrada}` : '',
    e.durante && e.durante !== 'nenhuma' ? `durante=${e.durante}` : '',
    e.saida && e.saida !== 'nenhuma' ? `sai=${e.saida}` : '',
    e.atras ? 'atrás' : '',
    e.x !== undefined || e.y !== undefined ? `pos=${(e.x ?? 0.5).toFixed(2)},${(e.y ?? 0.5).toFixed(2)}` : '',
    e.keyframes?.length ? `keyframes=${e.keyframes.length}` : '',
  ].filter(Boolean);
  return partes.join(' ') || 'padrão';
}

const curto = (t: string, n: number) => {
  const limpo = t.replace(/\s+/g, ' ').trim();
  return limpo.length > n ? `${limpo.slice(0, n - 1)}…` : limpo;
};

export function resumoDoPlanoParaIa(
  plano: EditPlanV1,
  falas: Readonly<Record<string, string>> = {},
  recursos: RecursosDoResumo = {},
): string {
  const seg = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
  const total = plano.clips.reduce((t, c) => t + duracaoNaTimeline(c), 0);
  const transicaoAntes = new Map(plano.transitions.map((t) => [t.beforeClipIndex, t.type]));
  const c = plano.captions;
  const extrasDaLegenda = [
    c.fontId ? `fonte=${c.fontId}` : '',
    c.color ? `cor=${c.color}` : '',
    c.highlightColor ? `cor_destaque=${c.highlightColor}` : '',
    c.blockEntrance ? `entrada=${c.blockEntrance}` : '',
    c.y !== undefined ? `y=${c.y}` : '',
    c.manual?.length ? `${c.manual.length} escritas à mão` : '',
    c.hiddenWordIds?.length ? `${c.hiddenWordIds.length} palavras ocultas` : '',
  ].filter(Boolean);

  const linhas = [
    `Duração: ${seg(total)} | original ${seg(plano.sourceDurationMs)} | formato ${plano.canvas.aspectRatio}`,
    `Legenda (da fala): ${c.enabled ? 'ligada' : 'desligada'}, estilo=${c.styleId}, ${c.wordsPerBlock} palavras/bloco, posição=${c.position}, destaque=${c.highlightActiveWord ? 'sim' : 'não'}, tamanho=${c.sizeScale ?? 1}${extrasDaLegenda.length ? `, ${extrasDaLegenda.join(', ')}` : ''}`,
    `Vídeo: enquadramento=${plano.render.fit ?? 'ajustar'}, voz_limpa=${plano.render.voiceEnhance ? 'sim' : 'não'}`,
    `Música: ${plano.music ? `sim (${plano.music.gainDb}dB, assetId=${plano.music.assetId})` : 'não'}${recursos.musicaAssetId ? ` | trilha da marca: assetId=${recursos.musicaAssetId}` : ' | a marca não tem trilha'}`,
    `Logo da marca: ${recursos.logoAssetId ? `assetId=${recursos.logoAssetId}` : 'não cadastrado'}`,
  ];
  if (recursos.coresDaMarca && Object.keys(recursos.coresDaMarca).length) {
    linhas.push(`Cores da marca: ${Object.entries(recursos.coresDaMarca).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  }
  if (recursos.biblioteca?.length) {
    linhas.push('', 'Biblioteca da marca (assetId|tipo|nome|para que serve|duração|como é: o pedido que o gerou):');
    for (const b of recursos.biblioteca.slice(0, 60)) {
      linhas.push(
        [
          b.assetId,
          NOME_DO_TIPO[b.tipo] ?? b.tipo,
          `"${curto(b.nome, 40)}"`,
          b.uso ? `"${curto(b.uso, 100)}"` : '-',
          b.duracaoMs ? seg(b.duracaoMs) : '-',
          b.criadoCom ? `"${curto(b.criadoCom, 160)}"` : '-',
        ].join('|'),
      );
    }
    if (plano.intro || plano.outro) {
      linhas.push(`Vinhetas no vídeo: abertura=${plano.intro?.assetId ?? 'nenhuma'}, encerramento=${plano.outro?.assetId ?? 'nenhum'}`);
    }
  }
  if (recursos.pacotesSalvos?.length) {
    linhas.push(`Estilos salvos da pessoa (aplicar_pacote): ${recursos.pacotesSalvos.map((p) => `${p.id}="${p.rotulo}"`).join(', ')}`);
  }

  linhas.push('', 'Trechos (id|papel|início|duração|origem no bruto|zoom|transição antes|cor|som|fala):');
  let inicio = 0;
  plano.clips.forEach((clip, i) => {
    const duracao = duracaoNaTimeline(clip);
    const cor = clip.color ? `${clip.color.look ?? 'ajuste'}${clip.color.intensity !== undefined ? `:${clip.color.intensity}` : ''}` : '-';
    linhas.push(
      [
        clip.id,
        clip.role,
        seg(inicio),
        seg(duracao),
        `${clip.sourceStartMs}-${clip.sourceEndMs}ms${clip.speed && clip.speed !== 1 ? ` a ${clip.speed}x` : ''}`,
        clip.effect ?? '-',
        transicaoAntes.get(i) ?? '-',
        cor,
        somDoTrecho(clip.audio),
        `"${curto(falas[clip.id] ?? '', 90)}"`,
      ].join('|'),
    );
    inicio += duracao;
  });

  if (plano.overlays.length) {
    linhas.push('', 'Elementos na tela (id|tipo|início|duração|texto|estilo):');
    for (const o of plano.overlays) {
      const ehTexto = (TEXTOS_DE_TELA as readonly string[]).includes(o.component);
      linhas.push(
        [o.id, o.component, seg(o.timelineStartMs), seg(o.durationMs), `"${curto(o.text ?? o.variant ?? '', 60)}"`, ehTexto ? estiloCurto(o.style) : '-'].join('|'),
      );
    }
  } else {
    linhas.push('', 'Elementos na tela: nenhum');
  }

  if (plano.screenEffects?.length) {
    linhas.push(
      '',
      `Efeitos de tela (id|tipo|início|duração|intensidade): ${plano.screenEffects.map((e) => `${e.id}|${e.type}|${seg(e.timelineStartMs)}|${seg(e.durationMs)}|${e.intensity ?? '-'}`).join('; ')}`,
    );
  }
  if (plano.mediaLayers?.length) {
    linhas.push(
      '',
      `Mídias e stickers (id|tipo:asset|layout|início|duração): ${plano.mediaLayers.map((m) => `${m.id}|${m.kind}:${m.assetId}|${m.layout}|${seg(m.timelineStartMs)}|${seg(m.durationMs)}`).join('; ')}`,
    );
  }
  if (plano.soundEffects.length) {
    linhas.push('', `Efeitos sonoros (id|som|início|dB): ${plano.soundEffects.map((s) => `${s.id}|${s.assetId}|${seg(s.timelineStartMs)}|${s.gainDb}`).join('; ')}`);
  }
  if (c.manual?.length) {
    linhas.push('', `Legendas escritas à mão (id|início|texto): ${c.manual.slice(0, 12).map((m) => `${m.id}|${seg(m.timelineStartMs)}|"${curto(m.text, 40)}"`).join('; ')}`);
  }

  const ctx = recursos.contexto;
  if (ctx?.selecionado || ctx?.cursorMs !== undefined) {
    linhas.push('');
    if (ctx.selecionado) linhas.push(`Selecionado na timeline: ${ctx.selecionado.tipo} ${ctx.selecionado.id} ("isso", "esse", "este" = ele)`);
    if (ctx.cursorMs !== undefined) linhas.push(`Cursor em ${seg(ctx.cursorMs)} ("aqui", "agora", "neste ponto" = este tempo)`);
  }
  if (ctx?.anterior) {
    linhas.push('', `Conversa anterior: pedido "${curto(ctx.anterior.pedido, 200)}" -> você respondeu "${curto(ctx.anterior.resposta, 300)}"`);
  }

  return linhas.join('\n');
}

/** Os estilos de legenda, em uma linha cada, para o prompt. */
export function catalogoDeEstilosParaIa(): string {
  return PRESETS_DE_LEGENDA.map((p) => `${p.id}: ${p.descricao}`).join('\n');
}

/**
 * Tudo o que o Studio oferece, para o prompt de sistema.
 *
 * Gerado do código: um efeito, estilo ou sticker novo aparece para a IA
 * sem ninguém editar texto. É igual em toda chamada, então o prefixo do
 * prompt continua idêntico -- e cacheável pelo provedor.
 */
export function catalogoDoStudioParaIa(): string {
  const lista = (itens: readonly string[]) => itens.join('|');
  return [
    '## Estilos de legenda (trocar_estilo_legenda styleId: descrição)',
    catalogoDeEstilosParaIa(),
    '',
    '## Estilos prontos de texto (estilo_de_texto preset: descrição)',
    PRESETS_DE_TEXTO.map((p) => `${p.id}: ${p.descricao}`).join('\n'),
    '',
    '## Pacotes de estilo (aplicar_pacote id: descrição)',
    PACOTES_DE_ESTILO.map((p) => `${p.id}: ${p.descricao}`).join('\n'),
    '',
    '## Transições (type: quando usar)',
    TRANSICOES_DO_CATALOGO.map((t) => `${t.id}: ${t.quando}`).join('\n'),
    '',
    '## Efeitos de tela (adicionar_efeito_de_tela type: quando usar)',
    EFEITOS_DE_TELA.map((e) => `${e.id}: ${e.quando}`).join('\n'),
    '',
    '## Filtros de cor (definir_cor/cor_em_todos color.look: descrição)',
    APARENCIAS.map((a) => `${a.id}: ${a.descricao}`).join('\n'),
    '',
    '## Efeitos sonoros (adicionar_efeito_sonoro assetId: quando usar)',
    SONS_EMBUTIDOS.map((s) => `${s.id}: ${s.quando}`).join('\n'),
    '',
    '## Stickers (adicionar_midia kind=sticker, assetId)',
    STICKERS.map((s) => `${s.id}(${s.rotulo})`).join(', '),
    '',
    '## Vocabulário',
    `fontes (fontId): ${lista(Object.keys(FONTES_DE_VIDEO))}`,
    `entrada de texto: ${lista(ENTRADAS_DE_TEXTO)}`,
    `saída de texto: ${lista(SAIDAS_DE_TEXTO)}`,
    `animação durante o texto: ${lista(ANIMACOES_DURANTE)}`,
    `layout de mídia: ${lista(LAYOUTS_DE_MIDIA)}`,
    `moldura da mídia (frame): ${lista(MOLDURAS)}`,
    `animação de mídia: entrada ${lista(ENTRADAS_DE_MIDIA)}; durante ${lista(LOOPS_DE_MIDIA)}; saída ${lista(SAIDAS_DE_MIDIA)}`,
  ].join('\n');
}

// ---------- Aplicação ----------

export interface ResultadoDoComando {
  plan: EditPlanV1;
  aplicadas: number;
  ignoradas: string[];
}

export interface OpcoesDoComando {
  fala?: readonly IntervaloDeFala[];
  pacotesSalvos?: readonly PacoteSalvo[];
  /**
   * A biblioteca da marca: todo arquivo do workspace que a IA citar tem
   * de estar aqui, com o tipo certo. Um id inventado quebraria o render.
   */
  biblioteca?: readonly ItemDaBibliotecaDaMarca[];
}

const IMAGENS_DA_MARCA = ['LOGO', 'LOGO_NEGATIVE', 'LOGO_COMPACT', 'WATERMARK', 'IMAGE'];

/**
 * Confere os arquivos do workspace que a operação cita e completa o que
 * falta (a duração da vinheta vem da biblioteca). Devolve o erro para a
 * pessoa, ou a operação pronta.
 */
function conferirArquivos(op: TimelineOperation, biblioteca: readonly ItemDaBibliotecaDaMarca[] | undefined): { op?: TimelineOperation; erro?: string } {
  const achar = (id: string, tipos: readonly string[]) => biblioteca?.find((b) => b.assetId === id && tipos.includes(b.tipo));
  const semBiblioteca = 'esse arquivo não está na biblioteca da marca';
  switch (op.op) {
    case 'adicionar_midia':
      if (op.kind === 'sticker') return { op };
      return achar(op.assetId, op.kind === 'video' ? ['VIDEO'] : IMAGENS_DA_MARCA) ? { op } : { erro: semBiblioteca };
    case 'editar_midia':
      if (!op.assetId) return { op };
      return achar(op.assetId, [...IMAGENS_DA_MARCA, 'VIDEO']) ? { op } : { erro: semBiblioteca };
    case 'adicionar_overlay':
      if (!op.assetId) return { op };
      return achar(op.assetId, IMAGENS_DA_MARCA) ? { op } : { erro: semBiblioteca };
    case 'adicionar_efeito_sonoro':
      if (ehEfeitoSonoroEmbutido(op.assetId) || !biblioteca) return { op };
      return achar(op.assetId, ['SOUND_EFFECT']) ? { op } : { erro: semBiblioteca };
    case 'trocar_musica':
      if (op.assetId === null || !biblioteca) return { op };
      return achar(op.assetId, ['MUSIC']) ? { op } : { erro: semBiblioteca };
    case 'definir_abertura':
    case 'definir_encerramento': {
      if (op.assetId === null) return { op };
      const item = achar(op.assetId, [op.op === 'definir_abertura' ? 'INTRO' : 'OUTRO']);
      if (!item) return { erro: semBiblioteca };
      const durationMs = op.durationMs ?? (item.duracaoMs ? Math.min(30_000, Math.max(200, Math.round(item.duracaoMs))) : undefined);
      return { op: { ...op, ...(durationMs ? { durationMs } : {}) } };
    }
    default:
      return { op };
  }
}

/** As operações da timeline que um atalho vira, no plano como está. */
export function operacoesDaMacro(plan: EditPlanV1, macro: MacroDoComando, opcoes: OpcoesDoComando = {}): { ops: TimelineOperation[]; erro?: string } {
  if (macro.op === 'aplicar_pacote') {
    const pacote = [...PACOTES_DE_ESTILO, ...(opcoes.pacotesSalvos ?? [])].find((p) => p.id === macro.id);
    if (!pacote) return { ops: [], erro: `pacote "${macro.id}" não existe` };
    return { ops: operacoesDoPacote(plan, pacote.ingredientes, opcoes.fala ?? []) };
  }

  const preset = PRESETS_DE_TEXTO.find((p) => p.id === macro.preset);
  if (!preset) return { ops: [], erro: `estilo de texto "${macro.preset}" não existe` };
  const ehTexto = (comp: string) => (TEXTOS_DE_TELA as readonly string[]).includes(comp);
  const alvos = plan.overlays.filter((o) =>
    macro.alvo === 'todos' ? ehTexto(o.component) : o.id === macro.alvo || (o.component === macro.alvo && ehTexto(o.component)),
  );
  if (!alvos.length) return { ops: [], erro: `nenhum texto em "${macro.alvo}"` };
  const estilo: EstiloDoTexto = { ...preset.estilo, ...(macro.ajustes ?? {}) };
  return {
    ops: alvos.map((o) => ({
      op: 'editar_overlay' as const,
      overlayId: o.id,
      // O estilo pronto troca tudo, menos o lugar e o "atrás da pessoa",
      // que é escolha de composição, não de estilo.
      style: { ...estilo, ...(o.style?.atras && macro.ajustes?.atras === undefined ? { atras: true } : {}) },
      replaceStyle: true,
    })),
  };
}

/**
 * Aplica o que a IA pediu, em ordem, sobre o plano.
 *
 * Operação que não passa é pulada e as outras entram: recusar o pedido
 * inteiro por uma operação ruim gastaria outra chamada para obter as
 * mesmas boas. Um atalho conta como uma operação.
 */
export function aplicarComando(plan: EditPlanV1, operacoes: readonly OperacaoDoComando[], opcoes: OpcoesDoComando = {}): ResultadoDoComando {
  let atual = plan;
  let aplicadas = 0;
  const ignoradas: string[] = [];

  for (const operacao of operacoes) {
    if (ehMacro(operacao)) {
      const { ops, erro } = operacoesDaMacro(atual, operacao, opcoes);
      if (erro) {
        ignoradas.push(`${operacao.op}: ${erro}`);
        continue;
      }
      let entrou = false;
      for (const op of ops) {
        const r = aplicarOperacao(atual, op);
        if (r.ok && r.plan) {
          atual = r.plan;
          entrou = true;
        }
      }
      if (entrou) aplicadas += 1;
      else ignoradas.push(`${operacao.op}: não se aplica a este vídeo`);
      continue;
    }
    const conferida = conferirArquivos(operacao, opcoes.biblioteca);
    if (!conferida.op) {
      ignoradas.push(`${operacao.op}: ${conferida.erro}`);
      continue;
    }
    const r = aplicarOperacao(atual, conferida.op);
    if (r.ok && r.plan) {
      atual = r.plan;
      aplicadas += 1;
    } else {
      ignoradas.push(`${operacao.op}: ${r.erro ?? 'não se aplica a este vídeo'}`);
    }
  }

  return { plan: atual, aplicadas, ignoradas };
}
