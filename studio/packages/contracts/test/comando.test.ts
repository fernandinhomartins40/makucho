// ============================================================
// Comando da IA v3: atalhos expandidos no servidor, operações novas
// liberadas, stickers só do catálogo, contexto do editor e o tamanho
// do que vai ao modelo (economia de tokens).
// ============================================================

import {
  aplicarComando,
  catalogoDoStudioParaIa,
  editPlanV1Schema,
  parseComando,
  pedidoDeComandoSchema,
  resumoDoPlanoParaIa,
} from '../src/index';
import type { EditPlanV1 } from '../src/index';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

const plano: EditPlanV1 = {
  schemaVersion: '1.0',
  projectId: 'p1',
  sourceMediaId: 'm1',
  sourceDurationMs: 60_000,
  fps: 30,
  canvas: { aspectRatio: '9:16', width: 1080, height: 1920 },
  targetDurationMs: 12_000,
  framework: 'authority_education',
  clips: [0, 1, 2].map((i) => ({
    id: `c${i}`,
    sourceStartMs: i * 5000,
    sourceEndMs: i * 5000 + 4000,
    timelineStartMs: i * 4000,
    role: 'hook' as const,
    transcriptSegmentIds: ['s'],
    semanticRisk: 'low' as const,
    reason: 'x',
  })),
  captions: { enabled: true, styleId: 'impacto', wordsPerBlock: 3, position: 'bottom', highlightActiveWord: true, corrections: [] },
  overlays: [
    { id: 'o1', component: 'HookTitle', text: '3 coisas que você controla', timelineStartMs: 0, durationMs: 1200, style: { x: 0.5, y: 0.2, atras: true } },
    { id: 'o2', component: 'CTA', text: 'Salva pra não esquecer', timelineStartMs: 9000, durationMs: 2500 },
  ],
  soundEffects: [],
  transitions: [],
  render: { fps: 30, videoCodec: 'h264', audioCodec: 'aac', crf: 23, audioBitrateKbps: 128, loudnessTargetLufs: -14 },
};

// ---------- Atalhos ----------
const resposta = JSON.stringify({
  schemaVersion: '1.0',
  operations: [
    { op: 'estilo_de_texto', alvo: 'todos', preset: 'impacto', ajustes: { bgColor: '#2F66FF' } },
    { op: 'cor_em_todos', color: { look: 'cinema', intensity: 0.8 } },
    { op: 'adicionar_efeito_de_tela', type: 'flash', timelineStartMs: 0, durationMs: 500 },
    { op: 'adicionar_midia', kind: 'sticker', assetId: 'emoji_fogo', layout: 'livre', timelineStartMs: 2000, durationMs: 1500 },
    { op: 'adicionar_midia', kind: 'image', assetId: 'inventado', layout: 'pip', timelineStartMs: 0, durationMs: 1000 },
    { op: 'adicionar_midia', kind: 'sticker', assetId: 'nao_existe', layout: 'livre', timelineStartMs: 0, durationMs: 1000 },
    { op: 'estilo_de_texto', alvo: 'todos', preset: 'nao_existe' },
  ],
  reply: 'Deixei os textos no estilo Impacto e o vídeo com cor de cinema.',
});
const lido = parseComando(resposta);
t('o comando v3 é lido', lido.ok);
if (lido.ok) {
  t('sticker fora do catálogo fica de fora já na leitura', lido.ignoradas.filter((i) => i.startsWith('adicionar_midia')).length === 1);
  const r = aplicarComando(plano, lido.operacoes);
  t('foto inventada (fora da biblioteca da marca) fica de fora', r.ignoradas.some((i) => i.startsWith('adicionar_midia') && i.includes('biblioteca')));
  const p = r.plan;
  t('4 operações entram (atalho conta como uma)', r.aplicadas === 4);
  t('preset inexistente volta explicado', r.ignoradas.some((i) => i.includes('nao_existe')));
  t('estilo_de_texto troca o estilo de TODOS os textos', p.overlays.every((o) => o.style?.preset === 'impacto'));
  t('ajuste por cima do estilo pronto (cor da marca)', p.overlays.every((o) => o.style?.bgColor === '#2F66FF'));
  t('a posição e o "atrás da pessoa" ficam', p.overlays[0]!.style?.y === 0.2 && p.overlays[0]!.style?.atras === true);
  t('cor em todos os trechos', p.clips.every((c) => c.color?.look === 'cinema'));
  t('efeito de tela e sticker entram', p.screenEffects?.[0]?.type === 'flash' && p.mediaLayers?.[0]?.assetId === 'emoji_fogo');
  t('o plano continua válido', editPlanV1Schema.safeParse(p).success);
}

{
  const r = aplicarComando(plano, [{ op: 'estilo_de_texto', alvo: 'CTA', preset: 'pilula' }]);
  t('alvo por tipo: só a chamada', r.plan.overlays[1]!.style?.preset === 'pilula' && r.plan.overlays[0]!.style?.preset === undefined);
  const r2 = aplicarComando(plano, [{ op: 'estilo_de_texto', alvo: 'o1', preset: 'neon' }]);
  t('alvo por id: só aquele texto', r2.plan.overlays[0]!.style?.preset === 'neon' && !r2.plan.overlays[1]!.style);
}

{
  const r = aplicarComando(plano, [{ op: 'aplicar_pacote', id: 'energia_tiktok' }]);
  t('aplicar_pacote expande em legenda, zoom e cor', r.aplicadas === 1 && r.plan.captions.styleId === 'impacto' && r.plan.clips.some((c) => c.effect === 'punch_in') && r.plan.clips.every((c) => c.color?.look === 'vivido'));
  const salvo = { id: 'meu1', rotulo: 'Meu podcast', ingredientes: { legenda: { styleId: 'podcast' } } };
  const r2 = aplicarComando(plano, [{ op: 'aplicar_pacote', id: 'meu1' }], { pacotesSalvos: [salvo] });
  t('aplicar_pacote aceita estilo salvo da pessoa', r2.plan.captions.styleId === 'podcast');
}

// ---------- Biblioteca da marca ----------
{
  const biblioteca = [
    { assetId: 'intro1', tipo: 'INTRO', nome: 'Vinheta curta', uso: 'abertura de todo vídeo', duracaoMs: 2400 },
    { assetId: 'outro1', tipo: 'OUTRO', nome: 'Encerramento', duracaoMs: 3000 },
    { assetId: 'som1', tipo: 'SOUND_EFFECT', nome: 'Plim da marca', uso: 'quando aparece uma dica' },
    { assetId: 'trilha1', tipo: 'MUSIC', nome: 'Trilha animada' },
    { assetId: 'logoesc', tipo: 'LOGO_NEGATIVE', nome: 'Logo branca' },
    { assetId: 'foto1', tipo: 'IMAGE', nome: 'Fachada da loja' },
  ];
  const r = aplicarComando(
    plano,
    [
      { op: 'definir_abertura', assetId: 'intro1' },
      { op: 'definir_encerramento', assetId: 'outro1' },
      { op: 'adicionar_efeito_sonoro', assetId: 'som1', timelineStartMs: 2000, gainDb: -10 },
      { op: 'trocar_musica', assetId: 'trilha1', gainDb: -20 },
      { op: 'adicionar_overlay', component: 'LogoBug', assetId: 'logoesc', variant: 'sd', timelineStartMs: 0, durationMs: 12000 },
      { op: 'adicionar_midia', kind: 'image', assetId: 'foto1', layout: 'pip', timelineStartMs: 1000, durationMs: 2000 },
      { op: 'definir_abertura', assetId: 'som1' },
      { op: 'trocar_musica', assetId: 'inventada' },
    ],
    { biblioteca },
  );
  t('vinhetas da marca entram com a duração do arquivo', r.plan.intro?.assetId === 'intro1' && r.plan.intro.durationMs === 2400 && r.plan.outro?.durationMs === 3000);
  t('som, trilha, logo para fundo escuro e foto da marca entram', r.aplicadas === 6 && r.plan.music?.assetId === 'trilha1' && r.plan.mediaLayers?.[0]?.assetId === 'foto1');
  t('tipo errado (som como abertura) e id inventado ficam de fora', r.ignoradas.length === 2);
  t('o plano com vinhetas segue válido', editPlanV1Schema.safeParse(r.plan).success);
  const sem = aplicarComando(r.plan, [{ op: 'definir_abertura', assetId: null }]);
  t('tirar a abertura', !sem.plan.intro && !!sem.plan.outro);
  const resumoComBiblioteca = resumoDoPlanoParaIa(r.plan, {}, { biblioteca });
  t('o resumo lista a biblioteca com o uso', resumoComBiblioteca.includes('intro1|vinheta de abertura|"Vinheta curta"|"abertura de todo vídeo"|2.4s') && resumoComBiblioteca.includes('Vinhetas no vídeo: abertura=intro1'));
}

// ---------- Contexto do editor ----------
const pedido = pedidoDeComandoSchema.safeParse({
  texto: 'sim',
  contexto: { selecionado: { tipo: 'elemento', id: 'o1' }, cursorMs: 3200, anterior: { pedido: 'melhora os textos', resposta: 'Quer que eu aplique em todos?' } },
});
t('pedido curto ("sim") com contexto é aceito', pedido.success);

const resumo = resumoDoPlanoParaIa(plano, { c0: 'as três coisas que controlamos' }, {
  coresDaMarca: { primary: '#2F66FF', accent: '#FFD400' },
  contexto: pedido.success ? pedido.data.contexto : undefined,
});
t('o resumo traz o estilo de cada texto', resumo.includes('o1|HookTitle') && resumo.includes('atrás'));
t('o resumo traz o selecionado, o cursor e a conversa', resumo.includes('elemento o1') && resumo.includes('3.2s') && resumo.includes('melhora os textos'));
t('o resumo traz as cores da marca', resumo.includes('primary=#2F66FF'));
t('o resumo segue curto (< 1800 caracteres)', resumo.length < 1800);

// ---------- Economia ----------
const catalogo = catalogoDoStudioParaIa();
t('o catálogo cobre estilos, efeitos, filtros, sons e stickers', ['impacto', 'vinheta', 'cinema', 'sfx-whoosh', 'emoji_fogo', 'energia_tiktok'].every((x) => catalogo.includes(x)));
t('o catálogo é fixo (mesmo texto: prefixo cacheável)', catalogo === catalogoDoStudioParaIa());
t('o catálogo cabe em ~3 mil tokens (< 12 mil caracteres)', catalogo.length < 12_000);
console.log(`   (catálogo: ${catalogo.length} caracteres; resumo: ${resumo.length})`);

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail > 0) process.exit(1);
