// ============================================================
// Modelo e raciocínio de cada chamada: a tabela, o ambiente e o pedido.
//
// O que este teste protege: a imagem só pode ir ao modelo que enxerga
// (mandar ao Pro é erro 400), e trocar o modelo de UMA chamada por
// ambiente não pode mexer nas outras.
// ============================================================

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

async function main() {
  delete process.env.DEEPSEEK_MODELO;
  delete process.env.STUDIO_IA_DESENHAR_ANIMACAO;
  const { configDaChamada } = await import('../src/modules/ai/ai.service');

  t('a tabela: direção no Flash pensando, desenho no Flash sem raciocínio', JSON.stringify(configDaChamada('dirigir_animacoes')) === '{"modelo":"deepseek-flash","raciocinio":"high"}' && JSON.stringify(configDaChamada('desenhar_animacao')) === '{"modelo":"deepseek-flash","raciocinio":"desligado"}' && JSON.stringify(configDaChamada('selecionar_trechos')) === '{"modelo":"deepseek-flash","raciocinio":"desligado"}');
  t('o pedido troca modelo e raciocínio (a bancada)', JSON.stringify(configDaChamada('desenhar_animacao', { modelo: 'deepseek-flash', raciocinio: 'low' })) === '{"modelo":"deepseek-flash","raciocinio":"low"}');
  t('com imagem, sempre o modelo que enxerga -- mesmo pedindo o Pro', configDaChamada('criticar_animacao', { modelo: 'deepseek-v4-pro', imagens: ['x'] }).modelo === 'deepseek-flash');

  process.env.STUDIO_IA_DESENHAR_ANIMACAO = 'deepseek-v4-pro:high';
  t('ambiente por chamada: troca só aquela', JSON.stringify(configDaChamada('desenhar_animacao')) === '{"modelo":"deepseek-v4-pro","raciocinio":"high"}' && configDaChamada('dirigir_animacoes').modelo === 'deepseek-flash');
  t('o pedido vale sobre o ambiente', configDaChamada('desenhar_animacao', { modelo: 'deepseek-flash' }).modelo === 'deepseek-flash');
  process.env.STUDIO_IA_DESENHAR_ANIMACAO = 'gpt-9:turbo';
  t('valor errado no ambiente é ignorado', JSON.stringify(configDaChamada('desenhar_animacao')) === '{"modelo":"deepseek-flash","raciocinio":"desligado"}');

  console.log(`\n${ok} ok, ${fail} falha(s)`);
  if (fail) process.exit(1);
}

void main();
