// ============================================================
// Variedade sem IA: o visual por rodízio (sem repetir os últimos) e a
// mistura das cenas (clássicas viram as em volta da pessoa, com os
// mesmos textos ditos).
// ============================================================

import { cenaEmVolta, cenaIncompleta, composicaoDoPreset, iconeDoTexto, iconeExiste, ilustrarCenas, objetoDoTexto, PRESETS_EM_VOLTA, PRESETS_SO_TEXTO, problemasDaComposicao, usarIconesDuotone, variarCenas, visualPorRodizio, type CenaDeMotion } from '../src';
import { CATEGORIAS_DOS_ICONES, ICONES_PHOSPHOR } from '../src/icones-phosphor';
usarIconesDuotone(ICONES_PHOSPHOR, CATEGORIAS_DOS_ICONES);

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

// 4. O que ilustra cada palavra.
{
  t('gráfico → gráfico de linha subindo', objetoDoTexto('Gráfico') === 'linha_subindo');
  t('dinheiro → moedas; mapa → mapa; imagem → foto', objetoDoTexto('ganhar mais dinheiro') === 'moedas' && objetoDoTexto('Mapa') === 'mapa' && objetoDoTexto('Imagem') === 'foto');
  t('objeto já usado: o próximo sentido do texto', objetoDoTexto('dinheiro e tempo', new Set(['moedas'])) === 'relogio');
  t('sem sentido: nada', objetoDoTexto('o que você acha disso') === undefined && iconeDoTexto('o que você acha disso') === undefined);
  t('palavra curta só inteira ("ia" não casa "dia"? "dia" casa o calendário)', iconeDoTexto('a IA responde') === 'robot' && objetoDoTexto('todo dia') === 'calendario');
  const icones = ['chart-line-up', 'coins', 'map-trifold', 'image', 'calendar-check', 'clock', 'users-three', 'chat-circle-dots', 'device-mobile', 'file-text', 'magnifying-glass', 'play-circle', 'cube', 'browser', 'rocket-launch', 'trophy', 'heart', 'lightbulb', 'target', 'robot', 'briefcase', 'warning', 'check-circle'];
  t('os ícones do dicionário existem no catálogo', icones.every((i) => iconeExiste(i)));
}

// 5. As cenas ilustradas.
{
  const opiniao = [
    cena('impacto', { titulo: 'Mesma coisa', kicker: 'Casamento' }, 'cartao'),
    cena('versus', { a: 'Ele vive', b: 'A empresa manda' }),
    cena('pergunta', { titulo: 'Quanto tempo você perde?' }),
    cena('antes_depois', { antes: 'Viver eu', depois: 'Viver a empresa' }),
  ].map((c, i) => ({ inicioS: i * 8, cena: c }));
  const r = ilustrarCenas(opiniao, { comRosto: true });
  const comAlgo = r.cenas.filter((c) => !PRESETS_SO_TEXTO.has(c.cena.preset)).length;
  t('ao menos 65% das cenas com algo além de texto', comAlgo >= Math.ceil(opiniao.length * 0.65));
  t('versus de nomes curtos: ícones ao lado do rosto', r.cenas[1]!.cena.preset === 'ladeando' && r.cenas[1]!.cena.textos.icones?.length === 2 && r.cenas[1]!.cena.textos.a === 'Ele vive');
  t('a pergunta sobre tempo vira o relógio animado, com o mesmo título', r.cenas.some((c) => c.cena.preset === 'objeto' && c.cena.textos.objeto === 'relogio' && c.cena.textos.titulo === 'Quanto tempo você perde?'));
  const objetos = r.cenas.map((c) => c.cena.textos.objeto).filter(Boolean);
  t('cada objeto uma vez por vídeo', new Set(objetos).size === objetos.length);
  t('sem duas cenas iguais seguidas', r.cenas.every((c, i) => i === 0 || c.cena.preset !== r.cenas[i - 1]!.cena.preset));
  t('as ilustradas montam sem problemas', r.cenas.every((c) => problemasDaComposicao(composicaoDoPreset(c.cena, 'mg-soco', 5, [])).length === 0 && !cenaIncompleta(c.cena.preset, c.cena.textos)));
  t('sem rosto: nada de ícones ao lado do rosto', ilustrarCenas(opiniao, { comRosto: false }).cenas.every((c) => c.cena.preset !== 'ladeando'));
  t('texto que nada ilustra fica como está', ilustrarCenas([{ cena: cena('frase', { titulo: 'Isso muda tudo' }) }], { comRosto: true }).ilustradas === 0);
  const mosaico = composicaoDoPreset(cena('mosaico', { itens: ['Gráfico', 'Imagem', 'Mapa'] }, 'cartao'), 'mg-soco', 5, []);
  t('cards em volta: o item com objeto mostra o objeto se mexendo', mosaico.html.includes('ast-linha_subindo') && mosaico.html.includes('ast-foto') && mosaico.html.includes('ast-mapa'));
  const lista = composicaoDoPreset(cena('lista', { itens: ['Mais vendas', 'Menos tempo'] }), 'mg-soco', 5, []);
  t('lista: ícone pelo item, não o check de sempre', !/class="ic li-ic"/.test(lista.html) && (lista.html.match(/icd li-ic/g) ?? []).length === 2);
  t('frase com ênfase curta vira palavra grande', ['cartaz', 'profundidade'].includes(cenaEmVolta(cena('frase', { titulo: 'Casado, você vai viver o casamento', enfase: 'viver o casamento' }))?.preset ?? ''));
  t('visão e perspectiva viram as linhas de perspectiva', cenaEmVolta(cena('impacto', { titulo: 'Perspectiva' }, 'cartao'))?.preset === 'hud');
}

console.log(`${ok} ok, ${fail} falha(s)`);
if (fail) process.exit(1);
