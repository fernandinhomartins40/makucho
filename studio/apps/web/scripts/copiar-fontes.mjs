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
import { join } from 'node:path';

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
