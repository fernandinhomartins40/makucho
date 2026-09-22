import {
  loginSchema, criarPostSchema, atualizarPostSchema, urlExternaSchema,
  senhaSchema, inscreverNewsletterSchema, criarAnuncioSchema, atualizarAnuncioSchema,
  redeSocialSchema,
} from '../src/index';

let ok = 0, fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

// --- URL: bloqueio de XSS ---
t('rejeita javascript:', !urlExternaSchema.safeParse('javascript:alert(1)').success);
t('rejeita data:', !urlExternaSchema.safeParse('data:text/html,<script>').success);
t('aceita https', urlExternaSchema.safeParse('https://youtube.com/watch?v=x').success);

// --- Senha ---
t('rejeita senha curta', !senhaSchema.safeParse('Abc1').success);
t('rejeita sem maiuscula', !senhaSchema.safeParse('abcdefgh12').success);
t('aceita senha forte', senhaSchema.safeParse('Makucho@2026').success);

// --- Login ---
const login = loginSchema.safeParse({ email: '  ADMIN@Makucho.com.BR ', password: 'x' });
t('login normaliza email', login.success && login.data.email === 'admin@makucho.com.br');

// --- Post: regras cruzadas ---
const semPlataforma = criarPostSchema.safeParse({
  title: 'Teste', categoryId: '550e8400-e29b-41d4-a716-446655440000',
  videoUrl: 'https://youtube.com/watch?v=abc',
});
t('exige plataforma quando ha video', !semPlataforma.success);

const agendadoSemData = criarPostSchema.safeParse({
  title: 'Teste', categoryId: '550e8400-e29b-41d4-a716-446655440000', status: 'SCHEDULED',
});
t('exige data ao agendar', !agendadoSemData.success);

const agendadoPassado = criarPostSchema.safeParse({
  title: 'Teste', categoryId: '550e8400-e29b-41d4-a716-446655440000',
  status: 'SCHEDULED', scheduledFor: '2020-01-01',
});
t('rejeita agendamento no passado', !agendadoPassado.success);

const valido = criarPostSchema.safeParse({
  title: 'O que esperar da economia brasileira',
  categoryId: '550e8400-e29b-41d4-a716-446655440000',
  videoUrl: 'https://youtube.com/watch?v=abc', videoPlatform: 'YOUTUBE',
});
t('aceita post valido', valido.success);
t('aplica padroes (robots)', valido.success && valido.data.robots === 'index,follow');

// --- Edicao parcial (o bug do .innerType) ---
const parcial = atualizarPostSchema.safeParse({ title: 'Só o título' });
t('edicao parcial funciona', parcial.success);

// --- Newsletter: LGPD ---
t('exige consentimento', !inscreverNewsletterSchema.safeParse({ email: 'a@b.com', consent: false }).success);
t('aceita com consentimento', inscreverNewsletterSchema.safeParse({ email: 'a@b.com', consent: true }).success);

// --- Anuncio ---
const datasInvertidas = criarAnuncioSchema.safeParse({
  name: 'Banner', targetUrl: 'https://x.com', alt: 'Banner',
  placements: ['HOME_TOP'], startsAt: '2026-12-01', endsAt: '2026-01-01',
});
t('rejeita data final antes da inicial', !datasInvertidas.success);
t('anuncio parcial funciona', atualizarAnuncioSchema.safeParse({ name: 'Novo nome' }).success);

const rede = redeSocialSchema.safeParse({
  platform: 'instagram', label: 'MAKUCHO', url: 'https://instagram.com/makucho',
});
t('rede social preserva opções não enviadas na edição', rede.success && !('isActive' in rede.data) && !('showInHeader' in rede.data) && !('position' in rede.data));

console.log(`\n${ok} passaram, ${fail} falharam`);
process.exit(fail > 0 ? 1 : 0);
