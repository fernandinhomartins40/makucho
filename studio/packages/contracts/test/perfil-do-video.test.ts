// ============================================================
// O perfil do vídeo (a análise sem token), as técnicas de cena e as
// batidas presas à fala.
// ============================================================

import {
  CHAVES_DAS_TECNICAS,
  ancorarBatidas,
  conferirCartoes,
  REGRAS_LIVRES,
  designDoVideo,
  indiceDasTecnicas,
  lerDirecao,
  lerOlhar,
  moduloDaTecnica,
  perfilDoVideo,
  resumoDoPerfil,
  sinaisDaFala,
  tecnicaDeCena,
  textoDoPerfil,
  textoDoPlano,
  type PalavraNoTempo,
} from '../src';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

const fala = (s: number, texto: string, passo = 0.35): PalavraNoTempo[] => texto.split(' ').map((p, i) => ({ s: s + i * passo, texto: p }));

// ---------- Sinais ----------
const dica: PalavraNoTempo[] = [
  ...fala(0, 'Você sabia que oitenta e sete por cento das lojas perdem vendas?'),
  ...fala(5, 'São três erros que eu vejo todo dia.'),
  ...fala(9, 'Primeiro, responder tarde. Segundo, não usar o nome do cliente.'),
  ...fala(16, 'O segredo é simples: responda em até 5 minutos.'),
  ...fala(21, 'Antes eu vendia 20 por mês, depois passei a vender 60.'),
  ...fala(27, 'Isso se chama SLA de atendimento.'),
];
const sinais = sinaisDaFala(dica);
const tipos = (tipo: string) => sinais.filter((s) => s.tipo === tipo);
t('número dito por extenso vira sinal, no segundo em que é dito', tipos('numero').some((s) => s.s === 1.05 && s.trecho.includes('oitenta')));
t('"três erros" é enumeração, não dado', tipos('lista').some((s) => s.trecho.includes('três erros')) && !tipos('numero').some((s) => s.trecho.startsWith('três')));
t('"primeiro... segundo" é enumeração', sinaisDaFala(fala(0, 'Primeiro, responda rápido. Segundo, use o nome.')).some((s) => s.tipo === 'lista' && s.trecho.startsWith('Primeiro')));
t('a mesma lista anunciada e enumerada conta uma vez só', tipos('lista').length === 1);
t('pergunta pontuada vira sinal desde o começo da frase', tipos('pergunta').some((s) => s.s === 0));
t('"o segredo" é frase de peso', tipos('enfase').some((s) => s.trecho.includes('segredo')));
t('antes e depois é comparação', tipos('comparacao').some((s) => s.trecho.includes('Antes')));
t('sigla é termo', tipos('termo').some((s) => s.trecho.includes('SLA')));
t('"um" e "uma" soltos não são dado', sinaisDaFala(fala(0, 'Tem uma coisa que um cliente me disse')).every((s) => s.tipo !== 'numero'));

// ---------- Perfil ----------
const p = perfilDoVideo({ palavras: dica, duracaoS: 30 });
t('fala acelerada e densa: ritmo e densidade medidos', p.palavrasPorMinuto > 100 && p.densidade !== 'baixa');
t('a receita traz técnicas com evidência e os instantes', p.receita.tecnicas.some((x) => x.tecnica === 'grafico' && x.momentos.length > 0) && p.receita.tecnicas.some((x) => x.tecnica === 'lista_viva'));
t('número isolado é dado em destaque; dois números perto viram gráfico', p.receita.tecnicas.some((x) => x.tecnica === 'dado_em_destaque' && x.momentos.includes(1.05)));
t('as técnicas sugeridas existem no repertório', p.receita.tecnicas.every((x) => CHAVES_DAS_TECNICAS.includes(x.tecnica)));
t('cenas sugeridas cabem no vídeo', p.receita.cenasSugeridas >= 2 && p.receita.cenasSugeridas <= 14);

const historia = perfilDoVideo({ palavras: fala(0, 'eu lembro quando eu era criança e minha mãe me levou na feira e eu senti que ali era o meu lugar', 0.6), duracaoS: 40 });
t('história pessoal: formato história, energia baixa e poucas cenas', historia.formato === 'historia' && historia.energia === 'baixa' && historia.receita.cenasSugeridas <= 3);
t('oferta pelo tipo de vídeo', perfilDoVideo({ palavras: dica, duracaoS: 30, tipoDeVideo: 'promocao' }).formato === 'oferta');

const olhar = lerOlhar('```json\n{"rosto":"em_cima","luz":"clara","cores":["#F2E8D8","verde","#334455"],"ambiente":"cozinha clara"}\n```');
t('lê o olhar da IA; cor que não é hex sai', olhar?.rosto === 'em_cima' && olhar.cores.length === 2 && olhar.ambiente === 'cozinha clara');
t('olhar ilegível vale nulo; valor fora da lista cai no neutro', lerOlhar('não sei') === null && lerOlhar('{"rosto":"lado"}')?.rosto === 'no_centro');
const comOlhar = perfilDoVideo({ palavras: dica, duracaoS: 30, olhar: olhar! });
t('rosto em cima: no meio a meio a cena vai embaixo; luz clara pede fundo claro', comOlhar.receita.ladoDaCena === 'baixo' && comOlhar.receita.fundo === 'claro');
t('o perfil em texto traz a fala medida, os instantes e a imagem', textoDoPerfil(comOlhar).includes('palavras por minuto') && textoDoPerfil(comOlhar).includes('1.1 s') && textoDoPerfil(comOlhar).includes('cozinha clara'));
t('o resumo para a pessoa é uma linha', !resumoDoPerfil(p).includes('\n') && resumoDoPerfil(p).includes('número'));

// ---------- Técnicas ----------
t('técnica pelo nome, tolerante a espaço e hífen', tecnicaDeCena('Dado em-destaque'.replace('Dado em', 'dado em'))?.chave === 'dado_em_destaque' && tecnicaDeCena('lista viva')?.chave === 'lista_viva');
t('técnica desconhecida: o módulo cai no livre', moduloDaTecnica('xpto').includes('Encenação livre'));
t('o módulo traz números de construção', /\d+ ?px/.test(moduloDaTecnica('dado_em_destaque')) && moduloDaTecnica('dado_em_destaque').includes('Evite'));
t('o índice lista todas as técnicas', CHAVES_DAS_TECNICAS.every((c) => indiceDasTecnicas().includes(c)));

// ---------- Batidas ----------
const trecho = fala(10, 'são oitenta e sete por cento das lojas', 0.4);
const batidas = ancorarBatidas(
  [
    { palavra: '', acao: 'o palco arma' },
    { palavra: 'oitenta', acao: 'o número CONTA' },
    { palavra: 'lojas', acao: 'o rótulo SOBE' },
    { palavra: 'unicórnio', acao: 'algo que não foi dito' },
    { acao: '' },
  ],
  trecho,
  10,
  14,
);
t('a primeira batida sem palavra é a abertura (0 s)', batidas[0]?.t === 0 && batidas[0].palavra === '');
t('cada batida no segundo MEDIDO da palavra, dentro da cena', batidas[1]?.t === 0.4 && batidas[2]?.t === 2.8);
t('palavra que não está na fala fica sem instante; batida vazia sai', batidas[3]?.t === null && batidas.length === 4);
t('o plano em texto traz os instantes e os verbos', textoDoPlano({ tecnica: 'dado_em_destaque', papel: 'impacto', enfase: ['oitenta'], batidas }).includes('0.40 s  "oitenta"  ->  o número CONTA'));

// ---------- A direção com plano ----------
const palavras = [...fala(1, 'olha só isso aqui'), ...fala(10, 'oitenta e sete por cento das lojas perdem vendas')];
const lida = lerDirecao(
  JSON.stringify({
    conceito: 'papel milimetrado',
    design: { referencia: 'caderno de engenheiro', motivo: 'a linha azul', fundo: ['grade fina', 'número gigante apagado'], paleta: { fundo: '#f4efe6', texto: '#1b1d22', destaque: '#2557a7' }, movimento: { energia: 'media', entrada: 'expo.out', saida: 'power2.in', duracaoBase: 0.45, stagger: 0.08, assinatura: 'a linha que se desenha' }, ritmo: 'rápida, IMPACTO, respiro' },
    cenas: [{ inicioS: 10, fimS: 15, layout: 'tela_cheia', nome: 'o dado', tecnica: 'dado em destaque', papel: 'impacto', ancora: 'oitenta e sete por cento', foco: 'o 87%', enfase: ['oitenta'], batidas: [{ palavra: '', acao: 'grade ACENDE' }, { palavra: 'oitenta', acao: 'número CONTA' }], conteudo: { textos: ['87%'] }, prioridade: 1 }],
  }),
);
const conf = conferirCartoes(lida.cartoes, { duracaoS: 30, palavras, reservadas: [], regras: REGRAS_LIVRES });
const plano = conf.aceitos[0]?.plano;
t('a cena guarda a técnica, o papel e as batidas ancoradas', plano?.tecnica === 'dado_em_destaque' && plano.papel === 'impacto' && plano.batidas[1]?.t === 0 && plano.enfase[0] === 'oitenta');
// Visto em produção: âncora de uma palavra curta ("É", "Eu") saía como "não está na fala".
const curtas = conferirCartoes(
  [
    { inicioS: 1, fimS: 5, nome: 'curta', tecnica: 'citacao', ancora: 'olha', prioridade: 1 },
    { inicioS: 10, fimS: 15, nome: 'eu', tecnica: 'citacao', ancora: 'Eu', prioridade: 1 },
  ],
  { duracaoS: 30, palavras: [...palavras, { s: 10.2, texto: 'eu' }], reservadas: [], regras: REGRAS_LIVRES },
);
t('âncora de palavra curta que está na fala vale', curtas.aceitos.some((c) => c.tipo === 'eu'));
const d = designDoVideo(lida);
t('o design em fichas vira linguagem e movimento concretos', d.linguagem.includes('caderno de engenheiro') && d.linguagem.includes('a linha azul') && d.linguagem.includes('grade fina') && d.movimento.includes('expo.out') && d.movimento.includes('a linha que se desenha') && d.movimento.includes('IMPACTO'));
t('o design antigo (prosa) continua lido', designDoVideo({ design: { linguagem: 'x', movimento: 'lento' } }).movimento === 'lento');

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail) process.exit(1);
