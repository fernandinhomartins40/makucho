// ============================================================
// Projeto excluído no meio de um job.
//
// A API apaga a linha do projeto e a pasta dele na hora. Um job que já
// estava rodando não sabe disso: termina o FFmpeg, publica o arquivo
// (recriando a pasta) e só então falha ao gravar no banco. Sem esta
// limpeza, o vídeo de um projeto excluído ficaria no disco, ocupando
// a cota, sem nenhum registro que apontasse para ele.
// ============================================================

import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Se o projeto não existe mais, apaga a pasta dele em qualquer
 * workspace e devolve `true`. A chave é `{workspace}/{projeto}/...` e,
 * com a linha apagada, o workspace não é mais conhecido -- por isso a
 * busca nas pastas de primeiro nível (são poucas: uma por workspace).
 */
export async function limparSeProjetoExcluido(
  raizDoStorage: string,
  projectId: string,
  projetoExiste: () => Promise<boolean>,
): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]+$/.test(projectId)) return false;
  if (await projetoExiste().catch(() => true)) return false;

  const workspaces = await readdir(raizDoStorage, { withFileTypes: true }).catch(() => []);
  for (const ws of workspaces) {
    if (!ws.isDirectory() || ws.name.startsWith('_')) continue;
    await rm(join(raizDoStorage, ws.name, projectId), { recursive: true, force: true }).catch(() => undefined);
  }
  return true;
}
