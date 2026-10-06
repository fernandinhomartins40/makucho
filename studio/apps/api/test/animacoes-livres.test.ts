// ============================================================
// A direção LIVRE das animações (STUDIO_ANIMACOES_MODO=livre): a IA escreve o design do
// vídeo, desenha cada cena com ele e a crítica olha os quadros.
//
//   - o design da direção chega ao desenho e vira o tema da animação;
//   - as regras duras continuam valendo (âncora na fala, número dito);
//   - cena com nota baixa volta com o parecer, e fica a de melhor nota;
//   - sem fotos, sem crítica -- a cena entra do mesmo jeito;
//   - a direção livre fora do ar cai nos cartões, não em vídeo sem animação;
//   - o estilo que a pessoa escolheu continua valendo sobre tudo.
// ============================================================

// O padrão agora são os presets (animacoes-presets.test.ts): aqui, o modo livre.
process.env.STUDIO_ANIMACOES_MODO = 'livre';
delete process.env.STUDIO_RODADAS_DE_CRITICA;

import { problemasDaComposicao, type EditPlanV1, type RelatorioDasAnimacoes } from '@makucho/studio-contracts';
import { AnimacoesDaFalaService } from '../src/modules/ai/animacoes-da-fala.service';
import { skill } from '../src/modules/ai/skills';

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

const cena = (titulo: string) => JSON.stringify({ titulo, html: '<div id="a" class="t">Gemini</div>', css: '.t { font-family: var(--fonte-titulo); font-size: 90px; color: var(--cor-destaque); }', script: "tl.fromTo('#a', { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4 }, 0.5);" });

const direcao = (cenas: unknown[]) =>
  JSON.stringify({
    conceito: 'A voz vira onda: tudo nasce de uma linha de áudio',
    tom: 'curiosidade',
    design: {
      paleta: { fundo: '#101418', texto: '#f4efe6', apagado: '#8a8f98', destaque: '#ff5a3c', destaque2: '#ffd166', destaque3: 'vermelho' },
      fonteTitulo: 'DM Serif Display',
      fonteTexto: 'Fonte Que Não Existe',
      linguagem: 'Linhas finas de onda sonora como motivo; rótulos em caixa alta no canto.',
      movimento: 'Entradas em expo.out de 0,5 s; nada quica.',
    },
    cenas,
  });

const CENAS = [
  { inicioS: 1, fimS: 7, layout: 'meio_a_meio', lado: 'baixo', nome: 'o nome', tecnica: 'manchete', papel: 'gancho', ancora: 'o google acabou de lançar o gemini', intencao: 'o nome do modelo', conceito: 'A onda desenha o nome letra a letra.', batidas: [{ palavra: '', acao: 'a tarja ENTRA' }, { palavra: 'gemini', acao: 'o nome SOBE por máscara' }], conteudo: { textos: ['Gemini'] }, prioridade: 1 },
  { inicioS: 9, fimS: 14, layout: 'tela_cheia', nome: 'a voz', ancora: 'uma voz muito mais natural', intencao: 'voz natural', conceito: 'A linha reta vira onda viva.', prioridade: 1 },
  { inicioS: 16, fimS: 21, layout: 'tela_cheia', nome: 'os verbos', ancora: 'rir suspirar e sussurrar', intencao: 'três emoções', conceito: 'Três palavras, uma por batida.', prioridade: 2 },
];

type Pedido = { chamada: string; sistema: string; usuario: string; imagens?: string[]; modelo?: string; raciocinio?: string; maxTokens: number };

function montar(responder: (p: Pedido) => string, o: { fotos?: string[] | null; projeto?: Record<string, unknown> } = {}) {
  let atual: EditPlanV1 = JSON.parse(JSON.stringify(plano));
  const notas: string[] = [];
  const relatorios: RelatorioDasAnimacoes[] = [];
  const pedidos: Pedido[] = [];
  let fotografadas = 0;
  const prisma = {
    transcriptWord: { findMany: async () => palavras },
    project: {
      findUnique: async () => ({ id: 'p1', state: 'ANALYZING', ...(o.projeto ?? {}) }),
      update: async (a: { data: { animationNote?: string; animationReport?: RelatorioDasAnimacoes } }) => {
        if (a.data.animationNote) notas.push(a.data.animationNote);
        if (a.data.animationReport) relatorios.push(JSON.parse(JSON.stringify(a.data.animationReport)));
      },
    },
  };
  const ai = {
    chamar: async (p: Pedido) => {
      pedidos.push(p);
      return { texto: responder(p) };
    },
  };
  const planos = { atual: async () => ({ document: atual }), salvar: async (_t: unknown, _p: string, doc: EditPlanV1) => { atual = doc; } };
  const animacoes = {
    corDaMarca: async () => '#00aa55',
    problemas: async () => [],
    problemasDeLayout: async () => [],
    fotografar: async () => {
      fotografadas += 1;
      return o.fotos === undefined ? ['/9j/a', '/9j/b', '/9j/c'] : o.fotos;
    },
    preparar: async () => ({}),
  };
  const servico = new AnimacoesDaFalaService(prisma as never, ai as never, planos as never, animacoes as never);
  return { servico, notas, relatorios, pedidos, atual: () => atual, planos, fotografadas: () => fotografadas };
}

async function main() {
  const sistema = { userId: 'sistema', workspaceId: 'w', role: 'OWNER' } as const;

  // 1. O caminho inteiro: direção com design, desenho por cena, crítica que aprova.
  const a = montar((p) => (p.chamada === 'dirigir_animacoes' ? direcao(CENAS) : p.chamada === 'criticar_animacao' ? '{"nota": 8, "problemas": []}' : cena('Gemini')));
  const ra = await a.servico.criarNaMontagem(sistema as never, 'p1');
  const camadas = a.atual().mediaLayers ?? [];
  const dir = a.pedidos.find((p) => p.chamada === 'dirigir_animacoes')!;
  const desenhos = a.pedidos.filter((p) => p.chamada === 'desenhar_animacao');
  const criticas = a.pedidos.filter((p) => p.chamada === 'criticar_animacao');
  t('a direção livre: uma direção, um desenho por cena e uma crítica por cena', ra.criadas === 3 && !!dir && desenhos.length === 3 && criticas.length === 3);
  t('a direção não recebe catálogo de estilos nem lista de tipos de cartão', dir.sistema.includes('DIRETOR DE CRIAÇÃO') && !dir.sistema.includes('talking-head-recut') && !dir.sistema.includes('GATILHOS'));
  t('a cor da marca vai como informação', dir.usuario.includes('Cor principal da marca: #00aa55'));
  t('o design da direção chega ao desenho (conceito, cores, linguagem, movimento)', desenhos.every((p) => p.sistema.includes('A voz vira onda') && p.sistema.includes('#ff5a3c') && p.sistema.includes('onda sonora') && p.sistema.includes('expo.out')));
  t('o desenho não recebe cartão de referência para copiar', desenhos.every((p) => !p.sistema.includes('Cartão de REFERÊNCIA') && !p.sistema.includes('ESTILO DO VÍDEO')));
  t('o desenho carrega a skill de motion graphics (batidas, curvas, receitas, conferência)', desenhos.every((p) => ['SKILL: MOTION GRAPHICS', 'Pense em batidas', 'pathLength="1"', 'O que denuncia o amador', 'Antes de responder, confira'].every((x) => p.sistema.includes(x))));
  t('as receitas da skill passam nas regras técnicas do Studio', problemasDaComposicao({ html: '<p>x</p>', css: '', script: skill('motion-graphics').texto, layout: 'tela_cheia' }).length === 0 && skill('motion-graphics').versao === 'motion-graphics-v3');
  const doNome = desenhos.find((p) => p.usuario.includes('A onda desenha o nome'))!;
  t('o desenho recebe o módulo da técnica e as batidas no segundo medido da fala', doNome.usuario.includes('TÉCNICA DESTA CENA: Manchete') && /\d\.\d\d s {2}"gemini" {2}-> {2}o nome SOBE/.test(doNome.usuario));
  t('a direção recebe a análise do vídeo e o repertório de técnicas', dir.usuario.includes('ANÁLISE DO VÍDEO ENVIADO') && dir.sistema.includes('dado_em_destaque') && dir.sistema.includes('batidas'));
  t('o relatório traz a análise em uma linha para a pessoa', typeof a.relatorios.at(-1)?.analise === 'string' && !a.relatorios.at(-1)!.analise!.includes('\n'));
  t('a encenação de cada cena vai no pedido dela', desenhos.some((p) => p.usuario.includes('A onda desenha o nome letra a letra')) && desenhos.some((p) => p.usuario.includes('A linha reta vira onda viva')));
  t('o mesmo sistema em todas as cenas do vídeo (prefixo igual: cache de contexto)', new Set(desenhos.map((p) => p.sistema)).size === 1);
  const c0 = camadas[0]?.composicao;
  t('a animação guarda o tema do vídeo, sem estilo do catálogo', !!c0?.tema && !c0.estilo && c0.tema.fundo === '#101418' && c0.tema.destaque === '#ff5a3c');
  t('fonte que existe vale; a que não existe e o hex torto caem no padrão', c0?.tema?.fonteTitulo === "'DM Serif Display'" && c0?.tema?.fonteTexto === "'Inter SemiBold'" && /^#[0-9a-f]{6}$/i.test(c0?.tema?.destaque3 ?? ''));
  t('duas telas cheias entram (o limite de uma é só dos cartões)', camadas.filter((m) => m.composicao?.layout === 'tela_cheia').length === 2);
  t('a legenda acompanha o destaque do design', a.atual().captions.highlightColor === '#ff5a3c');
  const rel = a.relatorios.at(-1)!;
  t('o relatório guarda o design (as cenas refeitas depois seguem o mesmo) e a nota de cada cena', rel.design?.conceito.includes('onda') === true && rel.estilo === 'Direção livre' && rel.escrita.every((e) => e.critica?.nota === 8 && e.critica.refeita === 0));
  t('a nota do projeto fala em direção própria', a.notas.some((n) => n.startsWith('A IA criou 3 animações com direção própria')));
  t('a crítica recebe as três fotos e o design', criticas.every((p) => p.imagens?.length === 3 && p.usuario.includes('A voz vira onda') && p.usuario.includes('quadro 1 aos')));

  // 2. Regras duras: âncora que não está na fala e número que não foi dito saem.
  const b = montar((p) =>
    p.chamada === 'dirigir_animacoes'
      ? direcao([
          { inicioS: 1, fimS: 7, layout: 'cartao', nome: 'x', ancora: 'crescimento exponencial', intencao: 'x', conceito: 'x' },
          { inicioS: 9, fimS: 14, layout: 'cartao', nome: 'y', ancora: 'uma voz muito mais natural', intencao: 'y', conceito: 'y', conteudo: { textos: ['95% mais natural'] } },
        ])
      : cena('x'),
  );
  const rb = await b.servico.criarNaMontagem(sistema as never, 'p1');
  const motivos = (b.relatorios.at(-1)?.descartados ?? []).map((d) => d.motivo).join(' | ');
  t('liberdade não inclui inventar: âncora fora da fala e número não dito saem', rb.criadas === 0 && motivos.includes('crescimento exponencial') && motivos.includes('95') && !b.pedidos.some((p) => p.chamada === 'desenhar_animacao'));

  // 3. A crítica reprova: a cena volta com o parecer e a segunda versão entra.
  let versao = 0;
  const c = montar((p) => {
    if (p.chamada === 'dirigir_animacoes') return direcao([CENAS[0]]);
    if (p.chamada === 'criticar_animacao') return p.usuario.includes('o nome do modelo') && c.pedidos.filter((x) => x.chamada === 'criticar_animacao').length === 1 ? '{"nota": 4, "problemas": ["título pequeno e centralizado como slide no quadro 2: aumente e ancore à esquerda"]}' : '{"nota": 8.5, "problemas": []}';
    versao += 1;
    return cena(versao === 1 ? 'Fraca' : 'Refeita');
  });
  const rc = await c.servico.criarNaMontagem(sistema as never, 'p1');
  const refazer = c.pedidos.filter((p) => p.chamada === 'desenhar_animacao')[1];
  t('cena reprovada volta para a IA com o parecer de quem viu os quadros', rc.criadas === 1 && !!refazer && refazer.usuario.includes('OLHOU OS QUADROS RENDERIZADOS') && refazer.usuario.includes('nota 4 de 10') && refazer.usuario.includes('ancore à esquerda') && refazer.usuario.includes('Fraca'));
  t('entra a versão refeita, com a nota nova no relatório', c.atual().mediaLayers?.[0]?.composicao?.titulo === 'Refeita' && c.relatorios.at(-1)?.escrita[0]?.critica?.nota === 8.5 && c.relatorios.at(-1)?.escrita[0]?.critica?.refeita === 1);

  // 4. Refazer piorou: fica a versão de melhor nota.
  let v4 = 0;
  let notas4 = 0;
  const d = montar((p) => {
    if (p.chamada === 'dirigir_animacoes') return direcao([CENAS[0]]);
    if (p.chamada === 'criticar_animacao') return [`{"nota": 4, "problemas": ["sem acabamento"]}`, `{"nota": 3, "problemas": ["texto cortado"]}`][notas4++]!;
    v4 += 1;
    return cena(`v${v4}`);
  });
  await d.servico.criarNaMontagem(sistema as never, 'p1');
  t('refazer pode piorar: fica a versão de melhor nota, e a crítica para em UMA rodada', d.atual().mediaLayers?.[0]?.composicao?.titulo === 'v1' && v4 === 2 && notas4 === 2 && d.relatorios.at(-1)?.escrita[0]?.critica?.nota === 4);

  // 4b. Cena mediana (nota 5 ou mais) não é refeita: refazer não melhorava e custava um desenho.
  let v4b = 0;
  const d2 = montar((p) => {
    if (p.chamada === 'dirigir_animacoes') return direcao([CENAS[0]]);
    if (p.chamada === 'criticar_animacao') return '{"nota": 6, "problemas": ["sem acabamento"]}';
    v4b += 1;
    return cena(`m${v4b}`);
  });
  await d2.servico.criarNaMontagem(sistema as never, 'p1');
  t('cena com nota 6 entra sem ser refeita', v4b === 1 && d2.relatorios.at(-1)?.escrita[0]?.critica?.refeita === 0);

  // 5. Sem fotos (worker fora): a cena entra sem crítica.
  const e = montar((p) => (p.chamada === 'dirigir_animacoes' ? direcao([CENAS[0]]) : cena('Sem foto')), { fotos: null });
  const re = await e.servico.criarNaMontagem(sistema as never, 'p1');
  t('sem fotos, sem crítica: a cena entra do mesmo jeito', re.criadas === 1 && !e.pedidos.some((p) => p.chamada === 'criticar_animacao') && e.relatorios.at(-1)?.escrita[0]?.critica === undefined);

  // 6. A direção livre fora do ar: cai nos cartões.
  const f = montar((p) => {
    if (p.chamada === 'dirigir_animacoes') throw new Error('Model Not Exist');
    if (p.sistema.includes('DIRETOR VISUAL')) return JSON.stringify({ estilo: 'editorial', cartoes: [{ inicioS: 1, fimS: 7, layout: 'cartao', tipo: 'termo', gatilho: 'lançar o gemini', intencao: 'x' }] });
    return cena('Cartão');
  });
  const rf = await f.servico.criarNaMontagem(sistema as never, 'p1');
  t('direção livre fora do ar: o vídeo sai pelos cartões, não sem animação', rf.criadas === 1 && f.atual().mediaLayers?.[0]?.composicao?.estilo === 'editorial' && f.fotografadas() === 0);

  // 7. O estilo que a pessoa escolheu vale sobre a direção livre.
  const g = montar((p) => (p.sistema.includes('DIRETOR VISUAL') ? JSON.stringify({ cartoes: [{ inicioS: 1, fimS: 7, layout: 'cartao', tipo: 'termo', gatilho: 'lançar o gemini', intencao: 'x' }] }) : cena('Coral')), { projeto: { animationStyle: 'coral' } });
  await g.servico.criarNaMontagem(sistema as never, 'p1');
  t('estilo escolhido pela pessoa: vale o catálogo, sem direção livre', g.atual().mediaLayers?.[0]?.composicao?.estilo === 'coral' && !g.pedidos.some((p) => p.chamada === 'dirigir_animacoes'));

  // 8. A bancada: modelo e raciocínio trocados por execução, crítica desligada.
  const h = montar((p) => (p.chamada === 'dirigir_animacoes' ? direcao([CENAS[0]]) : cena('Bancada')));
  await h.servico.criarNaMontagem(sistema as never, 'p1', undefined, undefined, { rodadas: 0, direcao: { modelo: 'deepseek-flash', raciocinio: 'high' }, desenho: { modelo: 'deepseek-flash', raciocinio: 'desligado' } });
  const hd = h.pedidos.find((p) => p.chamada === 'dirigir_animacoes')!;
  const hw = h.pedidos.find((p) => p.chamada === 'desenhar_animacao')!;
  t('bancada: modelo e raciocínio por execução, e rodadas 0 desliga a crítica', hd.modelo === 'deepseek-flash' && hd.raciocinio === 'high' && hw.modelo === 'deepseek-flash' && hw.raciocinio === 'desligado' && h.fotografadas() === 0);

  // 9. Refazer no editor: a cena livre continua no design do vídeo; pedir um estilo do catálogo troca.
  const id = a.atual().mediaLayers![0]!.id;
  const i = montar((p) => (p.chamada === 'criticar_animacao' ? '{"nota": 9, "problemas": []}' : cena('Maior')), { projeto: { animationReport: a.relatorios.at(-1) } });
  await i.planos.salvar(null, 'p1', a.atual());
  const ri = await i.servico.refazerNoProjeto(sistema as never, 'p1', [id], { pedido: 'deixa o nome maior' });
  const pi = i.pedidos.find((p) => p.chamada === 'desenhar_animacao')!;
  const ci = i.atual().mediaLayers![0]!.composicao!;
  t('pedido numa cena livre: redesenha no design do vídeo, com a encenação e a versão atual', ri.feitas === 1 && pi.sistema.includes('A voz vira onda') && pi.usuario.includes('deixa o nome maior') && pi.usuario.includes('A onda desenha o nome') && ci.tema?.fundo === '#101418' && !ci.estilo);
  t('a nota de refazer não inventa nome de estilo', i.notas.some((n) => n.startsWith('A IA refez 1 animação (')));
  await i.servico.refazerNoProjeto(sistema as never, 'p1', [id], { estilo: 'editorial' });
  const ce = i.atual().mediaLayers![0]!.composicao!;
  t('pedir um estilo do catálogo troca a cena livre para ele (e o tema sai)', ce.estilo === 'editorial' && !ce.tema && i.pedidos.at(-1)!.chamada === 'animar_fala');

  console.log(`\n${ok} ok, ${fail} falha(s)`);
  if (fail) process.exit(1);
}

void main();
