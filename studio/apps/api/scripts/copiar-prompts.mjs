// ============================================================
// Os prompts e as skills sao .md; o tsc so emite .js.
//
// Sem esta copia, `dist/modules/ai/prompts/` nao existe e a primeira
// chamada de IA em producao falha com "prompt nao esta na imagem" --
// um erro que nao aparece em typecheck, nem em teste, nem no build.
// As skills (`dist/modules/ai/skills/`) vao pelo mesmo caminho: sem
// elas a IA trabalha, mas sem o oficio.
//
// Em Node e nao em `cp -r` porque o mesmo script roda no Windows do
// desenvolvimento e no Linux do CI.
// ============================================================

import { cpSync, existsSync } from 'node:fs';
import { join } from 'node:path';

for (const pasta of ['prompts', 'skills']) {
  const origem = join(process.cwd(), 'src', 'modules', 'ai', pasta);
  const destino = join(process.cwd(), 'dist', 'modules', 'ai', pasta);

  if (!existsSync(origem)) {
    console.error(`${pasta} nao encontrados em ${origem}`);
    process.exit(1);
  }

  cpSync(origem, destino, { recursive: true });
  console.log(`${pasta} copiados para ${destino}`);
}
