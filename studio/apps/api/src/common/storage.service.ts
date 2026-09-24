// ============================================================
// Armazenamento em disco (ADR 0003 — VPS compartilhada).
//
// A decisão de storage foi disco da VPS, não R2: 10 GB em dois
// baldes, 4 permanente e 6 de edição. Este serviço é a única porta
// para esse disco.
//
// Duas regras que ele existe para garantir:
//
//   - a `storageKey` NUNCA vem do cliente. Ela é montada aqui, a
//     partir de ids que o banco gerou. Aceitar caminho do cliente é
//     convite a `../../etc/passwd`;
//   - todo caminho resolvido é conferido contra a raiz antes de
//     abrir. Mesmo montando a chave aqui, a checagem fica — defesa
//     em profundidade custa três linhas.
// ============================================================

import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat, readdir } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class StorageService {
  private readonly log = new Logger(StorageService.name);
  private readonly raiz: string;

  constructor() {
    this.raiz = resolve(process.env.STORAGE_DISK_PATH ?? '/app/storage/media');
  }

  /**
   * Monta a chave de um arquivo de mídia.
   *
   * O formato agrupa por workspace e projeto, o que torna a remoção em
   * lote (retenção, projeto arquivado) uma operação de diretório em
   * vez de uma varredura.
   */
  chaveDeMidia(
    workspaceId: string,
    projectId: string,
    tipo: 'original' | 'proxy' | 'audio' | 'thumb' | 'render',
    extensao: string,
  ): string {
    const limpo = extensao.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 8);
    return `${seguro(workspaceId)}/${seguro(projectId)}/${tipo}.${limpo || 'bin'}`;
  }

  /**
   * Chave de uma PARTE (um dos vários vídeos de um projeto).
   *
   * Única por envio: a chave do original é fixa por projeto
   * (`original.mp4`), e era por isso que o segundo vídeo colidia com o
   * primeiro.
   */
  chaveDeParte(workspaceId: string, projectId: string, uploadId: string, extensao: string): string {
    const limpo = extensao.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 8);
    return `${seguro(workspaceId)}/${seguro(projectId)}/partes/${seguro(uploadId)}.${limpo || 'bin'}`;
  }

  /**
   * A pasta com TUDO de um projeto: original, partes, prévia, áudio,
   * miniatura e vídeos exportados. Excluir o projeto é apagar ela.
   */
  pastaDoProjeto(workspaceId: string, projectId: string): string {
    return `${seguro(workspaceId)}/${seguro(projectId)}`;
  }

  /** Quanto uma pasta ocupa, em bytes (zero se não existe). */
  async tamanhoDaPasta(chave: string): Promise<number> {
    return somaDaPasta(this.caminho(chave));
  }

  /** Chave de um pedaço de upload em andamento. */
  chaveDePedaco(uploadId: string, indice: number): string {
    return `_tmp/${seguro(uploadId)}/${String(indice).padStart(6, '0')}.part`;
  }

  /**
   * Caminho absoluto de uma chave, conferido contra a raiz.
   *
   * Uma chave que escape da raiz é erro de programação ou ataque; nos
   * dois casos, falhar alto é melhor que servir o arquivo.
   */
  caminho(chave: string): string {
    const completo = resolve(this.raiz, chave);
    if (completo !== this.raiz && !completo.startsWith(this.raiz + sep)) {
      throw new Error(`chave de storage fora da raiz: ${chave}`);
    }
    return completo;
  }

  async gravar(chave: string, origem: Readable | Buffer): Promise<number> {
    const destino = this.caminho(chave);
    await mkdir(dirname(destino), { recursive: true });

    if (Buffer.isBuffer(origem)) {
      const { writeFile } = await import('node:fs/promises');
      await writeFile(destino, origem);
      return origem.byteLength;
    }

    await pipeline(origem, createWriteStream(destino));
    const info = await stat(destino);
    return info.size;
  }

  async tamanho(chave: string): Promise<number | null> {
    try {
      const info = await stat(this.caminho(chave));
      return info.size;
    } catch {
      return null;
    }
  }

  async existe(chave: string): Promise<boolean> {
    return (await this.tamanho(chave)) !== null;
  }

  async remover(chave: string): Promise<void> {
    // `force` para não falhar quando o arquivo já não existe: remover
    // duas vezes é o caso normal quando uma limpeza roda em paralelo.
    await rm(this.caminho(chave), { force: true, recursive: true });
  }

  async mover(de: string, para: string): Promise<void> {
    const destino = this.caminho(para);
    await mkdir(dirname(destino), { recursive: true });
    await rename(this.caminho(de), destino);
  }

  /**
   * Junta os pedaços de um upload num arquivo só.
   *
   * Lê em ordem numérica, não alfabética: sem o `padStart` na chave, o
   * pedaço 10 viria antes do 2 e o vídeo sairia embaralhado. O
   * `padStart` garante as duas ordens iguais, e a ordenação numérica
   * aqui é o cinto de segurança.
   */
  async juntarPedacos(uploadId: string, destinoChave: string): Promise<number> {
    const pasta = this.caminho(`_tmp/${seguro(uploadId)}`);
    const nomes = (await readdir(pasta))
      .filter((n) => n.endsWith('.part'))
      .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));

    if (nomes.length === 0) {
      throw new Error('nenhum pedaço recebido para este upload');
    }

    const destino = this.caminho(destinoChave);
    await mkdir(dirname(destino), { recursive: true });

    const saida = createWriteStream(destino);
    const { createReadStream } = await import('node:fs');

    try {
      for (const nome of nomes) {
        await pipeline(createReadStream(join(pasta, nome)), saida, { end: false });
      }
    } finally {
      saida.end();
    }

    // Só depois de juntar com sucesso os pedaços deixam de ser
    // necessários. Removê-los antes tornaria a falha irrecuperável.
    await rm(pasta, { force: true, recursive: true });

    const info = await stat(destino);
    this.log.log(`upload ${uploadId} juntado: ${nomes.length} pedaços, ${info.size} bytes`);
    return info.size;
  }

  /** Quanto o workspace ocupa, em bytes. */
  async usoDoWorkspace(workspaceId: string): Promise<number> {
    return somaDaPasta(this.caminho(seguro(workspaceId)));
  }
}

/** Impede que um id malformado vire travessia de diretório. */
function seguro(valor: string): string {
  const limpo = valor.replace(/[^A-Za-z0-9_-]/g, '');
  if (!limpo) throw new Error('identificador inválido para storage');
  return limpo;
}

async function somaDaPasta(caminho: string): Promise<number> {
  let total = 0;
  try {
    for (const entrada of await readdir(caminho, { withFileTypes: true })) {
      const filho = join(caminho, entrada.name);
      total += entrada.isDirectory() ? await somaDaPasta(filho) : (await stat(filho)).size;
    }
  } catch {
    // Pasta que não existe ocupa zero — é o caso de workspace novo.
  }
  return total;
}
