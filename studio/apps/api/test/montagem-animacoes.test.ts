// ============================================================
// A montagem automática cria as animações (HyperFrames) com chamadas
// próprias: planeja os momentos, escreve cada animação em paralelo,
// corrige UMA vez a que vier com problema e grava a nota no projeto.
// Se a IA falhar, o vídeo sai sem animação -- com o motivo registrado.
// ============================================================

import { documentoDaComposicao, type EditPlanV1 } from '@makucho/studio-contracts';
import { AnimacoesDaFalaService } from '../src/modules/ai/animacoes-da-fala.service';
import { PropostaService } from '../src/modules/ai/proposta.service';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

const plano = {
  schemaVersion: '1.0',
  projectId: 'p1',
  sourceMediaId: 'm1',
  sourceDurationMs: 60_000,
  fps: 30,
  canvas: { aspectRatio: '9:16', width: 1080, height: 1920 },
  targetDurationMs: 30_000,
  framework: 'authority_education',
  clips: [{ id: 'c1', sourceStartMs: 0, sourceEndMs: 30_000, timelineStartMs: 0, role: 'hook', transcriptSegmentIds: ['s1'], semanticRisk: 'low', reason: 'x', origin: 'fala' }],
  captions: { enabled: true, styleId: 'padrao', wordsPerBlock: 3, position: 'bottom', highlightActiveWord: true },
  overlays: [],
  soundEffects: [],
  transitions: [],
  render: { fps: 30, videoCodec: 'h264', audioCodec: 'aac', crf: 23, audioBitrateKbps: 128, loudnessTargetLufs: -14 },
} as unknown as EditPlanV1;

const palavras = 'o google acabou de lançar o gemini três ponto oito flash tts uma voz muito mais natural e ela consegue rir suspirar e sussurrar'
  .split(' ')
  .map((w, i) => ({ startMs: 500 + i * 700, word: w }));

const boa = (titulo: string) => JSON.stringify({ titulo, html: '<div id="a" class="t">Gemini</div>', css: ".t { font-family: 'Inter ExtraBold'; font-size: 90px; }", script: "tl.fromTo('#a', { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4 }, 0.5);" });
const ruim = JSON.stringify({ titulo: 'x', html: '<div id="a">x</div>', css: '', script: "tl.to('#a', { x: Math.random() }, 0);" });

function montar(respostas: (usuario: string, sistema: string) => string) {
  let atual: EditPlanV1 = JSON.parse(JSON.stringify(plano));
  const notas: string[] = [];
  const chamadas: string[] = [];
  const pedidos: string[] = [];
  const prisma = {
    transcriptWord: { findMany: async () => palavras },
    project: {
      findUnique: async () => ({ id: 'p1', state: 'ANALYZING' }),
      update: async (a: { data: { animationNote?: string } }) => {
        if (a.data.animationNote) notas.push(a.data.animationNote);
      },
    },
  };
  const ai = {
    chamar: async (p: { usuario: string; sistema: string; tempoMaximoMs?: number }) => {
      chamadas.push(p.sistema.includes('diretor') ? `planejar:${p.tempoMaximoMs}` : `escrever:${p.tempoMaximoMs}`);
      return { texto: respostas(p.usuario, p.sistema) };
    },
  };
  const planos = { atual: async () => ({ document: atual }), salvar: async (_t: unknown, _p: string, doc: EditPlanV1) => { atual = doc; } };
  // A conferência de layout: devolve um problema enquanto o título tiver "Sobreposta".
  const layoutRuim = { vezes: 0 };
  const animacoes = {
    problemas: async () => [],
    problemasDeLayout: async (c: { titulo?: string }) => {
      if (!c.titulo?.includes('Sobreposta')) return [];
      layoutRuim.vezes += 1;
      return ['o texto "2023" invade a área reservada (legenda do vídeo) aos 1.4 s'];
    },
    preparar: async (_t: unknown, _p: string, c: { titulo?: string }) => { pedidos.push(c.titulo ?? '?'); return {}; },
  };
  const servico = new AnimacoesDaFalaService(prisma as never, ai as never, planos as never, animacoes as never);
  return { servico, notas, chamadas, pedidos, atual: () => atual, prisma, planos, layoutRuim };
}

async function main() {
  const sistema = { userId: 'sistema', workspaceId: 'w', role: 'OWNER' } as const;
  const plan = JSON.stringify({ momentos: [
    { inicioS: 1, fimS: 7, layout: 'meio_a_meio', ideia: 'o nome do modelo', palavras: [] },
    { inicioS: 9, fimS: 14, layout: 'cartao', ideia: 'voz natural', palavras: [] },
    { inicioS: 10, fimS: 12, layout: 'cartao', ideia: 'sobrepõe a anterior: fica de fora', palavras: [] },
  ] });

  // 1. Caminho feliz, com uma animação corrigida na segunda tentativa.
  let tentativasDaSegunda = 0;
  const a = montar((usuario, sistema2) => {
    if (sistema2.includes('diretor')) return plan;
    if (usuario.includes('voz natural')) return (tentativasDaSegunda += 1) === 1 ? ruim : boa('Voz natural');
    return '```json\n' + boa('Gemini') + '\n```';
  });
  const r = await a.servico.criarNaMontagem(sistema as never, 'p1');
  const camadas = a.atual().mediaLayers ?? [];
  t('planeja uma vez e escreve uma animação por momento, com mais tempo que as outras chamadas', a.chamadas[0] === 'planejar:150000' && a.chamadas.filter((c) => c === 'escrever:240000').length === 3);
  t('momento que sobrepõe outro fica de fora', r.criadas === 2 && camadas.length === 2);
  t('a que veio com problema foi corrigida (uma volta a mais)', tentativasDaSegunda === 2 && camadas.some((m) => m.composicao?.titulo === 'Voz natural'));
  t('entram como camada html no instante e no layout planejados', camadas[0]?.kind === 'html' && camadas[0].timelineStartMs === 1000 && camadas[0].composicao?.layout === 'meio_a_meio' && camadas[1]?.composicao?.layout === 'cartao');
  t('o vídeo de cada uma já é pedido e a nota fica no projeto', a.pedidos.length === 2 && a.notas.some((n) => n.startsWith('A IA criou 2 animações')));

  // 1b. O estilo que a IA escolhe vai para a escrita (o cartão de referência dele) e para a nota.
  const sistemas: string[] = [];
  const e = montar((usuario, sis) => {
    if (sis.includes('diretor')) return JSON.stringify({ estilo: 'editorial', cartoes: [{ inicioS: 1, fimS: 7, layout: 'meio_a_meio', lado: 'baixo', tipo: 'citacao', intencao: 'a frase forte', conteudo: { titulo: 'Gemini' } }] });
    sistemas.push(sis);
    return boa('Gemini');
  });
  const re = await e.servico.criarNaMontagem(sistema as never, 'p1');
  const ce = e.atual().mediaLayers?.[0]?.composicao;
  t('o estilo escolhido chega à escrita com o cartão de referência', re.criadas === 1 && sistemas[0]!.includes('ESTILO DO VÍDEO: Editorial') && sistemas[0]!.includes('ref-editorial'));
  t('meio a meio respeita o lado planejado e o estilo pinta o próprio fundo', ce?.lado === 'baixo' && ce?.semFundo === true && e.notas.some((n) => n.includes('estilo Editorial')));
  const docF = documentoDaComposicao({ html: '<p>x</p>', css: ".t { font-family: 'Playfair Display'; }", script: 'tl.to("p", { opacity: 1 }, 0);', layout: 'cartao' }, { duracaoMs: 3000, gsap: 'g.js', fontes: '/fonts/', origens: "'self'" });
  t('o documento carrega as fontes que o CSS usa (e não as outras)', docF.includes("url('/fonts/PlayfairDisplay-Bold.ttf')") && docF.includes('Inter-SemiBold.ttf') && !docF.includes('Bangers'));

  // 1c. Refazer no editor: outro estilo mantém o que a animação explica; um pedido edita em cima da atual.
  const idE = e.atual().mediaLayers![0]!.id;
  const usuarios: string[] = [];
  const f = montar((usuario, sis) => {
    usuarios.push(usuario);
    sistemas.push(sis);
    return boa('Gemini novo');
  });
  // o plano do segundo harness começa com a animação do primeiro
  await f.planos.salvar(null, 'p1', e.atual());
  const rf = await f.servico.refazerNoProjeto(sistema as never, 'p1', [idE], { estilo: 'swiss-pulse' });
  const cf = f.atual().mediaLayers![0]!.composicao!;
  t('trocar o estilo redesenha no estilo novo e guarda o que ela explica', rf.feitas === 1 && cf.estilo === 'swiss-pulse' && cf.briefing?.includes('a frase forte') === true && sistemas.at(-1)!.includes('Swiss Pulse') && sistemas.at(-1)!.includes('IDENTIDADE'));
  await f.servico.refazerNoProjeto(sistema as never, 'p1', 'todas', { pedido: 'troca o vermelho pelo verde' });
  t('o pedido da pessoa vai com a animação atual para editar em cima', usuarios.at(-1)!.includes('PEDIDO DA PESSOA') && usuarios.at(-1)!.includes('troca o vermelho pelo verde') && usuarios.at(-1)!.includes('Gemini'));

  // 1d. Estilo escolhido pela pessoa, preset de quadro, pip e paleta.
  const sis2: string[] = [];
  const us2: string[] = [];
  const g = montar((usuario, sis) => {
    if (sis.includes('diretor')) {
      sis2.push(sis);
      return JSON.stringify({ estilo: 'editorial', cartoes: [{ inicioS: 1, fimS: 7, layout: 'pip', canto: 'sup-esq', tipo: 'lista', intencao: 'os passos', conteudo: 'um, dois, três' }] });
    }
    sis2.push(sis);
    us2.push(usuario);
    return boa('Passos');
  });
  (g.prisma.project as unknown as { findUnique: () => Promise<unknown> }).findUnique = async () => ({ id: 'p1', state: 'ANALYZING', animationStyle: 'coral' });
  await g.servico.criarNaMontagem(sistema as never, 'p1');
  const cg = g.atual().mediaLayers?.[0]?.composicao;
  t('o estilo que a pessoa escolheu vale sobre o da IA (e o preset vai com o sistema de design)', cg?.estilo === 'coral' && sis2[0]!.includes('ESTILO JÁ ESCOLHIDO PELA PESSOA: coral') && sis2[1]!.includes('SISTEMA DE DESIGN'));
  t('pip: a janela no canto pedido e a IA sabe onde não pôr conteúdo', cg?.layout === 'pip' && cg?.canto === 'sup-esq' && us2[0]!.includes('GRADE DE SEGURANÇA (vídeo no canto (pip)') && us2[0]!.includes('RESERVADA (janela do vídeo): left 40, top 168'));
  await g.servico.refazerNoProjeto(sistema as never, 'p1', 'todas', { paleta: 'neon-electric:1' });
  const cp = g.atual().mediaLayers![0]!.composicao!;
  t('paleta: recolore sem redesenhar (pedido com a animação atual) e fica guardada', cp.paleta === 'neon-electric:1' && sis2.at(-1)!.startsWith('PALETA ESCOLHIDA (Neon)') && us2.at(-1)!.includes('Troque as cores pela PALETA ESCOLHIDA'));

  // 1e. Conferência de sobreposição: o problema volta para a IA; se persistir, a animação entra mesmo assim.
  const us3: string[] = [];
  let respostas = 0;
  const h = montar((usuario, sis) => {
    if (sis.includes('diretor')) return JSON.stringify({ estilo: 'editorial', cartoes: [{ inicioS: 1, fimS: 7, layout: 'tela_cheia', tipo: 'numero', intencao: 'o ano', conteudo: '2023' }] });
    us3.push(usuario);
    respostas += 1;
    return boa(respostas === 1 ? 'Sobreposta' : 'Arrumada');
  });
  const rh = await h.servico.criarNaMontagem(sistema as never, 'p1');
  t('conferência: o problema de layout volta para a IA corrigir', rh.criadas === 1 && us3[1]!.includes('invade a área reservada (legenda do vídeo)') && h.atual().mediaLayers![0]!.composicao!.titulo === 'Arrumada');
  const k = montar((_u, sis) => (sis.includes('diretor') ? JSON.stringify({ estilo: 'editorial', cartoes: [{ inicioS: 1, fimS: 7, layout: 'tela_cheia', tipo: 'numero', intencao: 'o ano' }] }) : boa('Sobreposta')));
  const rk = await k.servico.criarNaMontagem(sistema as never, 'p1');
  t('conferência: se só sobrar problema de layout, a animação entra mesmo assim', rk.criadas === 1 && k.layoutRuim.vezes === 2);

  // 2. IA fora do ar: sem animação, mas com o motivo gravado.
  const b = montar(() => {
    throw Object.assign(new Error('x'), { publico: 'a chave da IA foi recusada' });
  });
  const rb = await b.servico.criarNaMontagem(sistema as never, 'p1');
  t('IA fora do ar: nenhuma animação e o motivo vai para o projeto', rb.criadas === 0 && b.notas.some((n) => n.includes('a chave da IA foi recusada')));

  // 3. A montagem chama o serviço e entrega mesmo quando ele não cria nada.
  const estados: string[] = [];
  const s = new PropostaService(
    { project: { findUnique: async () => ({ id: 'p1', state: 'ANALYZING' }), update: async (x: { data: { state?: string } }) => { if (x.data.state) estados.push(x.data.state); } } } as never,
    { analisar: async () => ({ ok: true, plano, confianca: 0.9, avisos: [], problemas: [] }) } as never,
    { salvar: async () => undefined, atual: async () => ({ document: plano }) } as never,
    { publicarProgresso: async () => undefined } as never,
    { separarNaMontagem: async () => 0 } as never,
    { criarNaMontagem: async () => ({ criadas: 3, nota: 'ok' }) } as never,
  );
  const rp = await s.gerar('w', 'p1');
  t('a montagem cria as animações antes de entregar e avisa quantas', rp.avisos.some((x) => x.includes('3 animações')) && estados.includes('PROPOSAL_READY'));

  console.log(`\n${ok} ok, ${fail} falha(s)`);
  if (fail) process.exit(1);
}

void main();
