import { avisoDeDuracao, legendaParaRede, tituloParaRede, analiseDaIaSchema } from '../src/index';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

const post = { postCaption: 'Demorar para responder custa venda. Veja como resolver hoje.', hashtags: ['whatsapp', 'vendas', 'atendimento', 'pequenosnegocios', 'dicas', 'empreender', 'loja'], postTitle: 'Demorar no WhatsApp custa venda' };

t('Instagram leva até 5 hashtags', legendaParaRede('instagram', post).endsWith('#whatsapp #vendas #atendimento #pequenosnegocios #dicas'));
t('YouTube leva até 3 hashtags', legendaParaRede('youtube', post).endsWith('#whatsapp #vendas #atendimento'));
t('WhatsApp não leva hashtag', !legendaParaRede('whatsapp', post).includes('#'));
const longa = { ...post, postCaption: 'a'.repeat(3000) };
t('legenda longa é cortada no limite da rede', legendaParaRede('tiktok', longa).length <= 2200 && legendaParaRede('tiktok', longa).includes('#whatsapp'));
t('hashtags escritas pela pessoa no fim do texto valem', legendaParaRede('youtube', post, 'Meu texto.\n\n#um #dois #tres #quatro') === 'Meu texto.\n\n#um #dois #tres');
t('título do YouTube vem da IA', tituloParaRede('youtube', post) === 'Demorar no WhatsApp custa venda');
t('sem título da IA, a primeira frase', tituloParaRede('youtube', { postCaption: 'Primeira frase. Segunda.' }) === 'Primeira frase.');
t('Instagram não tem título', tituloParaRede('instagram', post) === null);
t('3 min cabe no Instagram', avisoDeDuracao('instagram', 180_000) === null);
t('4 min não cabe no Instagram', !!avisoDeDuracao('instagram', 240_000));
t('75 s no WhatsApp avisa do corte em 1 min', !!avisoDeDuracao('whatsapp', 75_000)?.includes('corta em 1 min'));
t('50 s no WhatsApp não avisa', avisoDeDuracao('whatsapp', 50_000) === null);
const lido = analiseDaIaSchema.safeParse({ topic: 'x y', promise: 'x y', structure: 'tutorial', hookType: 'promessa', postTitle: '  ' + 'T'.repeat(130) });
t('título longo da IA é cortado, não recusado', lido.success && (lido.data.postTitle?.length ?? 0) <= 100);

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail > 0) process.exit(1);
