// ============================================================
// Motion por presets: toda cena montada em todo visual e layout sai
// válida (passa na checagem da animação), legível (texto com contraste)
// e no tempo da fala; remontar a partir da animação guardada dá a mesma
// cena.
// ============================================================

import {
  PRESETS_DE_MOTION,
  VISUAIS_DE_MOTION,
  cenaDaComposicao,
  composicaoDoPreset,
  composicaoHtmlSchema,
  contrasteDasCores,
  estiloDeAnimacao,
  lerNumero,
  lerTextosDaCena,
  problemasDaComposicao,
  temaDaAnimacao,
  textoDaCena,
  textoDosPresets,
  ASSETS_DE_MOTION,
  type TextosDaCena,
} from '../src';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  if (!cond) console.log(`FALHA ${nome}`);
};

const TEXTOS: Record<string, TextosDaCena> = {
  impacto: { titulo: 'Consistência', kicker: 'o segredo', detalhe: 'todo santo dia' },
  frase: { titulo: 'Quem posta todo dia cresce mais rápido que quem espera o momento certo', enfase: 'todo dia' },
  contador: { numero: '1.500', prefixo: 'R$', unidade: 'por mês', titulo: 'de renda extra', kicker: 'em três meses' },
  anel: { numero: '87', titulo: 'das pessoas desistem', detalhe: 'antes do primeiro mês' },
  barras: { itens: ['Janeiro', 'Fevereiro', 'Março'], valores: ['12', '30', '75'], titulo: 'Vendas', unidade: 'mil' },
  linha: { valores: ['200', '900', '4.000'], itens: ['2023', '2024', '2025'], titulo: 'Seguidores' },
  versus: { a: 'Postar sem plano', b: 'Calendário semanal', kicker: 'qual funciona' },
  antes_depois: { antes: 'Editar tudo na mão', depois: 'A IA faz o corte', kicker: 'o jeito novo' },
  lista: { itens: ['Gancho forte', 'Legenda grande', 'Corte rápido'], titulo: 'Três regras' },
  passos: { itens: ['Abra o app', 'Envie o vídeo', 'Toque em montar'], titulo: 'Como fazer' },
  citacao: { titulo: 'Feito é melhor que perfeito', kicker: 'Sheryl Sandberg', enfase: 'Feito' },
  termo: { titulo: 'Retenção', kicker: 'substantivo', detalhe: 'quanto do vídeo as pessoas assistem antes de sair' },
  pergunta: { titulo: 'Por que seu vídeo não viraliza?', detalhe: 'O gancho' },
  notificacao: { titulo: 'Nova venda aprovada', detalhe: 'R$ 97,00 via Pix', kicker: 'Loja', itens: ['Nova venda aprovada', 'Mais uma venda'] },
  selo: { titulo: 'Mito', kicker: 'veredito' },
  busca: { titulo: 'como editar vídeos com IA', itens: ['Makucho Studio', 'Tutorial completo'] },
  chat: { itens: ['Quanto custa?', 'Menos que um café', 'Sério?'] },
  alerta: { titulo: 'Não use música com direitos', kicker: 'Erro comum', detalhe: 'o vídeo pode ser derrubado' },
  preco: { numero: '97', prefixo: 'R$', antes: 'R$ 297', titulo: 'Curso completo', kicker: 'só hoje' },
  ranking: { itens: ['Reels', 'TikTok', 'Shorts'], titulo: 'Onde mais cresce' },
  rotulo: { titulo: 'Ana Souza', kicker: 'editora de vídeo' },
  icone: { icone: 'foguete', titulo: 'Crescimento rápido', detalhe: 'sem gastar com anúncio' },
  titulo: { titulo: 'O erro que trava seu crescimento', kicker: 'pare agora', enfase: 'erro' },
  objeto: { objeto: 'celular', titulo: 'A venda chega sozinha', detalhe: 'no automático' },
  anotacao: { rabisco: 'seta_curva', titulo: 'olha isso' },
  chamada: { titulo: 'Siga para a parte 2', enfase: 'parte 2' },
};

const falaDe = (x: TextosDaCena) =>
  textoDaCena(x)
    .split(/\s+/)
    .filter(Boolean)
    .map((texto, i) => ({ s: 0.3 + i * 0.32, texto }));

// Todo preset tem textos de exemplo.
t('todo preset tem exemplo', PRESETS_DE_MOTION.every((p) => TEXTOS[p.chave]));

let montadas = 0;
for (const p of PRESETS_DE_MOTION) {
  for (const v of VISUAIS_DE_MOTION) {
    for (const layout of p.layouts) {
      const c = composicaoDoPreset({ preset: p.chave, textos: TEXTOS[p.chave]!, layout, lado: 'cima' }, v.chave, 6, falaDe(TEXTOS[p.chave]!));
      const nome = `${p.chave}/${v.chave}/${layout}`;
      const lido = composicaoHtmlSchema.safeParse(c);
      t(`${nome}: passa no esquema`, lido.success);
      const problemas = problemasDaComposicao(c);
      t(`${nome}: sem problemas (${problemas.join('; ')})`, problemas.length === 0);
      t(`${nome}: no layout pedido`, c.layout === layout);
      t(`${nome}: guarda o visual`, c.estilo === v.chave);
      t(`${nome}: briefing cabe`, (c.briefing ?? '').length <= 2000);
      montadas += 1;
    }
  }
}
t(`montou todas as combinações (${montadas})`, montadas > 18 * 22 * 2);

// Os visuais estão no catálogo de estilos (a tela e o projeto os escolhem) e têm texto legível.
for (const v of VISUAIS_DE_MOTION) {
  t(`${v.chave}: está no catálogo`, estiloDeAnimacao(v.chave)?.familia === 'motion');
  const tema = temaDaAnimacao(v.chave);
  t(`${v.chave}: texto legível no fundo`, !!tema && contrasteDasCores(tema.texto, tema.fundo) >= 4.5);
  t(`${v.chave}: destaque visível`, !!tema && contrasteDasCores(tema.destaque, tema.fundo) >= 2);
}

// O tempo: o número entra quando é dito.
{
  const fala = [
    { s: 0.2, texto: 'eu' },
    { s: 0.5, texto: 'faturei' },
    { s: 2.4, texto: '1.500' },
    { s: 2.9, texto: 'reais' },
  ];
  const c = composicaoDoPreset({ preset: 'contador', textos: { numero: '1.500', titulo: 'faturei em reais' }, layout: 'meio_a_meio' }, 'mg-soco', 6, fala);
  const t0 = Number(/data-conta="1500"[^>]*data-t="([\d.]+)"/.exec(c.html)?.[1]);
  t('o número conta a partir do segundo em que é dito', Math.abs(t0 - 2.32) < 0.02);
  t('conta até o valor dito (1.500 = 1500)', /data-conta="1500"/.test(c.html));
}

// O fim: nada entra depois do último segundo útil.
{
  const fala = [{ s: 5.8, texto: 'Consistência' }];
  const c = composicaoDoPreset({ preset: 'impacto', textos: { titulo: 'Consistência' }, layout: 'tela_cheia' }, 'mg-soco', 6, fala);
  const tempos = [...c.html.matchAll(/data-t="([\d.]+)"/g)].map((m) => Number(m[1]));
  t('nada entra no último segundo da cena', Math.max(...tempos) <= 6 - 1.1 + 0.25);
}

// Layout que o preset não aceita cai no preferido dele.
{
  const c = composicaoDoPreset({ preset: 'rotulo', textos: { titulo: 'Ana' }, layout: 'tela_cheia' }, 'mg-keynote', 4, []);
  t('layout fora do preset vira o preferido', c.layout === 'cartao');
}

// Remontar: a animação guarda a cena (preset e textos) e o lugar.
{
  const cena = { preset: 'lista', textos: TEXTOS.lista!, layout: 'pip' as const, canto: 'sup-esq' as const };
  const c = composicaoDoPreset(cena, 'mg-caderno', 5, []);
  const lida = cenaDaComposicao(c);
  t('a animação guarda a cena para remontar', lida?.preset === 'lista' && lida.textos.itens?.length === 3 && lida.layout === 'pip' && lida.canto === 'sup-esq');
  const outra = composicaoDoPreset(lida!, 'mg-neon', 5, []);
  t('remontada em outro visual muda só o visual', outra.estilo === 'mg-neon' && outra.layout === 'pip' && outra.html.includes('Gancho forte'));
}

// Atrás da pessoa: só no cartão, e guardado para remontar.
{
  const c = composicaoDoPreset({ preset: 'titulo', textos: { titulo: 'O erro' }, layout: 'cartao', atras: true }, 'mg-soco', 3, []);
  t('título atrás da pessoa: marcado na animação', c.atras === true && c.layout === 'cartao' && cenaDaComposicao(c)?.atras === true);
  const p = composicaoDoPreset({ preset: 'contador', textos: { numero: '9', titulo: 'x' }, layout: 'meio_a_meio', atras: true }, 'mg-soco', 3, []);
  t('fora do cartão não há "atrás" (o painel cobre a pessoa)', !p.atras);
  t('título e chamada não entram na escolha das cenas da fala', !textoDosPresets().includes('titulo [') && !textoDosPresets().includes('chamada ['));
}

// Assets animados: todos montam, em todo visual, e passam na checagem.
for (const a of ASSETS_DE_MOTION) {
  for (const v of [VISUAIS_DE_MOTION[0]!, VISUAIS_DE_MOTION[1]!]) {
    const textos = a.tipo === 'objeto' ? { objeto: a.chave, titulo: 'Teste' } : { rabisco: a.chave, titulo: 'Teste' };
    const c = composicaoDoPreset({ preset: a.tipo === 'objeto' ? 'objeto' : 'anotacao', textos, layout: 'cartao' }, v.chave, 4, []);
    t(`asset ${a.chave}/${v.chave}: monta e passa na checagem`, c.html.includes(`ast-${a.chave}`) && problemasDaComposicao(c).length === 0);
  }
}
{
  const comEnfeite = composicaoDoPreset({ preset: 'impacto', textos: { titulo: 'Boom' }, layout: 'tela_cheia' }, 'mg-soco', 4, []);
  t('cena de destaque ganha o enfeite do visual', /mg-enfeite"><svg id="as\d" class="ast ast-(explosao|velocidade)/.test(comEnfeite.html));
  const sem = composicaoDoPreset({ preset: 'impacto', textos: { titulo: 'Boom', rabisco: 'nenhum' }, layout: 'tela_cheia' }, 'mg-soco', 4, []);
  t('"nenhum" tira o enfeite', !sem.html.includes('mg-enfeite'));
  const sobrio = composicaoDoPreset({ preset: 'impacto', textos: { titulo: 'Boom' }, layout: 'tela_cheia' }, 'mg-suico', 4, []);
  t('visual sóbrio (suíço) não leva enfeite', !sobrio.html.includes('mg-enfeite'));
  t('objeto ou rabisco que não existe não entra', lerTextosDaCena({ objeto: 'dragao', rabisco: 'raio-laser' }).objeto === undefined && lerTextosDaCena({ rabisco: 'raio-laser' }).rabisco === undefined);
}

// Texto da IA: limpo e cortado, nunca recusado; HTML escapado.
{
  const x = lerTextosDaCena({ titulo: '  muito   espaço ', itens: ['a', '', 3, 'b'], kicker: 'x'.repeat(200), lixo: 'ignorado' });
  t('textos limpos', x.titulo === 'muito espaço' && x.itens?.join(',') === 'a,3,b' && x.kicker?.length === 32 && !('lixo' in x));
  const c = composicaoDoPreset({ preset: 'impacto', textos: { titulo: '<img src=x onerror=alert(1)>' }, layout: 'cartao' }, 'mg-soco', 4, []);
  t('texto da IA vai escapado no html', !c.html.includes('<img') && problemasDaComposicao(c).length === 0);
}

// Números no formato brasileiro.
t('lerNumero 1.500', lerNumero('1.500')?.valor === 1500);
t('lerNumero 2,5', lerNumero('2,5')?.valor === 2.5 && lerNumero('2,5')?.casas === 1);
t('lerNumero texto', lerNumero('dez') === null);

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail) process.exit(1);
