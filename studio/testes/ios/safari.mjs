// ============================================================
// O roteiro no Safari do iPhone (simulador do Xcode, pelo safaridriver).
// Abre o editor prático com o projeto sintético, toca em "Editar", leva o
// vídeo até a animação, escolhe a animação e confere se a gaveta de edição
// abre. Registra o que a página relatou (erros de JavaScript, prévia), os
// avisos da tela e prints de cada passo em resultados/.
// ============================================================

import { remote } from 'webdriverio';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = 'http://localhost:8080';
const SAIDA = 'resultados';
mkdirSync(SAIDA, { recursive: true });
const passos = [];
const anotar = (passo, dados = {}) => {
  passos.push({ passo, ...dados });
  console.log(`[passo] ${passo} ${JSON.stringify(dados).slice(0, 600)}`);
};
const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));

const b = await remote({
  hostname: '127.0.0.1',
  port: 4444,
  path: '/',
  logLevel: 'warn',
  connectionRetryTimeout: 300_000,
  capabilities: { browserName: 'safari', platformName: 'iOS', 'safari:useSimulator': true, 'safari:deviceType': 'iPhone' },
});
const foto = async (nome) => {
  try {
    await b.saveScreenshot(`${SAIDA}/${nome}.png`);
  } catch (e) {
    anotar(`foto ${nome} falhou`, { erro: String(e).slice(0, 200) });
  }
};
const estado = () =>
  b.execute(() => {
    const ed = document.querySelector('.editor');
    const textos = (sel) => [...document.querySelectorAll(sel)].map((e) => e.textContent.trim().slice(0, 200)).filter(Boolean);
    return {
      url: location.pathname + location.search,
      folha: ed?.getAttribute('data-folha') ?? null,
      editando: ed?.hasAttribute('data-editando') ?? null,
      avisos: textos('[role=alert], .editor__aviso, .aviso, .erro, .pratico__avisos'),
      gavetas: [...document.querySelectorAll('.editor__inspector, .editor__ia')].map((g) => {
        const r = g.getBoundingClientRect();
        return `${g.className.split(' ')[0]} ${Math.round(r.width)}x${Math.round(r.height)} display=${getComputedStyle(g).display}`;
      }),
      chips: textos('.pratico__chip'),
      tela: `${innerWidth}x${innerHeight}`,
      ua: navigator.userAgent,
    };
  });

try {
  // O visual prático (o do celular) fica guardado antes de abrir o editor.
  await b.url(`${BASE}/offline`);
  await b.execute(() => localStorage.setItem('studio:visual-do-editor', 'pratico'));
  await b.url(`${BASE}/editor?projeto=projeto-teste-ios`);
  await b.$('.palco__quadro').waitForExist({ timeout: 240_000 });
  await espera(5000);
  anotar('editor aberto', await estado());
  await foto('1-aberto');

  await b.$('.pratico__editar').click();
  await espera(1500);
  // O vídeo até o meio da primeira animação (1 s a 5 s da timeline).
  await b.execute(() => {
    const el = document.querySelector('.pratico__tempo input');
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(el, '2500');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await espera(3000);
  anotar('editando, na animação', await estado());
  await foto('2-na-animacao');

  // O jeito 1: o chip "Animação" da bandeja.
  const chip = await b.$('.pratico__chip[data-animacao]');
  if (await chip.isExisting()) {
    await chip.click();
    await espera(4000);
    anotar('tocou no chip da animação', await estado());
    await foto('3-chip-animacao');
  } else anotar('sem chip da animação');

  // O jeito 2: tocar na animação no vídeo (fecha a gaveta antes, se abriu).
  await b.execute(() => document.querySelector('.editor__folha-cabecalho button:not([hidden])')?.click());
  await espera(1500);
  const toque = await b.$('.palco__toque-na-animacao');
  if (await toque.isExisting()) {
    await toque.click();
    await espera(3000);
    anotar('tocou na animação no vídeo', await estado());
    await foto('4-toque-no-video');
    // A etiqueta do item escolhido: o botão que abre os ajustes.
    const botoes = await b.execute(() => [...document.querySelectorAll('.pratico button, .etiqueta button')].map((x) => x.textContent.trim()).filter(Boolean).slice(0, 30));
    anotar('botões visíveis', { botoes });
    const ajustes = await b.$('button*=Ajustes');
    if (await ajustes.isExisting()) {
      await ajustes.click();
      await espera(3500);
      anotar('abriu os ajustes da animação', await estado());
      await foto('5-ajustes');
    }
  } else anotar('sem a camada de toque na animação');
} catch (e) {
  anotar('o roteiro falhou', { erro: String(e?.stack ?? e).slice(0, 1500) });
  await foto('x-falhou');
} finally {
  const relatos = await (await fetch(`${BASE}/__relatos`)).json();
  anotar('o que a página relatou', { erros: relatos.erros, previa: relatos.previa.slice(-2), pedidosComErro: relatos.pedidos.filter((p) => !p.startsWith('GET')).slice(-20) });
  writeFileSync(`${SAIDA}/passos.json`, JSON.stringify(passos, null, 2));
  await b.deleteSession().catch(() => undefined);
}
