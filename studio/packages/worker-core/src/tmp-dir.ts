// ============================================================
// MAKUCHO STUDIO - Diretorio temporario por job
//
// ADR 0003: "quota de disco temporario por job, com limpeza
// garantida em finally, inclusive no cancelamento e na falha".
//
// O disco e compartilhado com outras cinco aplicacoes. Um job que
// falha no meio e deixa 2 GB de frames para tras nao derruba so o
// studio: derruba todo mundo na maquina quando o disco encher.
// ============================================================

import { mkdtemp, rm, stat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export interface EspacoDeTrabalho {
  /** Caminho do diretorio, exclusivo deste job. */
  caminho: string;
  /** Caminho de um arquivo dentro dele. */
  arquivo(nome: string): string;
  /** Bytes ocupados ate agora. */
  tamanho(): Promise<number>;
  /** Remove tudo. Chamado pelo `finally` de `comEspacoDeTrabalho`. */
  limpar(): Promise<void>;
}

/**
 * Nome de arquivo seguro.
 *
 * Nomes chegam de metadados do video e do que o usuario enviou. Sem
 * sanitizar, um "../../etc/cron.d/x" escreveria fora do diretorio do
 * job -- exatamente o que o plano proibe na secao 15 (path traversal).
 */
function nomeSeguro(nome: string): string {
  const limpo = nome
    .replace(/[/\\]/g, '_')
    .replace(/\.\./g, '_')
    // Byte nulo trunca o caminho em chamadas de sistema.
    .replace(/\0/g, '')
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .slice(0, 120);

  return limpo.length > 0 ? limpo : 'arquivo';
}

export async function criarEspacoDeTrabalho(
  prefixo = 'studio-job-',
  base: string = process.env.TMP_DIR ?? tmpdir(),
): Promise<EspacoDeTrabalho> {
  // mkdtemp gera um sufixo aleatorio: dois jobs simultaneos nunca
  // compartilham diretorio, mesmo com o mesmo prefixo.
  const caminho = await mkdtemp(join(base, prefixo));

  return {
    caminho,

    arquivo(nome: string): string {
      return join(caminho, nomeSeguro(nome));
    },

    async tamanho(): Promise<number> {
      let total = 0;
      const entradas = await readdir(caminho, { withFileTypes: true }).catch(() => []);

      for (const entrada of entradas) {
        const alvo = join(caminho, entrada.name);
        if (entrada.isDirectory()) {
          // Subdiretorio: soma recursiva. O render do Remotion cria
          // uma pasta de frames.
          const sub = await criarEspacoExistente(alvo).tamanho();
          total += sub;
        } else {
          const info = await stat(alvo).catch(() => null);
          if (info) total += info.size;
        }
      }

      return total;
    },

    async limpar(): Promise<void> {
      // force: nao falha se ja foi removido. O erro aqui nunca deve
      // mascarar o erro real do job.
      await rm(caminho, { recursive: true, force: true }).catch(() => undefined);
    },
  };
}

/** Envolve um diretorio que ja existe, para somar tamanho. */
function criarEspacoExistente(caminho: string): Pick<EspacoDeTrabalho, 'tamanho'> {
  return {
    async tamanho(): Promise<number> {
      let total = 0;
      const entradas = await readdir(caminho, { withFileTypes: true }).catch(() => []);
      for (const entrada of entradas) {
        const alvo = join(caminho, entrada.name);
        if (entrada.isDirectory()) {
          total += await criarEspacoExistente(alvo).tamanho();
        } else {
          const info = await stat(alvo).catch(() => null);
          if (info) total += info.size;
        }
      }
      return total;
    },
  };
}

/**
 * Teto de disco por job.
 *
 * O tmpfs do worker de render tem 3 GB (ver compose). Estourar nao
 * e erro de disco cheio: e sinal de video grande demais ou de um
 * loop gerando frames sem parar.
 */
export const LIMITE_TEMPORARIO_BYTES = 2.5 * 1024 * 1024 * 1024;

export class LimiteDeDiscoExcedido extends Error {
  constructor(usadoBytes: number, limiteBytes: number) {
    super(
      `o job usou ${(usadoBytes / 1024 ** 3).toFixed(2)} GB de temporario, ` +
        `acima do limite de ${(limiteBytes / 1024 ** 3).toFixed(1)} GB`,
    );
    this.name = 'LimiteDeDiscoExcedido';
  }
}

/**
 * Executa uma tarefa com diretorio temporario proprio.
 *
 * O `finally` limpa SEMPRE: sucesso, erro ou cancelamento. E a
 * garantia que o ADR 0003 exige -- sem ela, cada falha deixa lixo
 * que ninguem recolhe.
 */
export async function comEspacoDeTrabalho<T>(
  tarefa: (espaco: EspacoDeTrabalho) => Promise<T>,
  prefixo?: string,
): Promise<T> {
  const espaco = await criarEspacoDeTrabalho(prefixo);

  try {
    return await tarefa(espaco);
  } finally {
    await espaco.limpar();
  }
}

/**
 * Confere o teto de disco durante o job.
 *
 * Chamado entre etapas longas: descobrir o estouro no fim, com o
 * disco ja cheio, nao ajuda ninguem.
 */
export async function verificarLimite(
  espaco: EspacoDeTrabalho,
  limiteBytes = LIMITE_TEMPORARIO_BYTES,
): Promise<void> {
  const usado = await espaco.tamanho();
  if (usado > limiteBytes) {
    throw new LimiteDeDiscoExcedido(usado, limiteBytes);
  }
}

export { nomeSeguro };
