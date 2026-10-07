// ============================================================
// Variedade sem IA: o visual por rodízio (sem repetir os últimos) e a
// mistura das cenas (clássicas viram as em volta da pessoa, com os
// mesmos textos ditos).
// ============================================================

import { cenaEmVolta, cenaIncompleta, PRESETS_EM_VOLTA, variarCenas, visualPorRodizio, type CenaDeMotion } from '../src';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  if (!cond) console.log(`FALHA ${nome}`);
};

// 1. O visual.
{
  const combinam = ['mg-produto', 'mg-vidro-claro', 'mg-caderno', 'mg-suico'];
  t('nunca um visual usado por último', visualPorRodizio(combinam, ['mg-suico', 'mg-caderno'], 'p1') !== 'mg-suico');
  const projetos = Array.from({ length: 40 }, (_, i) => visualPorRodizio(combinam, [], `projeto-${i}`));
  t('projetos diferentes espalham pelos visuais que combinam', new Set(projetos).size === combinam.length);
  t('o mesmo projeto e o mesmo histórico: o mesmo visual', visualPorRodizio(combinam, ['mg-produto'], 'x') === visualPorRodizio(combinam, ['mg-produto'], 'x'));
  t('montar de novo (o visual dele já é o recente): outra cara', visualPorRodizio(combinam, ['mg-suico'], 'p-suico') !== 'mg-suico');
  t('todos usados: o usado há mais tempo', visualPorRodizio(combinam, ['mg-suico', 'mg-caderno', 'mg-vidro-claro', 'mg-produto'], 'p') === 'mg-produto');
}

// 2. As versões em volta da pessoa: completas, com os mesmos textos.
const cena = (preset: string, textos: CenaDeMotion['textos'], layout: CenaDeMotion['layout'] = 'meio_a_meio'): CenaDeMotion => ({ preset, textos, layout });
{
  const casos: Array<[CenaDeMotion, string]> = [
    [cena('contador', { numero: '87', unidade: '%', titulo: 'desistem' }), 'numero_gigante'],
    [cena('anel', { numero: '66', titulo: 'acertos' }), 'numero_gigante'],
    [cena('impacto', { titulo: 'Consistência', kicker: 'o segredo' }, 'tela_cheia'), 'cartaz'],
    [cena('selo', { titulo: 'Mito' }, 'cartao'), 'cartaz'],
    [cena('frase', { titulo: 'Profundidade' }), 'profundidade'],
    [cena('barras', { itens: ['Opus 5', 'Opus 5.5'], valores: ['27', '66'], unidade: '%' }), 'placar'],
    [cena('lista', { itens: ['Gráfico', 'Imagem', 'Mapa'], titulo: 'Recursos' }), 'mosaico'],
    [cena('passos', { titulo: 'Como fazer', itens: ['Você pede', 'A IA monta'] }), 'janela'],
    [cena('notificacao', { titulo: 'Nova venda', detalhe: 'R$ 97 via Pix', kicker: 'Loja' }, 'cartao'), 'mensagem'],
  ];
  for (const [c, alvo] of casos) {
    const nova = cenaEmVolta(c);
    t(`${c.preset} vira ${alvo}`, nova?.preset === alvo && nova.layout === 'cartao');
    t(`${c.preset} → ${alvo}: completa`, !!nova && cenaIncompleta(nova.preset, nova.textos) === null);
  }
  t('o número dito é o mesmo', cenaEmVolta(casos[0]![0])!.textos.numero === '87');
  t('o anel ganha o % que ele mostra', cenaEmVolta(casos[1]![0])!.textos.unidade === '%');
  t('frase longa não vira texto 3D', cenaEmVolta(cena('frase', { titulo: 'Quem posta todo dia cresce mais' })) === null);
  t('lista de itens longos não vira cards', cenaEmVolta(cena('lista', { itens: ['Gancho forte no começo', 'Legenda', 'Corte'] })) === null);
  t('barras com três valores não viram placar', cenaEmVolta(cena('barras', { itens: ['a', 'b', 'c'], valores: ['1', '2', '3'] })) === null);
  t('número enorme não vira número gigante', cenaEmVolta(cena('contador', { numero: '1.500.000', titulo: 'x' })) === null);
  t('sem versão em volta: versus, pergunta', cenaEmVolta(cena('versus', { a: 'x', b: 'y' })) === null && cenaEmVolta(cena('pergunta', { titulo: 'Por quê?' })) === null);
}

// 3. A mistura do vídeo.
{
  const cenas = [
    cena('contador', { numero: '87', titulo: 'desistem' }),
    cena('impacto', { titulo: 'Foco' }, 'tela_cheia'),
    cena('versus', { a: 'Antes', b: 'Agora' }),
    cena('lista', { itens: ['Café', 'Treino'] }),
    cena('pergunta', { titulo: 'E agora?' }),
  ].map((c, i) => ({ inicioS: i * 8, cena: c }));
  const r = variarCenas(cenas, { comRosto: true, semente: 'p1' });
  const emVolta = r.cenas.filter((c) => PRESETS_EM_VOLTA.has(c.cena.preset)).length;
  t('com rosto: ao menos 40% das cenas em volta da pessoa', emVolta >= Math.ceil(cenas.length * 0.4) && r.trocadas === emVolta);
  t('a ordem e os instantes ficam', r.cenas.every((c, i) => c.inicioS === i * 8));
  t('sem duas cenas iguais seguidas', r.cenas.every((c, i) => i === 0 || c.cena.preset !== r.cenas[i - 1]!.cena.preset));
  t('não troca mais do que precisa', variarCenas(cenas, { comRosto: true, semente: 'p1', fracao: 0.2 }).trocadas === 1);
  t('sem rosto: nada muda', variarCenas(cenas, { comRosto: false, semente: 'p1' }).trocadas === 0);
  const outras = Array.from({ length: 12 }, (_, i) => variarCenas(cenas, { comRosto: true, semente: `projeto-${i}` }).cenas.map((c) => c.cena.preset).join());
  t('projetos diferentes trocam cenas diferentes', new Set(outras).size > 1);
  const jaVariado = [{ cena: cena('cartaz', { titulo: 'Foco' }, 'cartao') }, { cena: cena('placar', { a: 'x', b: 'y', valores: ['1', '2'] }, 'cartao') }, { cena: cena('contador', { numero: '3', titulo: 'x' }) }];
  t('já tem o bastante em volta: não troca', variarCenas(jaVariado, { comRosto: true, semente: 'p' }).trocadas === 0);
}

console.log(`${ok} ok, ${fail} falha(s)`);
if (fail) process.exit(1);
