// ============================================================
// A direção visual (cartões com gatilho, fidelidade, respiro, espaço
// reservado, leitura de resposta cortada) e a ancoragem na fala.
// ============================================================

import { aplicarOperacao, conferirCartoes, janelasReservadasDoPlano, lerDirecao, numerosDoTexto, numerosInventados, textoVisivelDoHtml, zoomsEscondidos } from '../src';
import type { EditPlanV1, PalavraNoTempo } from '../src';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

// ---------- Leitura ----------
const inteira = lerDirecao('```json\n{"estilo":"swiss","tom":"x","cartoes":[{"inicioS":5,"fimS":9}]}\n```');
t('lê a resposta inteira', !inteira.cortada && inteira.estilo === 'swiss' && inteira.cartoes.length === 1);
const cortada = lerDirecao('{"estilo":"coral","cartoes":[{"inicioS":5,"fimS":9,"conteudo":{"titulo":"a } b"}},{"inicioS":20,"fimS":2');
t('resposta cortada: fica o cartão completo', cortada.cortada && cortada.estilo === 'coral' && cortada.cartoes.length === 1 && cortada.cartoes[0]!.inicioS === 5);
let semRoteiro = false;
try {
  lerDirecao('não sei');
} catch {
  semRoteiro = true;
}
t('sem roteiro nenhum: erro com motivo', semRoteiro);

// ---------- Números ----------
t('números em dígitos', numerosDoTexto('R$ 1.500 e 2,5% e 87%').join(',') === '1500,2.5,87');
t('números por extenso', numerosDoTexto('vinte e cinco mil pessoas e oitenta e sete por cento').includes(25000) && numerosDoTexto('oitenta e sete por cento').includes(87));
t('"3 mil" vale 3000', numerosDoTexto('3 mil clientes').includes(3000));
t('número dito não é inventado', numerosInventados('{"dado":"87%"}', 'são oitenta e sete por cento das lojas').length === 0);
t('número não dito é inventado', numerosInventados('{"dado":"92%"}', 'são oitenta e sete por cento das lojas').join() === '92');
t('numeração pequena passa (lista, passos)', numerosInventados('1 2 3 passos', 'faça assim').length === 0);
t('texto visível do html', textoVisivelDoHtml('<div>Olá <b>87%</b></div><style>.a{x:99}</style><script>var y=1234</script>') === 'Olá 87%');

// ---------- Conferência ----------
const fala = (s: number, texto: string): PalavraNoTempo[] => texto.split(' ').map((p, i) => ({ s: s + i * 0.4, texto: p }));
const palavras: PalavraNoTempo[] = [
  ...fala(1, 'olha só isso aqui'),
  ...fala(10, 'oitenta e sete por cento das lojas perdem vendas'),
  ...fala(22, 'primeiro responda rápido segundo use o nome terceiro feche a venda'),
  ...fala(40, 'isso muda tudo pra você'),
  ...fala(55, 'segue pra mais'),
];
const reservadas = [
  { inicioS: 0, fimS: 3, motivo: 'título da abertura' },
  { inicioS: 56, fimS: 60, motivo: 'chamada do fim' },
];
const r = conferirCartoes(
  [
    { inicioS: 10, fimS: 15, tipo: 'numero', layout: 'meio_a_meio', gatilho: 'oitenta e sete por cento das lojas', conteudo: { dado: '87%' }, prioridade: 1 },
    { inicioS: 11, fimS: 14, tipo: 'numero', layout: 'cartao', gatilho: 'perdem vendas', conteudo: { dado: '92%' }, prioridade: 2 },
    { inicioS: 22, fimS: 28, tipo: 'lista', layout: 'pip', canto: 'sup-esq', gatilho: 'primeiro responda rápido segundo use o nome', conteudo: { itens: ['Responda rápido', 'Use o nome', 'Feche'] }, prioridade: 1 },
    { inicioS: 30, fimS: 35, tipo: 'destaque', layout: 'tela_cheia', gatilho: 'crescimento exponencial', conteudo: 'x', prioridade: 3 },
    { inicioS: 0.5, fimS: 2.5, tipo: 'citacao', layout: 'cartao', gatilho: 'olha só isso', conteudo: 'x', prioridade: 2 },
    { inicioS: 55, fimS: 59, tipo: 'citacao', layout: 'cartao', gatilho: 'segue pra mais', conteudo: 'x', prioridade: 2 },
  ],
  { duracaoS: 60, palavras, reservadas },
);
t('entram os cartões com gatilho e fiéis', r.aceitos.map((c) => c.tipo).join() === 'numero,lista');
const motivos = r.descartados.map((d) => d.motivo).join(' | ');
t('número inventado sai', motivos.includes('92'));
t('gatilho que não está na fala sai', motivos.includes('crescimento exponencial'));
t('não cobre o título da abertura', motivos.includes('título da abertura'));
t('não cobre a chamada do fim', motivos.includes('chamada do fim'));
t('zero cartões é válido', conferirCartoes([], { duracaoS: 60, palavras, reservadas }).aceitos.length === 0);

// Respiro: no máximo metade do vídeo com gráfico
const muitos = Array.from({ length: 8 }, (_, i) => ({ inicioS: i * 7 + 0.5, fimS: i * 7 + 6.5, tipo: 'destaque', layout: 'cartao', gatilho: 'isso', conteudo: 'x', prioridade: 2 }));
const falaDensa = Array.from({ length: 200 }, (_, i) => ({ s: i * 0.3, texto: 'isso' }));
const rr = conferirCartoes(muitos, { duracaoS: 60, palavras: falaDensa, reservadas: [] });
const coberto = rr.aceitos.reduce((s, c) => s + c.fimS - c.inicioS, 0);
t('no máximo metade do vídeo coberto', coberto <= 30 && rr.aceitos.length < 8);

// Resposta em milissegundos por engano
const ms = conferirCartoes([{ inicioS: 10000, fimS: 15000, tipo: 'numero', gatilho: 'oitenta e sete', conteudo: '87' }], { duracaoS: 60, palavras, reservadas: [] });
t('instantes em ms são convertidos', ms.aceitos.length === 1 && ms.aceitos[0]!.inicioS === 10);

// ---------- Plano ----------
const plano: EditPlanV1 = {
  schemaVersion: '1.0',
  projectId: 'p1',
  sourceMediaId: 'm1',
  sourceDurationMs: 30_000,
  fps: 30,
  canvas: { aspectRatio: '9:16', width: 1080, height: 1920 },
  targetDurationMs: 30_000,
  framework: 'authority_education',
  clips: [
    { id: 'c1', sourceStartMs: 0, sourceEndMs: 10_000, timelineStartMs: 0, role: 'hook', transcriptSegmentIds: ['s1'], semanticRisk: 'low', reason: 'a', effect: 'zoom_lento' },
    { id: 'c2', sourceStartMs: 10_000, sourceEndMs: 20_000, timelineStartMs: 10_000, role: 'proof', transcriptSegmentIds: ['s2'], semanticRisk: 'low', reason: 'b', effect: 'punch_in' },
    { id: 'c3', sourceStartMs: 20_000, sourceEndMs: 30_000, timelineStartMs: 20_000, role: 'payoff', transcriptSegmentIds: ['s3'], semanticRisk: 'low', reason: 'c' },
  ],
  captions: { enabled: true, styleId: 'padrao', wordsPerBlock: 1, position: 'top', highlightActiveWord: false, corrections: [], posicoes: [{ inicioMs: 22_000, fimMs: 24_000, y: 0.5 }] },
  overlays: [
    { id: 'ov-titulo', component: 'HookTitle', text: 'Olá', timelineStartMs: 0, durationMs: 3000 },
    { id: 'ov-chamada', component: 'CTA', text: 'Siga', timelineStartMs: 27_000, durationMs: 3000 },
    { id: 'ov-meio', component: 'Destaque', text: 'OLHA', timelineStartMs: 21_000, durationMs: 2000 },
  ],
  soundEffects: [],
  transitions: [],
  mediaLayers: [
    { id: 'h1', assetId: 'html', kind: 'html', timelineStartMs: 12_000, durationMs: 4000, layout: 'tela_cheia', composicao: { layout: 'meio_a_meio', lado: 'cima', html: '<p>x</p>', css: '', script: 'tl.to("p",{opacity:1},0);' } },
    { id: 'h2', assetId: 'html', kind: 'html', timelineStartMs: 22_000, durationMs: 4000, layout: 'tela_cheia', composicao: { layout: 'meio_a_meio', lado: 'cima', html: '<p>x</p>', css: '', script: 'tl.to("p",{opacity:1},0);' } },
  ],
  render: { fps: 30, videoCodec: 'h264', audioCodec: 'aac', crf: 23, audioBitrateKbps: 128, loudnessTargetLufs: -14 },
};

const res = janelasReservadasDoPlano(plano).map((j) => j.motivo);
t('reservadas: título, chamada e o que já está no vídeo', res.includes('título da abertura') && res.includes('chamada do fim') && res.filter((m) => m === 'outra animação').length === 2);
t('zoom escondido sob tela cheia sai', zoomsEscondidos(plano, [{ inicioS: 10, fimS: 19, layout: 'tela_cheia' }]).join() === 'c2');
t('zoom sob meio a meio fica', zoomsEscondidos(plano, [{ inicioS: 10, fimS: 19, layout: 'meio_a_meio' }]).length === 0);

// ---------- Ancoragem ----------
const semPrimeiro = aplicarOperacao(plano, { op: 'alternar_clipe', clipId: 'c1', enabled: false });
const p1 = semPrimeiro.plan!;
const h2 = p1.mediaLayers?.find((m) => m.id === 'h2');
t('apagar o primeiro trecho: a animação segue a fala (22 s -> 12 s)', semPrimeiro.ok && h2?.timelineStartMs === 12_000);
t('o texto do meio segue a fala (21 s -> 11 s)', p1.overlays.find((o) => o.id === 'ov-meio')?.timelineStartMs === 11_000);
t('o título continua na abertura', p1.overlays.find((o) => o.id === 'ov-titulo')?.timelineStartMs === 0);
const cta = p1.overlays.find((o) => o.id === 'ov-chamada');
t('a chamada continua no fim', !!cta && cta.timelineStartMs + cta.durationMs === 20_000);
t('a posição da legenda por trecho segue a fala', p1.captions.posicoes?.[0]?.inicioMs === 12_000 && p1.captions.posicoes?.[0]?.fimMs === 14_000);

const semMeio = aplicarOperacao(plano, { op: 'alternar_clipe', clipId: 'c2', enabled: false }).plan!;
t('a animação cuja fala saiu do vídeo sai junto', !semMeio.mediaLayers?.some((m) => m.id === 'h1') && semMeio.mediaLayers?.find((m) => m.id === 'h2')?.timelineStartMs === 12_000);

const trocados = aplicarOperacao(plano, { op: 'reordenar', clipIds: ['c3', 'c1', 'c2'] } as never);
if (trocados.ok) t('reordenar: a animação vai junto com o trecho (22 s -> 2 s)', trocados.plan!.mediaLayers?.find((m) => m.id === 'h2')?.timelineStartMs === 2000);
else t(`reordenar aceito (${trocados.erro})`, false);

const rapido = aplicarOperacao(plano, { op: 'definir_velocidade', clipId: 'c1', speed: 2 });
if (rapido.ok) t('acelerar o primeiro trecho: o que vem depois adianta (22 s -> 17 s)', Math.abs((rapido.plan!.mediaLayers?.find((m) => m.id === 'h2')?.timelineStartMs ?? 0) - 17_000) <= 50);
else t(`velocidade aceita (${rapido.erro})`, false);

const naoMexe = aplicarOperacao(plano, { op: 'configurar_legenda', wordsPerBlock: 2 });
t('operação que não mexe nos trechos não move nada', naoMexe.plan!.mediaLayers?.find((m) => m.id === 'h2')?.timelineStartMs === 22_000);

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail) process.exit(1);
