import { resolve, sep } from 'node:path';
import { DiskStorageService } from '../src/modules/storage/disk-storage.service';

/**
 * Validacao das chaves de arquivo. Rodar com: pnpm test
 *
 * As chaves sao montadas pelo pipeline e nunca chegam do cliente, mas a
 * checagem existe para que uma regressao futura — um nome de arquivo que
 * passe a vir de fora — nao vire leitura ou escrita fora do diretorio de
 * midia. Este teste e o que garante que a checagem continua valendo.
 */
let ok = 0;
let fail = 0;

const diskPath = './storage/media';
const raiz = resolve(diskPath);

const config = {
  get: () => ({ diskPath, publicUrl: 'http://localhost:3001/files', provider: 'disk' }),
} as never;

const storage = new DiskStorageService(config);

/** caminhoDe é privado de propósito; o teste alcança por indexação. */
const caminhoDe = (chave: string): string =>
  (storage as unknown as { caminhoDe: (k: string) => string })['caminhoDe'](chave);

function teste(chave: string, deveAceitar: boolean): void {
  let aceita = true;
  let destino = '';

  try {
    destino = caminhoDe(chave);
  } catch {
    aceita = false;
  }

  // Aceitar e resolver para fora da raiz seria o pior caso: nunca pode.
  const escapou = aceita && destino !== raiz && !destino.startsWith(raiz + sep);

  if (aceita === deveAceitar && !escapou) {
    ok += 1;
    console.log(`ok    ${deveAceitar ? 'aceita ' : 'rejeita'} ${JSON.stringify(chave)}`);
  } else {
    fail += 1;
    console.error(
      `FALHA ${JSON.stringify(chave)} -> ${aceita ? `aceita (${destino})` : 'rejeitada'}, esperado ${
        deveAceitar ? 'aceitar' : 'rejeitar'
      }`,
    );
  }
}

// Chave legítima, no formato que o pipeline gera.
teste('2026/09/66c3d251afe10736-full-1600.webp', true);
teste('2026/09/abc-thumbnail-320.avif', true);

// Travessia por caminho relativo.
teste('../../../etc/passwd', false);
teste('a/../../../fora.txt', false);
// Rejeitamos mesmo quando o resultado ficaria dentro da raiz: saneando,
// a gravacao iria para um lugar diferente do que o banco registrou.
teste('ok/../ok2.webp', false);

// Caminhos absolutos.
teste('/etc/shadow', false);
teste('C:\\Windows\\system.ini', false);
teste('\\\\servidor\\share\\x', false);

// Byte nulo: trunca o caminho em chamadas de sistema mais antigas.
teste('2026/09/a\u0000b.webp', false);

console.log(`\n${ok} passaram, ${fail} falharam`);
if (fail > 0) process.exit(1);
