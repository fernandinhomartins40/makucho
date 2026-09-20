import {
  assetMetadataSchema,
  captionStyleInputSchema,
  communicationProfileInputSchema,
  brandProfileInputSchema,
  storageKeySeguro,
  detectarMimeReal,
  svgEhSeguro,
  validarArquivo,
  MIME_POR_TIPO,
  PERFIL_COMUNICACAO_PADRAO,
} from '../src/index';

let ok = 0, fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

// ============================================================
// Brand profile
// ============================================================

const cores = {
  primary: '#1E5AFF',
  secondary: '#0A1A3C',
  accent: '#22C55E',
  textLight: '#F5F7FA',
  textDark: '#0A1A3C',
};

t('aceita perfil de marca valido',
  brandProfileInputSchema.safeParse({ name: 'MAKUCHO', colors: cores }).success);

// Cor precisa ser hex: nome CSS ou rgb() deixaria string arbitraria
// chegar ao Remotion como valor de estilo.
t('rejeita cor por nome CSS',
  !brandProfileInputSchema.safeParse({
    name: 'X', colors: { ...cores, primary: 'blue' },
  }).success);

t('rejeita cor em rgb()',
  !brandProfileInputSchema.safeParse({
    name: 'X', colors: { ...cores, primary: 'rgb(30,90,255)' },
  }).success);

// ============================================================
// Estilo de legenda
// ============================================================

const estiloBase = {
  name: 'Padrao',
  fontFamily: 'Inter',
  fontSizePx: 56,
  color: '#FFFFFF',
  wordsPerBlock: 3,
  position: 'bottom' as const,
};

t('aceita estilo de legenda valido',
  captionStyleInputSchema.safeParse(estiloBase).success);

// Fonte de 200px com 8 palavras cobriria metade do quadro 1080x1920.
t('rejeita fonte grande demais para o quadro',
  !captionStyleInputSchema.safeParse({ ...estiloBase, fontSizePx: 200 }).success);

t('rejeita mais de 8 palavras por bloco',
  !captionStyleInputSchema.safeParse({ ...estiloBase, wordsPerBlock: 12 }).success);

// Borda sem cor definida renderiza preto por acidente.
t('rejeita borda sem cor',
  !captionStyleInputSchema.safeParse({ ...estiloBase, strokeWidthPx: 4 }).success);

t('aceita borda com cor',
  captionStyleInputSchema.safeParse({
    ...estiloBase, strokeWidthPx: 4, strokeColor: '#000000',
  }).success);

// ============================================================
// Assets: tipo, tamanho e licenca
// ============================================================

t('aceita logo PNG',
  assetMetadataSchema.safeParse({
    kind: 'LOGO', originalName: 'logo.png', mimeType: 'image/png', sizeBytes: 50_000,
  }).success);

// Um SVG declarado como musica passa pela checagem de bytes e precisa
// ser barrado pela tabela de tipos.
t('rejeita MIME incompativel com o tipo de asset',
  !assetMetadataSchema.safeParse({
    kind: 'MUSIC', originalName: 'x.svg', mimeType: 'image/svg+xml', sizeBytes: 1000,
  }).success);

t('rejeita logo acima do teto de tamanho',
  !assetMetadataSchema.safeParse({
    kind: 'LOGO', originalName: 'logo.png', mimeType: 'image/png',
    sizeBytes: 10 * 1024 * 1024,
  }).success);

// Licenca de fonte e musica tem consequencia juridica real.
t('fonte sem licenca e recusada',
  !assetMetadataSchema.safeParse({
    kind: 'FONT', originalName: 'f.woff2', mimeType: 'font/woff2', sizeBytes: 100_000,
  }).success);

t('musica sem licenca e recusada',
  !assetMetadataSchema.safeParse({
    kind: 'MUSIC', originalName: 'm.mp3', mimeType: 'audio/mpeg', sizeBytes: 3_000_000,
  }).success);

t('fonte com licenca e aceita',
  assetMetadataSchema.safeParse({
    kind: 'FONT', originalName: 'f.woff2', mimeType: 'font/woff2', sizeBytes: 100_000,
    license: { holder: 'Google Fonts', type: 'royalty_free' },
  }).success);

// ============================================================
// Nome de arquivo no storage
// ============================================================

// O nome enviado nunca vira caminho: pode conter "../" ou byte nulo.
const chave = storageKeySeguro('ws123', 'LOGO', 'abc123def456', 'png');
t('storageKey isola por workspace', chave.startsWith('assets/ws123/'));
t('storageKey nao aceita travessia',
  !storageKeySeguro('ws1', 'LOGO', 'h', '../../etc/passwd').includes('..'));
t('storageKey normaliza a extensao',
  storageKeySeguro('ws1', 'LOGO', 'h', 'PNG').endsWith('.png'));

// ============================================================
// Deteccao pelos bytes
// ============================================================

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const mp4 = new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);

t('detecta PNG', detectarMimeReal(png) === 'image/png');
t('detecta JPEG', detectarMimeReal(jpeg) === 'image/jpeg');
t('detecta MP4', detectarMimeReal(mp4) === 'video/mp4');

// RIFF cobre WAV e WebP: sem o marcador secundario, um WebP entraria
// como audio.
const webp = new Uint8Array([0x52,0x49,0x46,0x46, 0,0,0,0, 0x57,0x45,0x42,0x50]);
const wav  = new Uint8Array([0x52,0x49,0x46,0x46, 0,0,0,0, 0x57,0x41,0x56,0x45]);
t('distingue WebP de WAV no container RIFF', detectarMimeReal(webp) === 'image/webp');
t('detecta WAV', detectarMimeReal(wav) === 'audio/wav');

// Formato desconhecido nao vira "o que o cliente disse".
t('formato desconhecido devolve null',
  detectarMimeReal(new Uint8Array([0x00, 0x11, 0x22, 0x33])) === null);

// ============================================================
// O ataque que esta validacao existe para impedir
// ============================================================

// HTML com script renomeado para .png: servido inline, executa no
// dominio da aplicacao com acesso ao cookie de sessao.
const htmlDisfarcado = new TextEncoder().encode('<html><script>alert(1)</script>');
const r1 = validarArquivo(htmlDisfarcado, 'image/png', MIME_POR_TIPO.LOGO);
t('recusa HTML disfarcado de PNG', !r1.ok);

// Arquivo legitimo, mas declarado como outra coisa.
const r2 = validarArquivo(png, 'image/jpeg', MIME_POR_TIPO.LOGO);
t('recusa divergencia entre bytes e Content-Type', !r2.ok && r2.mimeReal === 'image/png');

// Tipo real valido, porem nao permitido para este asset.
const r3 = validarArquivo(mp4, 'video/mp4', MIME_POR_TIPO.LOGO);
t('recusa MP4 como logo', !r3.ok);

t('aceita PNG legitimo como logo',
  validarArquivo(png, 'image/png', MIME_POR_TIPO.LOGO).ok);

// ============================================================
// SVG: conteudo ativo
// ============================================================

t('SVG limpo passa',
  svgEhSeguro('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10v10H0z"/></svg>').seguro);

t('SVG com <script> e recusado',
  !svgEhSeguro('<svg><script>fetch("/api/me")</script></svg>').seguro);

t('SVG com onload e recusado',
  !svgEhSeguro('<svg onload="alert(1)"><rect/></svg>').seguro);

t('SVG com javascript: e recusado',
  !svgEhSeguro('<svg><a href="javascript:alert(1)">x</a></svg>').seguro);

t('SVG com foreignObject e recusado',
  !svgEhSeguro('<svg><foreignObject><body>x</body></foreignObject></svg>').seguro);

// XXE: entidade externa pode ler arquivo do servidor.
t('SVG com ENTITY e recusado',
  !svgEhSeguro('<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg/>').seguro);

// ============================================================
// Communication Profile
// ============================================================

t('perfil padrao e valido',
  communicationProfileInputSchema.safeParse(PERFIL_COMUNICACAO_PADRAO).success);

t('duracao alvo do padrao esta na faixa do contexto mestre',
  PERFIL_COMUNICACAO_PADRAO.targetDurationMinMs === 45_000 &&
  PERFIL_COMUNICACAO_PADRAO.targetDurationMaxMs === 75_000);

t('rejeita duracao maxima menor que a minima',
  !communicationProfileInputSchema.safeParse({
    ...PERFIL_COMUNICACAO_PADRAO,
    targetDurationMinMs: 60_000, targetDurationMaxMs: 30_000,
  }).success);

t('rejeita framework desconhecido',
  !communicationProfileInputSchema.safeParse({
    ...PERFIL_COMUNICACAO_PADRAO, allowedFrameworks: ['framework_inventado'],
  }).success);

t('exige ao menos um tipo de hook',
  !communicationProfileInputSchema.safeParse({
    ...PERFIL_COMUNICACAO_PADRAO, allowedHooks: [],
  }).success);

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail > 0) process.exit(1);
