// ============================================================
// "Configurar com IA" no Kit de marca: cores por regra a partir da
// paleta medida, leitura da resposta da IA com conserto do que vem fora
// do catálogo, contraste garantido e o tamanho do pedido.
// ============================================================

import {
  catalogoDaMarcaParaIa,
  contraste,
  coresPorRegra,
  descricaoDaMarcaParaIa,
  entradaDaMarcaSchema,
  lerSugestaoDaMarca,
  preferenciasDeVideoSchema,
  sugestaoPorRegra,
  comArquivosNoItem,
  itensDoKit,
  TIPO_DA_SECAO,
} from '../src/index';
import type { EntradaDaMarca } from '../src/index';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

// Uma logo laranja e preta num fundo transparente, com um pouco de branco.
const entrada: EntradaDaMarca = {
  nome: 'Padaria Sol',
  segmento: 'padaria artesanal',
  paleta: [
    { hex: '#111111', peso: 0.45 },
    { hex: '#FF7A00', peso: 0.35 },
    { hex: '#FFFFFF', peso: 0.12 },
    { hex: '#FFC24D', peso: 0.08 },
  ],
  logos: [{ variante: 'LOGO', transparente: true, proporcao: 2.4, claridade: 0.4 }],
};

t('a entrada medida no navegador é aceita', entradaDaMarcaSchema.safeParse(entrada).success);

const cores = coresPorRegra(entrada.paleta);
t('primária por regra: a cor viva que mais pesa (laranja)', cores.primary === '#FF7A00');
t('fundo por regra: a mais escura da logo', cores.textDark === '#111111');
t('texto claro legível sobre o fundo', contraste(cores.textLight, cores.textDark) >= 4.5);
t('secundária diferente da primária', cores.secondary !== cores.primary);

const regra = sugestaoPorRegra(entrada);
t('sem IA o kit sai completo (origem regra)', regra.origem === 'regra' && !!regra.fonteTitulo && !!regra.captionPreset && !!regra.textoPreset);

const resposta = JSON.stringify({
  cores: { primary: '#FF7A00', secondary: '#FFC24D', accent: '#2A1A0A', textLight: '#222222', textDark: '#111111' },
  fonteTitulo: 'bebas neue',
  fonteCorpo: 'Fonte Que Não Existe',
  captionPreset: 'destaque',
  textoPreset: 'nao_existe',
  pacote: 'vendas',
  transicaoPadrao: 'cut',
  tom: 'caloroso e artesanal',
  justificativa: 'Laranja da logo como cor principal, fontes fortes para a vitrine.',
});
const lida = lerSugestaoDaMarca(`\`\`\`json\n${resposta}\n\`\`\``, entrada)!;
t('a resposta da IA é lida (com cerca de markdown)', !!lida && lida.origem === 'ia');
t('fonte achada sem diferenciar maiúsculas', lida.fonteTitulo === 'Bebas Neue');
t('fonte fora do catálogo vira a da regra', lida.fonteCorpo === regra.fonteCorpo);
t('estilo de texto fora do catálogo vira o da regra', lida.textoPreset === regra.textoPreset);
t('texto claro sem contraste é consertado', contraste(lida.cores.textLight, lida.cores.textDark) >= 4.5);
t('pacote do catálogo passa', lida.pacote === 'vendas');
t('resposta ilegível devolve null (quem chama usa a regra)', lerSugestaoDaMarca('{quebrado', entrada) === null);

t('as preferências novas cabem no Kit de marca', preferenciasDeVideoSchema.safeParse({
  textoPreset: 'classico',
  abertura: { usar: true, assetId: 'a1' },
  encerramento: { usar: false },
  musica: { usar: true, volumeDb: -20, assetId: 'm1' },
  itensDaMarca: [{ assetId: 'a1', nome: 'Vinheta', uso: 'abertura de todo vídeo' }],
}).success);

// ---------- Kit criativo e acabamento ----------
t('sem IA, o kit criativo vem completo (trilhas, sons, vinhetas, imagens, vídeos)', regra.kit.trilhas.length >= 2 && regra.kit.sons.length >= 2 && !!regra.kit.abertura && !!regra.kit.encerramento && regra.kit.imagens.length >= 1 && regra.kit.videos.length >= 1);
t('os prompts da regra levam as cores da marca', regra.kit.imagens[0]!.prompt.includes(regra.cores.primary) && regra.kit.abertura!.prompt.includes(regra.cores.textDark));
t('a vinheta é um prompt para IA de vídeo, com a logo anexada e sem editor', /9:16/.test(regra.kit.abertura!.prompt) && /attached brand logo/.test(regra.kit.abertura!.prompt) && !/capcut|canva|premiere/i.test(JSON.stringify(regra.kit)));
t('o kit da regra cabe no Kit de marca', preferenciasDeVideoSchema.safeParse({ kitCriativo: regra.kit }).success);
const comKit = lerSugestaoDaMarca(
  JSON.stringify({
    ...JSON.parse(resposta),
    preferencias: { autoZoom: false, logoPosicao: 'ie', volumeTrilhaDb: -25, voiceEnhance: 'sim' },
    kit: {
      trilhas: [{ nome: 'Padaria de manhã', uso: 'fundo', estilo: 'instrumental acoustic, warm, 95 bpm' }, { nome: 'sem estilo' }],
      abertura: { nome: 'Forno', duracaoS: 40, logo: 'QUALQUER', prompt: 'Vertical 9:16 bakery intro with the attached logo', som: 'bell' },
      encerramento: { nome: 'Antigo', duracaoS: 3, logo: 'LOGO', passos: ['Abra o CapCut'], som: 'x' },
      imagens: [{ nome: 'Pão', uso: 'capa', prompt: 'croissant', formato: '4:5' }],
    },
  }),
  entrada,
)!;
t('preferências da IA lidas, com o que veio errado no padrão', comKit.preferencias.autoZoom === false && comKit.preferencias.logoPosicao === 'ie' && comKit.preferencias.volumeTrilhaDb === -24 && comKit.preferencias.voiceEnhance === true);
t('kit da IA consertado (trilha sem estilo sai, duração e logo no limite, formato padrão)', comKit.kit.trilhas.length === 1 && comKit.kit.abertura!.duracaoS === 15 && comKit.kit.abertura!.logo === 'LOGO' && comKit.kit.imagens[0]!.formato === '9:16');
t('vinheta sem prompt (formato antigo) vira a da regra, sem passos de editor', !!comKit.kit.encerramento && comKit.kit.encerramento.prompt.includes('9:16') && !comKit.kit.encerramento.passos);
t('kit da IA cabe no Kit de marca', preferenciasDeVideoSchema.safeParse({ kitCriativo: comKit.kit }).success);
const semKit = lerSugestaoDaMarca(resposta, entrada)!;
t('resposta sem kit: kit da regra com as cores da IA', semKit.kit.trilhas.length >= 2 && semKit.kit.imagens[0]!.prompt.includes(semKit.cores.primary));

const pedido = descricaoDaMarcaParaIa(entrada);
const catalogo = catalogoDaMarcaParaIa();
t('o pedido é curto (< 600 caracteres)', pedido.length < 600);
t('o catálogo é fixo (prefixo cacheável)', catalogo === catalogoDaMarcaParaIa());
console.log(`   (pedido: ${pedido.length} caracteres; catálogo: ${catalogo.length})`);

// ---------- O arquivo gerado ligado ao seu prompt ----------
{
  const kit = regra.kit;
  const ligado = comArquivosNoItem(comArquivosNoItem(kit, 'trilhas', 0, ['a1', 'a1', 'a2']), 'abertura', 0, ['v1']);
  const itens = itensDoKit(ligado);
  const trilha = itens.find((x) => x.secao === 'trilhas' && x.indice === 0)!;
  t('ligar arquivos ao prompt (sem repetir) e à vinheta', trilha.assetIds.join(',') === 'a1,a2' && itens.find((x) => x.secao === 'abertura')!.assetIds[0] === 'v1');
  t('o kit com arquivos ligados continua válido para salvar', preferenciasDeVideoSchema.safeParse({ kitCriativo: ligado }).success);
  t('o pedido da trilha vai junto (é o que a IA do editor lê)', trilha.pedido === kit.trilhas[0]!.estilo && TIPO_DA_SECAO.trilhas === 'MUSIC' && TIPO_DA_SECAO.encerramento === 'OUTRO');
}

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail > 0) process.exit(1);
