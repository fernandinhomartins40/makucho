import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const base = dirname(fileURLToPath(import.meta.url));
const output = join(base, 'referencias');
mkdirSync(output, { recursive: true });

const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const screens = [
  'home', 'artigo', 'autor', 'categoria', 'tag', 'busca', 'videos', 'sobre', 'contato', 'nao_encontrado', 'erro',
  'painel_entrar', 'painel_senha', 'painel', 'painel_publicacoes',
  'painel_publicacoes_nova', 'painel_publicacoes_editar', 'painel_midia',
  'painel_videos', 'painel_categorias', 'painel_tags', 'painel_autores',
  'painel_home', 'painel_anuncios', 'painel_newsletter', 'painel_usuarios',
  'painel_configuracoes', 'painel_auditoria',
];
const viewports = [
  ['mobile', 390, 844],
  ['tablet', 820, 1180],
  ['notebook', 1280, 800],
  ['desktop', 1440, 900],
];
const only = process.argv.slice(2).filter((arg) => !arg.startsWith('--viewport='));
const onlyViewport = process.argv.slice(2).find((arg) => arg.startsWith('--viewport='))?.split('=')[1];
let failures = 0;
for (const screen of screens.filter((item) => !only.length || only.includes(item))) {
  for (const [viewport, width, height] of viewports.filter(([name]) => !onlyViewport || name === onlyViewport)) {
    const filename = join(output, `${screen}-${viewport}.png`);
    const url = `${pathToFileURL(join(base, 'visual-reference.html')).href}?id=${screen}&w=${width}`;
    const result = spawnSync(chrome, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars',
      '--no-first-run', '--no-default-browser-check',
      '--force-device-scale-factor=1', `--window-size=${width},${height}`,
      `--screenshot=${filename}`, url,
    ], { windowsHide: true, encoding: 'utf8', timeout: 30000 });
    if (result.status !== 0) {
      failures++;
      process.stderr.write(`${screen}/${viewport}: ${result.stderr || result.error || 'falha'}\n`);
    } else {
      process.stdout.write(`${filename}\n`);
    }
  }
}
if (failures) process.exitCode = 1;
