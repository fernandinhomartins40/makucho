// ============================================================
// As fontes do vídeo, servidas também pela web.
//
// A prévia do editor desenha a legenda com o mesmo libass do render
// (JASSUB), e ele precisa dos MESMOS arquivos de fonte: uma fonte
// diferente na prévia muda a largura das linhas e a quebra dos blocos.
// A origem única é `studio/assets/fonts` (também copiada para a
// imagem de render); aqui ela vira `public/fonts`, fora do git.
// ============================================================

import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const origem = join(process.cwd(), '..', '..', 'assets', 'fonts');
const destino = join(process.cwd(), 'public', 'fonts');

if (!existsSync(origem)) {
  console.error(`fontes não encontradas em ${origem}`);
  process.exit(1);
}

mkdirSync(destino, { recursive: true });
const arquivos = readdirSync(origem).filter((f) => f.endsWith('.ttf'));
for (const f of arquivos) cpSync(join(origem, f), join(destino, f));
console.log(`${arquivos.length} fontes copiadas para ${destino}`);

// ---------- Modelo da pessoa e runtime ONNX (texto atrás da pessoa) ----------
//
// A prévia recorta a pessoa com o MESMO modelo e a mesma biblioteca do
// render (onnxruntime-web). Servidos pela própria web, sem CDN: só o
// arquivo WebAssembly de CPU, que é o que a prévia usa.
const modelos = join(process.cwd(), '..', '..', 'assets', 'modelos');
const destinoDosModelos = join(process.cwd(), 'public', 'modelos');
mkdirSync(destinoDosModelos, { recursive: true });
for (const f of readdirSync(modelos).filter((f) => f.endsWith('.onnx'))) cpSync(join(modelos, f), join(destinoDosModelos, f));

const require = createRequire(import.meta.url);
const ort = dirname(require.resolve('onnxruntime-web/ort-wasm-simd-threaded.wasm'));
const destinoDoOrt = join(process.cwd(), 'public', 'ort');
mkdirSync(destinoDoOrt, { recursive: true });
for (const f of ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs']) cpSync(join(ort, f), join(destinoDoOrt, f));
console.log('modelo da pessoa e runtime ONNX copiados');

