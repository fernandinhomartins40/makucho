// ============================================================
// Publica o resultado do teste no iPhone como ANOTAÇÕES da execução do
// GitHub Actions: o repositório é público, e as anotações se leem pela API
// sem login (os artefatos pedem). `passos` -> uma anotação por passo;
// `fotos` -> cada print reduzido (JPEG em base64, cabe no limite de 64 KB).
// ============================================================

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const escapar = (s) => String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const anotar = (titulo, texto) => console.log(`::notice title=${escapar(titulo).replace(/[,:]/g, ' ')}::${escapar(texto).slice(0, 60_000)}`);
const modo = process.argv[2];

if (modo === 'passos') {
  const passos = existsSync('resultados/passos.json') ? JSON.parse(readFileSync('resultados/passos.json', 'utf8')) : [{ passo: 'sem resultados (o roteiro não rodou)' }];
  for (const [i, p] of passos.slice(0, 10).entries()) anotar(`${process.env.RUNNER_LABEL ?? ''} passo ${i + 1}`, JSON.stringify(p));
}

if (modo === 'fotos') {
  const fotos = existsSync('resultados') ? readdirSync('resultados').filter((f) => f.endsWith('.png')).sort() : [];
  for (const f of fotos.slice(0, 10)) {
    const jpg = `resultados/${f.replace('.png', '.jpg')}`;
    // sips (macOS): o print do iPhone reduzido a 380 px de altura, JPEG leve.
    execFileSync('sips', ['-Z', '380', '-s', 'format', 'jpeg', '-s', 'formatOptions', '45', `resultados/${f}`, '--out', jpg], { stdio: 'ignore' });
    anotar(`${process.env.RUNNER_LABEL ?? ''} foto ${f}`, `data:image/jpeg;base64,${readFileSync(jpg).toString('base64')}`);
  }
}
