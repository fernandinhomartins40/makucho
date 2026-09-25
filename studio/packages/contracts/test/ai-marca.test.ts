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

const pedido = descricaoDaMarcaParaIa(entrada);
const catalogo = catalogoDaMarcaParaIa();
t('o pedido é curto (< 600 caracteres)', pedido.length < 600);
t('o catálogo é fixo (prefixo cacheável)', catalogo === catalogoDaMarcaParaIa());
console.log(`   (pedido: ${pedido.length} caracteres; catálogo: ${catalogo.length})`);

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail > 0) process.exit(1);
