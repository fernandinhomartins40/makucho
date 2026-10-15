// ============================================================
// A revisão final: o que um editor humano confere no vídeo montado.
// ============================================================

import {
  aplicarCorrecoes,
  ajusteDaComposicao,
  composicaoDoPreset,
  editPlanV1Schema,
  lerRevisaoDaLegenda,
  palavrasDaRevisao,
  pedidoDaRevisaoDaLegenda,
  resumoDaRevisao,
  revisarVideo,
  LETRA_MINIMA,
  notaDaComposicao,
  versaoMelhor,
  candidatasDaComposicao,
} from '../src';
import type { EditPlanV1, MedidasDaRevisao, PalavraDaRevisao, PessoaNoQuadro } from '../src';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

const cena = composicaoDoPreset({ preset: 'impacto', textos: { titulo: 'VENDA MAIS' }, layout: 'cartao' }, 'mg-neon', 4, []);

const base: EditPlanV1 = {
  schemaVersion: '1.0',
  projectId: 'p',
  sourceMediaId: 'm',
  sourceDurationMs: 30_000,
  fps: 30,
  canvas: { aspectRatio: '9:16', width: 1080, height: 1920 },
  targetDurationMs: 20_000,
  framework: 'authority_education',
  clips: [{ id: 'c1', sourceStartMs: 0, sourceEndMs: 20_000, timelineStartMs: 0, role: 'hook', transcriptSegmentIds: ['s1'], semanticRisk: 'low', reason: 'teste' }],
  captions: { enabled: true, styleId: 'padrao', wordsPerBlock: 7, position: 'bottom', highlightActiveWord: true, corrections: [] },
  overlays: [{ id: 'o1', component: 'Destaque', text: 'Responda em até cinco minutos sempre', timelineStartMs: 2000, durationMs: 800 }],
  soundEffects: [
    { id: 's-alto', assetId: 'whoosh', timelineStartMs: 1000, gainDb: 0 },
    { id: 's-pausa', assetId: 'whoosh', timelineStartMs: 9000, gainDb: 0 },
  ],
  transitions: [],
  music: { assetId: 'a', gainDb: -6, fadeInMs: 500, fadeOutMs: 500, duckUnderVoice: false },
  mediaLayers: [
    { id: 'anim1', assetId: 'x', kind: 'html', timelineStartMs: 4000, durationMs: 4000, layout: 'tela_cheia', composicao: cena },
    { id: 'anim2', assetId: 'x', kind: 'html', timelineStartMs: 7000, durationMs: 1000, layout: 'tela_cheia', composicao: { ...cena, estilo: 'outro-estilo' } },
  ],
  render: { fps: 30, videoCodec: 'h264', audioCodec: 'aac', crf: 23, audioBitrateKbps: 128, loudnessTargetLufs: -14 },
} as unknown as EditPlanV1;

const palavras: PalavraDaRevisao[] = [
  { id: 'w1', texto: 'Venda', inicioMs: 900, fimMs: 1300, confianca: 0.95 },
  { id: 'w2', texto: 'que', inicioMs: 1400, fimMs: 1600, confianca: 0.9 },
  { id: 'w3', texto: 'que', inicioMs: 1650, fimMs: 1800, confianca: 0.9 },
  { id: 'w4', texto: 'vuatsap', inicioMs: 2000, fimMs: 2500, confianca: 0.31 },
];

// A pessoa no meio do quadro; o cartão medido em cima do rosto, com um texto pequeno.
const pessoa: PessoaNoQuadro = { cabeca: { x: 540, topo: 500, base: 900, largura: 380 }, ombros: 900, corpo: { esq: 200, dir: 880 } };
const medidas: MedidasDaRevisao = {
  t: 1.6,
  pecas: [
    { chave: 'cena', campo: '', pai: null, r: { x: 140, y: 560, w: 800, h: 300 }, letra: null, texto: '' },
    { chave: 'mg-t.0', campo: 'titulo', pai: 'cena', r: { x: 200, y: 600, w: 680, h: 120 }, letra: 110, texto: 'VENDA MAIS' },
    { chave: 'mg-k.0', campo: 'kicker', pai: 'cena', r: { x: 200, y: 740, w: 200, h: 26 }, letra: 26, texto: 'A VERDADE' },
    { chave: 'mg-d.0', campo: 'detalhe', pai: 'cena', r: { x: 220, y: 610, w: 600, h: 90 }, letra: 80, texto: 'em cima do título' },
  ],
};

const achados = revisarVideo(base, { palavras, medidas: { anim1: medidas }, pessoa: { anim1: pessoa } });
const tipo = (x: string) => achados.filter((a) => a.tipo === x);

// Áudio
t('trilha alta sem abaixar na fala: corrigir', tipo('trilha-alta')[0]?.correcao?.tipo === 'musica');
t('som alto em cima de palavra: corrigir', tipo('som-na-fala').some((a) => a.alvo === 's-alto'));
t('som alto na pausa: fica', !tipo('som-na-fala').some((a) => a.alvo === 's-pausa'));
// Legenda
t('7 palavras por bloco no vertical: passa a 4', tipo('bloco-longo')[0]?.correcao?.tipo === 'legenda');
t('palavra com pouca certeza: conferir', tipo('palavra-incerta').some((a) => a.alvo === 'w4' && a.gravidade === 'conferir'));
t('palavra com certeza: fica', !tipo('palavra-incerta').some((a) => a.alvo === 'w1'));
t('palavra repetida (gagueira): conferir', tipo('repetida').some((a) => a.alvo === 'w3'));
// Textos
t('texto rápido demais para ler: ganha tempo', (tipo('rapido')[0]?.correcao as { durationMs: number } | undefined)?.durationMs! > 800);
// Animações
t('estilos misturados: conferir', tipo('estilos-misturados').length === 1);
t('animação curta: conferir', tipo('curta').some((a) => a.alvo === 'anim2'));
t('duas animações ao mesmo tempo: conferir', tipo('ao-mesmo-tempo').length === 1);
t(`texto abaixo de ${LETRA_MINIMA} px: aumentar`, tipo('pequena').some((a) => a.mensagem.includes('A VERDADE')));
t('texto grande: fica', !tipo('pequena').some((a) => a.mensagem.includes('VENDA MAIS')));
t('cartão sobre o rosto: vai para fora dele', tipo('rosto')[0]?.gravidade === 'corrigir');
t('texto sobre texto: conferir', tipo('sobreposta').length === 1);
t('o que corrige vem antes do que confere', achados.findIndex((a) => a.gravidade === 'conferir') > achados.findLastIndex((a) => a.gravidade === 'corrigir'));

// As correções
const { plano: corrigido, feitos } = aplicarCorrecoes(base, achados);
t('o plano corrigido continua válido', editPlanV1Schema.safeParse(corrigido).success);
t('trilha abaixa e passa a abaixar na fala', corrigido.music!.gainDb <= -16 && corrigido.music!.duckUnderVoice);
t('o som em cima da palavra abaixou; o da pausa não', corrigido.soundEffects.find((s) => s.id === 's-alto')!.gainDb < 0 && corrigido.soundEffects.find((s) => s.id === 's-pausa')!.gainDb === 0);
t('legenda com 4 palavras por bloco', corrigido.captions.wordsPerBlock === 4);
t('o texto rápido ficou mais tempo', corrigido.overlays[0]!.durationMs > 800);
const aj = ajusteDaComposicao(corrigido.mediaLayers!.find((m) => m.id === 'anim1')!.composicao!);
t('a peça pequena ganhou escala', (aj?.elementos?.['mg-k.0']?.escala ?? 1) > 1.4);
// O rosto vai de y 500 a 900; acima dele há 272 px livres, e o cartão (300 px) cabe 9% menor.
const fimDoCartao = 560 + 150 + (aj?.y ?? 0) + (300 * (aj?.escala ?? 1)) / 2;
t('o cartão saiu de cima do rosto (subiu, um pouco menor)', (aj?.y ?? 0) < 0 && (aj?.escala ?? 1) < 1 && fimDoCartao <= 500);
t('uma correção por achado com conserto', feitos.length === achados.filter((a) => a.correcao).length);

// Rodar de novo no plano corrigido: o que foi corrigido sem medida nova some.
const segunda = revisarVideo(corrigido, { palavras });
t('segunda revisão: trilha, som, legenda e texto não voltam', !segunda.some((a) => ['trilha-alta', 'som-na-fala', 'bloco-longo', 'rapido'].includes(a.tipo)));

// Sem fala: não há o que cobrir nem legenda a conferir.
const semFala = revisarVideo(base, { palavras: [] });
t('sem fala: trilha alta não é problema', !semFala.some((a) => a.tipo === 'trilha-alta'));

const texto = resumoDaRevisao(feitos, achados.filter((a) => !a.correcao));
t('o resumo conta o que foi corrigido e o que conferir', texto.includes('corrigi') && texto.includes('conferir'));

// A legenda: palavras para a timeline, o pedido e a resposta da IA.
const naTimeline = palavrasDaRevisao({ ...base, clips: [{ ...base.clips[0]!, sourceStartMs: 1000, sourceEndMs: 5000, timelineStartMs: 0 }] } as EditPlanV1, [
  { id: 'a', word: 'fora', startMs: 500, endMs: 900, confidence: 0.9 },
  { id: 'b', word: 'vuatsap', startMs: 2000, endMs: 2500, confidence: 0.3 },
]);
t('palavras: só as que caem num trecho, no tempo da timeline', naTimeline.length === 1 && naTimeline[0]!.inicioMs === 1000 && naTimeline[0]!.confianca === 0.3);
const pedido = pedidoDaRevisaoDaLegenda(palavras, ['w4']);
t('o pedido da legenda traz a palavra entre colchetes com a frase', pedido.includes('[[vuatsap]]') && pedido.includes('id w4') && pedido.includes('que'));
const lidas = lerRevisaoDaLegenda(
  'Aqui: {"correcoes": [{"id": "w4", "texto": "WhatsApp"}, {"id": "w1", "texto": "uma frase inteira nova que reescreve a fala"}, {"id": "nao-existe", "texto": "x"}]}',
  palavras,
);
t('a resposta da IA: corrige a grafia, recusa reescrever e id inventado', lidas.length === 1 && lidas[0]!.text === 'WhatsApp' && lidas[0]!.original === 'vuatsap');
t('resposta ilegível: nada', lerRevisaoDaLegenda('não sei', palavras).length === 0);
t('palavra curta com pouca certeza não vai para a IA', !revisarVideo(base, { palavras: [{ id: 'z', texto: 'não', inicioMs: 0, fimMs: 100, confianca: 0.2 }] }).some((a) => a.tipo === 'palavra-incerta'));

// O áudio medido (LUFS): a trilha pelo que se ouve, não pelo número do plano.
const comDucking = { ...base, music: { ...base.music!, gainDb: -14, duckUnderVoice: true } } as EditPlanV1;
const alta = revisarVideo(comDucking, { palavras, audio: { voz: -24, musica: -9, trechos: {} } }).find((a) => a.id === 'audio|trilha-medida');
t('medida: trilha masterizada sob fala baixa cobre a voz -> abaixa', alta?.tipo === 'trilha-alta' && (alta.correcao as { gainDb: number }).gainDb < -14);
const certa = revisarVideo(comDucking, { palavras, audio: { voz: -15.5, musica: -16.2, trechos: {} } }).find((a) => a.id === 'audio|trilha-medida');
t('medida: trilha ~27 dB abaixo da voz -> fica', !certa);
const sumida = revisarVideo({ ...comDucking, music: { ...comDucking.music!, gainDb: -38 } } as EditPlanV1, { palavras, audio: { voz: -17.5, musica: -16.2, trechos: {} } }).find((a) => a.id === 'audio|trilha-medida');
t('medida: trilha inaudível (-38 dB) sobe, mas com moderação (24 dB abaixo)', sumida?.tipo === 'trilha-baixa' && Math.abs((sumida.correcao as { gainDb: number }).gainDb - (-17.5 - 24 + 16.2 + 12)) < 0.6);
const tresTrechos = { ...base, clips: ['a', 'b', 'c'].map((id, i) => ({ ...base.clips[0]!, id, sourceStartMs: i * 5000, sourceEndMs: i * 5000 + 5000, timelineStartMs: i * 5000 })) } as EditPlanV1;
const desiguais = revisarVideo(tresTrechos, { palavras, audio: { voz: -16, musica: null, trechos: { a: -16, b: -16.5, c: -24 } } }).filter((a) => a.tipo === 'trecho-desigual');
t('o trecho 8 dB mais baixo que os outros ganha volume; os iguais ficam', desiguais.length === 1 && desiguais[0]!.alvo === 'c');
const igualado = aplicarCorrecoes(tresTrechos, desiguais).plano;
t('o ganho entra só no trecho que destoava', igualado.clips.find((c) => c.id === 'c')!.audio?.gainDb === 7.5 && !igualado.clips.find((c) => c.id === 'a')!.audio);

// O contorno de luz em volta da pessoa: sai sempre.
const comContorno = { ...base, screenEffects: [{ id: 'e1', type: 'contorno_luz', timelineStartMs: 1000, durationMs: 3000, intensity: 0.8 }, { id: 'e2', type: 'vinheta', timelineStartMs: 5000, durationMs: 2000, intensity: 0.5 }] } as EditPlanV1;
const semContorno = aplicarCorrecoes(comContorno, revisarVideo(comContorno, { palavras: [] })).plano;
t('o contorno de luz sai; a vinheta fica', semContorno.screenEffects!.length === 1 && semContorno.screenEffects![0]!.type === 'vinheta');

// A composição: a nota e a escolha da versão.
const util = { x: 64, y: 1008, w: 856, h: 408 };
const cenaMeia = { ...cena, layout: 'meio_a_meio' as const, lado: 'baixo' as const };
const pequena: MedidasDaRevisao = { t: 1, pecas: [
  { chave: 'cena', campo: '', pai: null, r: { x: 50, y: 1002, w: 884, h: 420 }, letra: 56, texto: '' },
  { chave: 'mg-t.0', campo: 'titulo', pai: 'cena', r: { x: 100, y: 1100, w: 300, h: 60 }, rt: { x: 100, y: 1100, w: 300, h: 60 }, letra: 56, texto: 'VAI CULPAR' },
] };
const grande: MedidasDaRevisao = { t: 1, pecas: [pequena.pecas[0]!, { ...pequena.pecas[1]!, r: { x: 120, y: 1040, w: 700, h: 300 }, rt: { x: 120, y: 1040, w: 700, h: 300 } }] };
const cortada: MedidasDaRevisao = { t: 1, pecas: [pequena.pecas[0]!, { ...pequena.pecas[1]!, r: { x: -60, y: 1040, w: 1200, h: 300 }, rt: { x: -60, y: 1040, w: 1200, h: 300 } }] };
const n0 = notaDaComposicao(cenaMeia, pequena, null);
const n1 = notaDaComposicao(cenaMeia, grande, null);
const n2 = notaDaComposicao(cenaMeia, cortada, null);
t('composição: informação pequena num painel grande ocupa pouco', n0.ocupacao < 0.1 && util.w > 0);
t('composição: maior e dentro da área é melhor', versaoMelhor(n1, n0));
t('composição: maior mas cortada na borda nunca ganha', !versaoMelhor(n2, n0) && n2.graves > n0.graves);
t('composição: as candidatas incluem a cena maior para a informação pequena', candidatasDaComposicao('x', cenaMeia, pequena, [], null).some((c) => c.nome.startsWith('cena') || c.nome.startsWith('textos')));

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail) process.exit(1);
