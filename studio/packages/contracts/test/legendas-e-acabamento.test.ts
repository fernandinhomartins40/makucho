// ============================================================
// Estilos de legenda, gerador .ass, operações de acabamento,
// acabamento automático, estilo da proposta e comando da IA.
// ============================================================

import {
  PRESETS_DE_LEGENDA,
  aplicarAcabamento,
  aplicarOperacao,
  aplicarOperacoes,
  aiProposalV1Schema,
  compilarProposta,
  gerarAss,
  montarBlocos,
  parseComando,
  planoPrecisaDeAss,
  presetDaLegenda,
  resolverEstiloDaLegenda,
  resumoDoPlanoParaIa,
} from '../src';
import type { EditPlanV1, PalavraDaTranscricao } from '../src';

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
  clips: [
    { id: 'c1', sourceStartMs: 0, sourceEndMs: 4000, timelineStartMs: 0, role: 'hook', transcriptSegmentIds: ['s1'], semanticRisk: 'low', reason: 'a' },
    { id: 'c2', sourceStartMs: 10_000, sourceEndMs: 14_000, timelineStartMs: 4000, role: 'insight', transcriptSegmentIds: ['s2'], semanticRisk: 'low', reason: 'b' },
    { id: 'c3', sourceStartMs: 20_000, sourceEndMs: 24_000, timelineStartMs: 8000, role: 'cta', transcriptSegmentIds: ['s3'], semanticRisk: 'low', reason: 'c' },
  ],
  captions: { enabled: true, styleId: 'padrao', wordsPerBlock: 3, position: 'bottom', highlightActiveWord: true, corrections: [] },
  overlays: [],
  soundEffects: [],
  transitions: [],
  render: { fps: 30, videoCodec: 'h264', audioCodec: 'aac', crf: 23, audioBitrateKbps: 128, loudnessTargetLufs: -14 },
};

const palavras: PalavraDaTranscricao[] = [
  { id: 'w1', startMs: 200, endMs: 600, word: 'você' },
  { id: 'w2', startMs: 650, endMs: 1000, word: 'está' },
  { id: 'w3', startMs: 1050, endMs: 1500, word: 'perdendo' },
  { id: 'w4', startMs: 1550, endMs: 2000, word: 'clientes' },
  { id: 'w5', startMs: 10_200, endMs: 10_700, word: 'ação' },
  { id: 'w6', startMs: 20_100, endMs: 20_600, word: 'agora' },
];

// ============================================================
// Presets
// ============================================================
{
  const ids = PRESETS_DE_LEGENDA.map((p) => p.id);
  t('há dez estilos', ids.length === 10);
  t('ids únicos', new Set(ids).size === ids.length);
  t('os ids antigos da tela da Marca continuam valendo', presetDaLegenda('moderno')?.id === 'caixa' && presetDaLegenda('minimalista')?.id === 'minimal');
  t('o "default" do compilador antigo vira o Clássico', presetDaLegenda('default')?.id === 'padrao');

  const marca = { cores: { primary: '#FF0000', secondary: '#00FF00', accent: '#000000', textLight: '#FFFFFF', textDark: '#111111' } };
  const e = resolverEstiloDaLegenda('padrao', { marca });
  t('o destaque do Clássico é a cor primária da marca', e.corDestaque === '#FF0000');
  t('a fonte vem do arquivo (nome interno)', e.fonte.nomeAss === 'Inter ExtraBold');

  const maior = resolverEstiloDaLegenda('padrao', { escala: 1.2 });
  t('o tamanho G aumenta a fonte', maior.tamanhoPx === Math.round(74 * 1.2));
  t('e diminui os caracteres por bloco', maior.maxCaracteres < e.maxCaracteres);

  const desconhecido = resolverEstiloDaLegenda('id-que-nao-existe');
  t('um id desconhecido cai no Clássico, nunca em nada', desconhecido.nome === 'padrao');

  const personalizado = resolverEstiloDaLegenda('cuid123', {
    personalizado: { name: 'Meu', fontFamily: 'Liberation Sans', fontSizePx: 64, color: '#FFFFFF', strokeWidthPx: 0, wordsPerBlock: 3, position: 'bottom' },
  });
  t('um estilo personalizado do banco é respeitado', personalizado.nome === 'Meu' && personalizado.fonte.nomeAss === 'Liberation Sans');
}

// ============================================================
// Gerador .ass por animação
// ============================================================
const assDe = (styleId: string, extra: Partial<EditPlanV1['captions']> = {}) =>
  gerarAss({
    plano: { ...plano, captions: { ...plano.captions, styleId, ...extra } },
    estilo: resolverEstiloDaLegenda(styleId),
    palavras,
  });
const dialogos = (ass: string) => ass.split('\n').filter((l) => l.startsWith('Dialogue:'));

{
  const ass = assDe('padrao');
  t('Clássico declara a fonte do arquivo', ass.includes('Style: Makucho,Inter ExtraBold,74,'));
  t('palavra ativa: um evento por palavra falada', dialogos(ass).filter((l) => l.includes(',Makucho,')).length === 6);
  t('a palavra ativa muda de cor com \\c', ass.includes('{\\c&HFF662F&}você{\\r}'));
  t('não usa karaokê', !ass.includes('\\kf'));
}
{
  const ass = assDe('destaque');
  t('Hormozi: caixa alta', ass.includes('VOCÊ') && !ass.includes('você'));
  t('Hormozi: pop de escala com \\t', ass.includes('\\t(0,90,\\fscx118\\fscy118)'));
  t('Hormozi: destaque amarelo', ass.includes('\\c&H3BD4FF&'));
}
{
  const ass = assDe('karaoke');
  const estilo = ass.split('\n').find((l) => l.startsWith('Style: Makucho,'))!;
  t('karaokê usa \\kf', ass.includes('{\\kf'));
  // Primária = depois da fala (cor da marca), secundária = antes (branco).
  t('karaokê: primária é o destaque, secundária é a cor base', estilo.includes(',&H00FF662F,&H00FFFFFF,'));
}
{
  const ass = assDe('caixa');
  t('caixa ativa: estilo da caixa em BorderStyle 3', /Style: MakuchoCaixa,.*,3,14,0,2,/.test(ass));
  t('caixa ativa: só a palavra falada tem a caixa opaca', ass.includes('{\\3a&H00&}você{\\3a&HFF&}'));
  t('caixa ativa: camada de contorno por baixo', dialogos(ass).some((l) => l.startsWith('Dialogue: 0,') && l.includes(',Makucho,')));
}
{
  // Como a operação de troca faz: o preset traz posição e agrupamento.
  const trocado = aplicarOperacao(plano, { op: 'trocar_estilo_legenda', styleId: 'uma_palavra' }).plan!;
  t('trocar para Uma palavra traz o centro e 1 palavra', trocado.captions.position === 'center' && trocado.captions.wordsPerBlock === 1);
  const ass = assDe('uma_palavra', { position: trocado.captions.position, wordsPerBlock: 1 });
  const eventos = dialogos(ass).filter((l) => l.includes(',Makucho,'));
  t('uma palavra: um evento por palavra', eventos.length === 6);
  t('uma palavra: cada evento tem uma palavra só', eventos.every((l) => !l.split(',').slice(8).join(',').replace(/\{[^}]*\}/g, '').trim().includes(' ')));
  t('uma palavra: no centro (alinhamento 5)', /Style: Makucho,Bangers,.*,5,\d+,\d+,0,1/.test(ass));
}
{
  const ass = assDe('cinema');
  t('cinema: entra subindo com \\move', ass.includes('\\move(540,1501,540,1459,0,200)'));
  t('cinema: sem destaque de palavra', !ass.includes('\\c&H'));
}
{
  const ass = assDe('podcast');
  t('podcast: faixa escura translúcida (BorderStyle 3)', /Style: Makucho,Archivo ExtraBold,62,.*,3,18,0,2,/.test(ass));
}
{
  const ass = assDe('neon');
  t('neon: brilho com \\blur', ass.includes('{\\blur6}'));
}
{
  const ass = assDe('padrao', { highlightActiveWord: false });
  t('sem destaque, o Clássico vira bloco parado', dialogos(ass).filter((l) => l.includes(',Makucho,')).length < 6 && !ass.includes('\\c&H'));
}
{
  const ass = assDe('padrao', { position: 'top' });
  t('a posição do PLANO manda (topo = 8)', /Style: Makucho,.*,8,\d+,\d+,\d+,1/.test(ass));
  const blocos1 = montarBlocos({ plano: { ...plano, captions: { ...plano.captions, wordsPerBlock: 1 } }, estilo: resolverEstiloDaLegenda('padrao'), palavras });
  t('palavras por bloco do PLANO manda (1 = seis blocos)', blocos1.length === 6);
}
{
  // Pausa longa quebra o bloco, mesmo cabendo mais palavras.
  const comPausa: PalavraDaTranscricao[] = [
    { startMs: 100, endMs: 400, word: 'um' },
    { startMs: 2000, endMs: 2400, word: 'dois' },
  ];
  const blocos = montarBlocos({ plano, estilo: resolverEstiloDaLegenda('padrao'), palavras: comPausa });
  t('pausa longa quebra o bloco', blocos.length === 2);
  t('o bloco fica um pouco depois da fala, sem invadir o próximo', blocos[0]!.fimMs > 400 && blocos[0]!.fimMs <= 2000);
}

// ============================================================
// Textos de tela
// ============================================================
{
  const comTextos: EditPlanV1 = {
    ...plano,
    captions: { ...plano.captions, enabled: false },
    overlays: [
      { id: 'o1', component: 'HookTitle', text: 'O erro que custa 🔥 caro', timelineStartMs: 0, durationMs: 3000 },
      { id: 'o2', component: 'CTA', text: 'Siga para mais', timelineStartMs: 9000, durationMs: 3000 },
      { id: 'o3', component: 'StatCard', text: '87% | voltam a comprar', timelineStartMs: 5000, durationMs: 2000 },
      { id: 'o4', component: 'ProgressBar', timelineStartMs: 0, durationMs: 12_000 },
      { id: 'o5', component: 'LogoBug', assetId: 'a1', timelineStartMs: 0, durationMs: 12_000 },
      { id: 'o6', component: 'HookTitle', text: 'depois do fim', timelineStartMs: 12_500, durationMs: 1000 },
    ],
  };
  t('textos de tela exigem .ass mesmo sem legenda', planoPrecisaDeAss(comTextos));
  t('só logo não exige .ass', !planoPrecisaDeAss({ ...comTextos, overlays: [comTextos.overlays[4]!] }));
  const ass = gerarAss({ plano: comTextos, estilo: resolverEstiloDaLegenda('padrao'), palavras });
  t('sem legenda, nenhum evento de legenda', !ass.includes(',Makucho,'));
  t('título de abertura entra', ass.includes(',Titulo,') && ass.includes('O erro que custa caro'));
  t('emoji sai do texto (o libass não desenha)', !ass.includes('🔥'));
  t('chamada final entra', ass.includes(',Chamada,') && ass.includes('Siga para mais'));
  t('cartão de número: número grande em cima', ass.includes('{\\fs150}87%\\N{\\fs54}voltam a comprar'));
  t('barra de progresso é um desenho vetorial', ass.includes('\\p1}m 0 0 l 1080 0'));
  t('o logo não vai para o .ass', !ass.includes('LogoBug'));
  t('texto depois do fim do vídeo não entra', !ass.includes('depois do fim'));
}

// ============================================================
// Operações de acabamento
// ============================================================
{
  const r1 = aplicarOperacao(plano, { op: 'definir_transicao', clipId: 'c2', type: 'fade' });
  t('transição num trecho', r1.ok && r1.plan!.transitions[0]?.beforeClipIndex === 1 && r1.plan!.transitions[0]?.durationMs === 400);
  const r2 = aplicarOperacao(plano, { op: 'definir_transicao', clipId: 'c1', type: 'fade' });
  t('primeiro trecho não tem transição antes', !r2.ok);

  // A transição acompanha o trecho quando a ordem muda.
  const r3 = aplicarOperacao(r1.plan!, { op: 'reordenar', clipIds: ['c1', 'c3', 'c2'] });
  t('reordenar leva a transição junto com o trecho', r3.ok && r3.plan!.transitions[0]?.beforeClipIndex === 2);
  const r4 = aplicarOperacao(r1.plan!, { op: 'alternar_clipe', clipId: 'c2', enabled: false });
  t('desativar o trecho remove a transição dele', r4.ok && r4.plan!.transitions.length === 0);

  const r5 = aplicarOperacao(plano, { op: 'transicao_em_todos', type: 'zoom' });
  t('transição em todos os cortes', r5.ok && r5.plan!.transitions.length === 2);
  const r6 = aplicarOperacao(r5.plan!, { op: 'transicao_em_todos', type: 'cut' });
  t('cut em todos limpa', r6.ok && r6.plan!.transitions.length === 0);

  const r7 = aplicarOperacoes(plano, [
    { op: 'definir_efeito', clipId: 'c2', effect: 'punch_in' },
    { op: 'configurar_legenda', wordsPerBlock: 2, sizeScale: 1.2, position: 'center' },
    { op: 'configurar_video', fit: 'desfoque', voiceEnhance: true },
    { op: 'adicionar_overlay', component: 'HookTitle', text: 'Olá', timelineStartMs: 0, durationMs: 3000 },
    { op: 'adicionar_efeito_sonoro', assetId: 'sfx-whoosh', timelineStartMs: 3800 },
  ]);
  const p7 = r7.plan!;
  t('várias operações de acabamento juntas', r7.ok);
  t('efeito no trecho', p7.clips[1]!.effect === 'punch_in');
  t('legenda configurada', p7.captions.wordsPerBlock === 2 && p7.captions.sizeScale === 1.2 && p7.captions.position === 'center');
  t('vídeo configurado', p7.render.fit === 'desfoque' && p7.render.voiceEnhance === true);
  t('título adicionado', p7.overlays.length === 1 && p7.overlays[0]!.text === 'Olá');
  t('som adicionado', p7.soundEffects[0]?.assetId === 'sfx-whoosh');

  const r8 = aplicarOperacao(p7, { op: 'adicionar_overlay', component: 'HookTitle', text: 'Outro', timelineStartMs: 0, durationMs: 2000 });
  t('um título de abertura só (o novo substitui)', r8.ok && r8.plan!.overlays.filter((o) => o.component === 'HookTitle').length === 1);
  const r9 = aplicarOperacao(p7, { op: 'adicionar_overlay', component: 'CTA', timelineStartMs: 0, durationMs: 2000 });
  t('chamada sem texto é recusada', !r9.ok);

  // Encurtar o vídeo corta o que ficou além do fim.
  const longo = aplicarOperacao(plano, { op: 'adicionar_overlay', component: 'CTA', text: 'Siga', timelineStartMs: 10_000, durationMs: 2000 }).plan!;
  const curto = aplicarOperacao(longo, { op: 'alternar_clipe', clipId: 'c3', enabled: false });
  t('texto além do novo fim sai', curto.ok && curto.plan!.overlays.length === 0);
}

// ============================================================
// Acabamento automático
// ============================================================
{
  const a = aplicarAcabamento(plano, {
    preferencias: { captionPreset: 'destaque', logo: { mostrar: true, posicao: 'se' }, musica: { usar: true, volumeDb: -22 } },
    logoAssetId: 'logo1',
    musicaAssetId: 'mus1',
  });
  t('estilo preferido da marca', a.captions.styleId === 'destaque');
  t('o agrupamento e a posição vêm do estilo', a.captions.wordsPerBlock === 3 && a.captions.position === 'bottom');
  t('a abertura ganha zoom lento', a.clips[0]!.effect === 'zoom_lento');
  t('sem dica, cortes alternados ganham punch-in', a.clips[1]!.effect === 'punch_in' && a.clips[2]!.effect === undefined);
  t('logo na posição escolhida', a.overlays.some((o) => o.component === 'LogoBug' && o.variant === 'se'));
  t('trilha com ducking', a.music?.assetId === 'mus1' && a.music.gainDb === -22 && a.music.duckUnderVoice);
  t('desfoque e voz limpa por padrão', a.render.fit === 'desfoque' && a.render.voiceEnhance === true);
  t('sem transição por padrão (corte seco)', a.transitions.length === 0);

  const d = aplicarAcabamento(plano, { preferencias: { efeitosSonoros: true } }, {
    captionPreset: 'uma_palavra',
    hookTitle: '  O erro   que ninguém vê ',
    cta: 'Siga para a parte 2',
    emphasis: [2, 99],
    transitions: [{ before: 2, type: 'fade' }, { before: 0, type: 'fade' }],
  });
  t('a dica da IA manda no estilo', d.captions.styleId === 'uma_palavra' && d.captions.wordsPerBlock === 1);
  t('ênfase da IA vira punch-in (índice inválido ignorado)', d.clips[2]!.effect === 'punch_in' && d.clips[1]!.effect === undefined);
  t('transição pedida entra (antes do trecho 0 não)', d.transitions.length === 1 && d.transitions[0]!.beforeClipIndex === 2);
  t('título limpo de espaços', d.overlays.find((o) => o.component === 'HookTitle')?.text === 'O erro que ninguém vê');
  t('chamada nos segundos finais', d.overlays.find((o) => o.component === 'CTA')?.timelineStartMs === 12_000 - 3500);
  t('whoosh na transição e pop nos textos', d.soundEffects.filter((s) => s.assetId === 'sfx-whoosh').length === 1 && d.soundEffects.filter((s) => s.assetId === 'sfx-pop').length === 2);

  const semNada = aplicarAcabamento(plano, { preferencias: { autoZoom: false, efeitosSonoros: false, fit: 'ajustar', voiceEnhance: false } });
  t('preferências desligadas são respeitadas', semNada.clips.every((c) => !c.effect) && semNada.render.fit === 'ajustar' && !semNada.render.voiceEnhance);
  t('sem logo cadastrado, nenhum logo', !semNada.overlays.some((o) => o.component === 'LogoBug'));
}

// ============================================================
// Estilo na proposta da IA e compilador
// ============================================================
{
  const proposta = {
    schemaVersion: '1.0',
    framework: 'authority_education',
    targetDurationMs: 8000,
    segments: [
      { sourceStartMs: 0, sourceEndMs: 4000, role: 'hook', score: 0.9, dependencies: [], reason: 'a', semanticRisk: 'low' },
      { sourceStartMs: 10_000, sourceEndMs: 14_000, role: 'insight', score: 0.8, dependencies: [], reason: 'b', semanticRisk: 'low' },
    ],
    warnings: [],
    missingBlocks: [],
    style: { captionPreset: 'impacto', hookTitle: 'Pare de perder clientes', emphasis: [1] },
  };
  t('proposta com style é aceita', aiProposalV1Schema.safeParse(proposta).success);
  t('style com chave extra é recusado', !aiProposalV1Schema.safeParse({ ...proposta, style: { ...proposta.style, cor: 'x' } }).success);
  t('estilo inexistente é recusado', !aiProposalV1Schema.safeParse({ ...proposta, style: { captionPreset: 'comic-sans' } }).success);

  const r = compilarProposta({
    proposta: aiProposalV1Schema.parse(proposta),
    projectId: 'p1',
    sourceMediaId: 'm1',
    sourceDurationMs: 60_000,
    segmentos: [
      { id: 's1', startMs: 0, endMs: 4000, text: 'a', minWordConfidence: 0.9 },
      { id: 's2', startMs: 10_000, endMs: 14_000, text: 'b', minWordConfidence: 0.9 },
    ],
    acabamento: { preferencias: {}, logoAssetId: null },
  });
  t('o compilador aplica o acabamento da IA', r.ok && r.plano.captions.styleId === 'impacto' && r.plano.clips[1]!.effect === 'punch_in');
  t('e o título de abertura', r.ok && r.plano.overlays.some((o) => o.component === 'HookTitle'));
}

// ============================================================
// Comando em linguagem natural
// ============================================================
{
  const resposta = JSON.stringify({
    schemaVersion: '1.0',
    operations: [
      { op: 'trocar_estilo_legenda', styleId: 'destaque' },
      { op: 'transicao_em_todos', type: 'fade' },
      { op: 'inserir', sourceStartMs: 0, sourceEndMs: 1000, role: 'hook', transcriptSegmentIds: ['s1'], reason: 'x', semanticRisk: 'low' },
      { op: 'definir_efeito', clipId: 'c2' },
    ],
    reply: 'Troquei a legenda e pus fade nos cortes.',
  });
  const lido = parseComando(`\`\`\`json\n${resposta}\n\`\`\``);
  t('o comando é lido (com cerca de markdown)', lido.ok);
  if (lido.ok) {
    t('operações válidas passam', lido.operacoes.length === 2);
    t('inserir não pode ser pedido por comando', lido.ignoradas.some((i) => i.startsWith('inserir')));
    t('operação malformada é ignorada, não derruba as outras', lido.ignoradas.some((i) => i.startsWith('definir_efeito')));
    t('a resposta para a pessoa vem junto', lido.resposta.startsWith('Troquei'));
    const aplicado = aplicarOperacoes(plano, lido.operacoes);
    t('as operações do comando se aplicam ao plano', aplicado.ok && aplicado.plan!.captions.styleId === 'destaque' && aplicado.plan!.transitions.length === 2);
  }
  t('JSON quebrado é recuperável', parseComando('{quebrado').ok === false);

  const resumo = resumoDoPlanoParaIa(plano, { c1: 'você está perdendo clientes' }, { logoAssetId: 'logo1' });
  t('o resumo tem uma linha por trecho', resumo.split('\n').filter((l) => /^c\d\|/.test(l)).length === 3);
  t('o resumo leva a fala do trecho', resumo.includes('"você está perdendo clientes"'));
  t('o resumo é curto (< 1200 caracteres para 3 trechos)', resumo.length < 1200);
}

console.log(`\n${ok} ok, ${fail} falhas`);
if (fail > 0) process.exit(1);
