import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = dirname(fileURLToPath(import.meta.url));
const out = join(base, 'validacao');
mkdirSync(out, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), 'makucho-runtime-capture-'));
const browser = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore', windowsHide: true });

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let socket;
try {
  const portFile = join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !existsSync(portFile); i++) await delay(100);
  if (!existsSync(portFile)) throw new Error('Chrome não abriu depuração remota');
  const port = Number(readFileSync(portFile, 'utf8').split('\n')[0]);
  const target = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json());
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0;
  const pending = new Map();
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const handler = pending.get(message.id);
    if (!handler) return;
    pending.delete(message.id);
    if (message.error) handler.reject(new Error(message.error.message));
    else handler.resolve(message.result);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const requestId = ++id;
    pending.set(requestId, { resolve, reject });
    socket.send(JSON.stringify({ id: requestId, method, params }));
  });

  const cases = [
    ['painel-entrar', 'http://localhost:3100/painel/entrar', 3000],
    ['portal-indisponivel', 'http://localhost:3100/', 10000],
  ];
  for (const [name, url, waitMs] of cases) {
    for (const [viewport, width, height] of [['mobile', 390, 844], ['tablet', 820, 1180], ['notebook', 1280, 800], ['desktop', 1440, 900]]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
      await send('Page.navigate', { url });
      await delay(waitMs);
      const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      const filename = join(out, `${name}-${viewport}-exact.png`);
      writeFileSync(filename, Buffer.from(result.data, 'base64'));
      process.stdout.write(`${filename}\n`);
    }
  }
} finally {
  socket?.close();
  browser.kill();
  if (profile.startsWith(tmpdir()) && profile.includes('makucho-runtime-capture-')) {
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome pode levar um instante para fechar. */ }
  }
}
