// ============================================================
// Os prompts sao .md; o tsc so emite .js.
//
// Sem esta copia, `dist/modules/ai/prompts/` nao existe e a primeira
// chamada de IA em producao falha com "prompt nao esta na imagem" --
// um erro que nao aparece em typecheck, nem em teste, nem no build.
//
// Em Node e nao em `cp -r` porque o mesmo script roda no Windows do
// desenvolvimento e no Linux do CI.
// ============================================================

import { cpSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const origem = join(process.cwd(), 'src', 'modules', 'ai', 'prompts');
const destino = join(process.cwd(), 'dist', 'modules', 'ai', 'prompts');

if (!existsSync(origem)) {
  console.error(`prompts nao encontrados em ${origem}`);
  process.exit(1);
}

cpSync(origem, destino, { recursive: true });
console.log(`prompts copiados para ${destino}`);
