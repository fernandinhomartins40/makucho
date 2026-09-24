import { detectarPlataforma, guiaParaApple, guiaSemDialogo, versaoAtinge } from '../src/lib/plataforma';

let ok = 0, fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

const UA = {
  // Safari 26 congela o sistema em "18_6"; a versão real vem de Version/26.
  safari26: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  safari17: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  chromeIos15: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/118.0 Mobile/15E148 Safari/604.1',
  chromeIos17: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0 Mobile/15E148 Safari/604.1',
  firefoxIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/125.0 Mobile/15E148 Safari/605.1.15',
  instagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.40.92',
  // iPadOS 13+ se diz Mac; só o toque denuncia.
  ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:125.0) Gecko/125.0 Firefox/125.0',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
};

const d = (ua: string, toque = 5) => detectarPlataforma({ ua, maxTouchPoints: toque });

// ---------- Detecção ----------
const s26 = d(UA.safari26);
t('Safari 26: iOS e Safari', s26.sistema === 'ios' && s26.navegador === 'safari');
t('Safari 26: versão real 26, não 18.6', s26.versaoIos?.[0] === 26);
t('Safari 17: versão 17.5', d(UA.safari17).versaoIos?.join('.') === '17.5');
t('Chrome no iPhone', d(UA.chromeIos17).navegador === 'chrome');
t('Firefox no iPhone', d(UA.firefoxIos).navegador === 'firefox');
t('Instagram é navegador embutido', d(UA.instagram).navegador === 'app');
t('iPad com UA de Mac', d(UA.ipad).sistema === 'ipados');
t('Mac de verdade (sem toque) é desktop', d(UA.macSafari, 0).sistema === 'desktop');
t('Android Chrome', d(UA.androidChrome).sistema === 'android' && d(UA.androidChrome).navegador === 'chrome');
t('Samsung Internet', d(UA.samsung).navegador === 'samsung');
t('Firefox Android', d(UA.androidFirefox).navegador === 'firefox');
t('versaoAtinge 16.4', versaoAtinge([16, 4], 16, 4) && !versaoAtinge([16, 3], 16, 4) && versaoAtinge([17, 0], 16, 4));

// ---------- Guias ----------
const texto = (g: ReturnType<typeof guiaParaApple>) => g.passos.map((p) => p.texto).join(' | ');

t('iOS 26 Safari: começa pelo •••', guiaParaApple(s26).passos[0]?.icone === 'mais');
t('iOS 26 Safari: cita "Abrir como App Web"', texto(guiaParaApple(s26)).includes('Abrir como App Web'));
t('iOS 17 Safari: Compartilhar na barra de baixo', texto(guiaParaApple(d(UA.safari17))).includes('barra de baixo'));
t('iPad: Compartilhar no alto', texto(guiaParaApple(d(UA.ipad))).includes('no alto'));
t('Chrome iOS 17: Compartilhar ao lado do endereço', texto(guiaParaApple(d(UA.chromeIos17))).includes('barra de endereço'));
t('Chrome iOS 15: manda para o Safari', guiaParaApple(d(UA.chromeIos15)).abrirNoSafari === true);
t('Chrome iOS 15: explica o 16.4', (guiaParaApple(d(UA.chromeIos15)).dica ?? '').includes('16.4'));
t('Firefox iOS: pelo menu', guiaParaApple(d(UA.firefoxIos)).passos[0]?.icone === 'menu');
t('Instagram: manda para o Safari', guiaParaApple(d(UA.instagram)).abrirNoSafari === true);
t('Firefox Android: menu do Firefox', guiaSemDialogo(d(UA.androidFirefox)).passos[0]?.texto.includes('Firefox') === true);
t('Desktop: ícone da barra de endereço', guiaSemDialogo(d(UA.macSafari, 0)).titulo.includes('computador'));

console.log(`\n${ok} ok, ${fail} falhas`);
if (fail) process.exit(1);
