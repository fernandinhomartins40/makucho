// ============================================================
// O roteiro no Safari do iPhone (simulador do Xcode, pelo safaridriver).
// Abre o editor prático com o projeto sintético, toca em "Editar", leva o
// vídeo até a animação, escolhe a animação e confere se a gaveta de edição
// abre. Registra o que a página relatou (erros de JavaScript, prévia), os
// avisos da tela e prints de cada passo em resultados/.
// ============================================================

import { remote } from 'webdriverio';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

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
// O print vem do simulador inteiro (simctl): o do safaridriver saía vazio.
const foto = async (nome) => {
  try {
    execFileSync('xcrun', ['simctl', 'io', 'booted', 'screenshot', `${SAIDA}/${nome}.png`], { stdio: 'ignore' });
  } catch (e) {
    anotar(`foto ${nome} falhou`, { erro: String(e).slice(0, 200) });
  }
};
// Toca como o dedo (o clique do WebDriver); se a página não reagir, o clique do JavaScript.
const tocar = async (sel, reagiu) => {
  const el = await b.$(sel);
  if (!(await el.isExisting())) return 'não existe';
  try {
    await el.click();
  } catch (e) {
    anotar(`clique em ${sel} falhou`, { erro: String(e).slice(0, 300) });
  }
  await espera(1500);
  if (await reagiu()) return 'toque';
  await b.execute((s) => document.querySelector(s)?.click(), sel);
  await espera(1500);
  return (await reagiu()) ? 'clique do JavaScript' : 'nada reagiu';
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
      modo: ed?.getAttribute('data-modo') ?? null,
      pratico: document.querySelector('.pratico')?.getAttribute('data-estado') ?? null,
      botoes: [...document.querySelectorAll('button')].filter((x) => x.getBoundingClientRect().width > 0).map((x) => (x.className.split(' ')[0] || '') + ':' + (x.textContent.trim() || x.getAttribute('aria-label') || '').slice(0, 30)).slice(0, 40),
      noMeio: (() => {
        const e = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
        return e ? `${e.tagName}.${String(e.className).split(' ')[0]}` : null;
      })(),
      tempo: document.querySelector('.pratico__tempo input')?.value ?? null,
      pecas: document.querySelectorAll('.palco__peca').length,
      // As páginas dentro da página (a animação no vídeo, as miniaturas dos modelos): cada uma pesa na memória do iPhone.
      iframes: document.querySelectorAll('iframe').length,
      miniaturas: document.querySelectorAll('.modelos-da-cena iframe').length,
      edicaoNoPalco: !!document.querySelector('.palco__edicao-animacao'),
      etiqueta: !!document.querySelector('.palco__etiqueta-da-selecao'),
      telaDeErro: document.body.innerText.match(/Application error|client-side exception|Algo deu errado|Unhandled|erro[^\n]{0,80}/i)?.[0] ?? null,
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

  const editando = async () => (await b.execute(() => document.querySelector('.editor')?.hasAttribute('data-editando'))) === true;
  anotar('tocou em Editar', { como: await tocar('.pratico__editar', editando) });
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

  // O dedo de verdade: toque (W3C actions, pointer "touch") no meio do elemento.
  const dedo = async (sel) => {
    const el = await b.$(sel);
    if (!(await el.isExisting())) return 'não existe';
    try {
      await b.action('pointer', { parameters: { pointerType: 'touch' } }).move({ origin: el }).down().pause(80).up().perform();
      return 'dedo';
    } catch (e) {
      anotar(`dedo em ${sel} falhou`, { erro: String(e).slice(0, 300) });
      return 'falhou';
    }
  };
  const folhaAberta = async () => (await b.execute(() => document.querySelector('.editor')?.getAttribute('data-folha'))) != null;
  const fecharGaveta = async () => {
    await b.execute(() => [...document.querySelectorAll('.editor__folha-cabecalho button')].find((x) => /✕|Fechar/.test(x.textContent + (x.getAttribute('aria-label') ?? '')))?.click());
    await espera(1500);
  };
  const temEtiqueta = async () => b.execute(() => !!document.querySelector('.palco__etiqueta-da-selecao'));
  // As peças, com a gaveta fechada (aberta, ela cobre o vídeo).
  const pecas = async (prefixo) => {
    await fecharGaveta();
    anotar(`${prefixo}: gaveta fechada`, await estado());
    await foto(`${prefixo}-a-sem-gaveta`);
    if (!(await b.$('.palco__peca').isExisting())) return anotar(`${prefixo}: a animação não mostrou peças`);
    const viva = async () => {
      try {
        return (await b.execute(() => document.readyState)) === 'complete';
      } catch {
        return false;
      }
    };
    // Controle: o dedo de verdade num botão que não mexe nas peças (a lista de camadas, liga e desliga).
    for (let i = 0; i < 2; i++) {
      const c = await dedo('.palco__ver-camadas');
      await espera(1500);
      anotar(`${prefixo}: controle, dedo nas camadas ${i + 1}`, { como: c, viva: await viva() });
    }
    // A prova: o toque na peça só pelo código da página (pointerdown/up em JavaScript, sem o safaridriver).
    const t0 = Date.now();
    await b.execute(() => {
      const todas = document.querySelectorAll('.palco__peca');
      const el = todas[todas.length - 1];
      const r = el.getBoundingClientRect();
      const o = { bubbles: true, cancelable: true, composed: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0, buttons: 1 };
      el.dispatchEvent(new PointerEvent('pointerdown', o));
      window.dispatchEvent(new PointerEvent('pointerup', { ...o, buttons: 0 }));
    });
    await espera(2500);
    const vivaDepoisDoJs = await viva();
    anotar(`${prefixo}: peça tocada por JavaScript`, { ms: Date.now() - t0, viva: vivaDepoisDoJs, ...(vivaDepoisDoJs ? await estado() : {}) });
    await foto(`${prefixo}-b-peca-js`);
    if (!vivaDepoisDoJs) return;
    // O dedo de verdade numa peça (outra, a primeira).
    const t1 = Date.now();
    let como = await dedo('.palco__peca');
    await espera(1500);
    const vivaDepoisDoDedo = await viva();
    anotar(`${prefixo}: dedo numa peça`, { como, ms: Date.now() - t1, viva: vivaDepoisDoDedo, ...(vivaDepoisDoDedo ? await estado() : {}) });
    await foto(`${prefixo}-b-peca`);
    if (!vivaDepoisDoDedo) return;
    for (const rotulo of ['Aumentar', 'Selecionar o conjunto', 'Aumentar']) {
      if (!(await b.$(`button[aria-label="${rotulo}"]`).isExisting())) continue;
      const c = await dedo(`button[aria-label="${rotulo}"]`);
      await espera(1800);
      anotar(`${prefixo}: apertou ${rotulo}`, { como: c, ...(await estado()) });
    }
    await foto(`${prefixo}-c-ajustada`);
  };

  // O jeito 1: o chip "Animação" da bandeja.
  if (await b.$('.pratico__chip[data-animacao]').isExisting()) {
    const como = await tocar('.pratico__chip[data-animacao]', folhaAberta);
    await espera(2500);
    anotar('tocou no chip da animação', { como, ...(await estado()) });
    await foto('3-chip-animacao');
    // A faixa de modelos rolada até o fim: as miniaturas que saem de vista têm de sair da memória.
    for (const ate of [0.5, 1]) {
      await b.execute((f) => {
        const el = document.querySelector('.modelos-da-cena');
        if (el) el.scrollLeft = (el.scrollWidth - el.clientWidth) * f;
      }, ate);
      await espera(2000);
      anotar(`modelos rolados ${ate * 100}%`, await b.execute(() => ({ iframes: document.querySelectorAll('iframe').length, miniaturas: document.querySelectorAll('.modelos-da-cena iframe').length })));
    }
    await pecas('3');
  } else anotar('sem chip da animação');

  // O jeito 2 (o do cliente): o editor de novo, e o dedo na animação no vídeo.
  await b.url(`${BASE}/editor?projeto=projeto-teste-ios&v=2`);
  await b.$('.palco__quadro').waitForExist({ timeout: 240_000 });
  await espera(4000);
  await tocar('.pratico__editar', editando);
  await b.execute(() => {
    const el = document.querySelector('.pratico__tempo input');
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(el, '2500');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await espera(2500);
  if (await b.$('.palco__toque-na-animacao').isExisting()) {
    let como = await dedo('.palco__toque-na-animacao');
    await espera(2500);
    if (!(await folhaAberta()) && (await b.$('.palco__toque-na-animacao').isExisting())) {
      await b.execute(() => document.querySelector('.palco__toque-na-animacao')?.click());
      await espera(2500);
      como += ' + clique do JavaScript';
    }
    anotar('tocou na animação no vídeo', { como, ...(await estado()) });
    await foto('6-toque-no-video');
    await pecas('6');
  } else anotar('sem a camada de toque na animação', await estado());
} catch (e) {
  anotar('o roteiro falhou', { erro: String(e?.stack ?? e).slice(0, 1500) });
  await foto('x-falhou');
} finally {
  const relatos = await (await fetch(`${BASE}/__relatos`)).json();
  anotar('o que a página relatou', { erros: relatos.erros, previa: relatos.previa.slice(-2), pedidosComErro: relatos.pedidos.filter((p) => !p.startsWith('GET')).slice(-20) });
  writeFileSync(`${SAIDA}/passos.json`, JSON.stringify(passos, null, 2));
  await b.deleteSession().catch(() => undefined);
}
