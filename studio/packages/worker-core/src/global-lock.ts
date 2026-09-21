// ============================================================
// MAKUCHO STUDIO - Lock global de job pesado
//
// ADR 0003. A VPS e compartilhada com outras cinco aplicacoes de
// clientes. Este lock garante UM job pesado por vez em todo o stack.
//
// Por que um lock em Redis e nao `concurrency: 1` no BullMQ:
// concorrencia e por FILA. Tres workers com concorrencia 1 cada
// ainda dariam tres jobs simultaneos -- transcricao, render e
// processamento de midia disputando os mesmos 4 vCPUs ao mesmo
// tempo, com os apps vizinhos no meio.
// ============================================================

import type Redis from 'ioredis';

export interface OpcoesDoLock {
  /** Chave compartilhada pelas tres filas. */
  chave: string;
  /**
   * Validade do lock, em ms.
   *
   * Existe porque um worker morto (OOM, container reiniciado) nao
   * consegue liberar o que segurava. Sem TTL, o stack inteiro
   * travaria ate alguem intervir manualmente.
   */
  ttlMs: number;
  /** Quanto tempo esperar pela vez antes de desistir. */
  timeoutMs: number;
}

export const LOCK_PADRAO: OpcoesDoLock = {
  chave: 'studio:heavy-job-lock',
  // 30 min cobre o render mais longo previsto no piloto (video de 15
  // min). O heartbeat renova enquanto o job estiver vivo, entao o TTL
  // so entra em acao quando o processo morre de fato.
  ttlMs: 30 * 60 * 1000,
  // 20 min de espera: acima disso, e melhor devolver o job a fila do
  // que segurar um worker parado.
  timeoutMs: 20 * 60 * 1000,
};

export interface LockAdquirido {
  /** Identifica quem segura o lock. Impede liberar o lock alheio. */
  token: string;
  /** Renova o TTL enquanto o job avanca. */
  renovar(): Promise<boolean>;
  liberar(): Promise<void>;
}

/**
 * Libera o lock apenas se o token conferir.
 *
 * Em Lua porque precisa ser atomico: entre um GET e um DEL comuns, o
 * lock pode expirar e ser tomado por outro worker -- que teria o seu
 * lock apagado por um processo que ja nao o possui.
 */
const SCRIPT_LIBERAR = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

/** Renova o TTL, também só para o dono. */
const SCRIPT_RENOVAR = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], ARGV[2])
else
  return 0
end
`;

function gerarToken(): string {
  return `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Tenta adquirir o lock, esperando a vez.
 *
 * Devolve `null` no timeout: o chamador deve recolocar o job na fila
 * em vez de prosseguir sem o lock. Rodar sem ele anularia a protecao
 * que o ADR 0003 estabelece.
 */
export async function adquirirLock(
  redis: Redis,
  opcoes: OpcoesDoLock = LOCK_PADRAO,
  aoEsperar?: (tentativa: number) => void,
): Promise<LockAdquirido | null> {
  const token = gerarToken();
  const limite = Date.now() + opcoes.timeoutMs;
  let tentativa = 0;

  while (Date.now() < limite) {
    // NX: so grava se a chave nao existir. PX: expira sozinho.
    const resultado = await redis.set(opcoes.chave, token, 'PX', opcoes.ttlMs, 'NX');

    if (resultado === 'OK') {
      return {
        token,
        renovar: async () => {
          const r = await redis.eval(
            SCRIPT_RENOVAR,
            1,
            opcoes.chave,
            token,
            String(opcoes.ttlMs),
          );
          return r === 1;
        },
        liberar: async () => {
          await redis.eval(SCRIPT_LIBERAR, 1, opcoes.chave, token);
        },
      };
    }

    tentativa += 1;
    aoEsperar?.(tentativa);

    // Espera com jitter: sem ele, varios workers acordariam no mesmo
    // instante e disputariam a chave em sincronia.
    const espera = Math.min(5000, 500 * tentativa) + Math.random() * 500;
    await new Promise((r) => setTimeout(r, espera));
  }

  return null;
}

/**
 * Executa uma tarefa segurando o lock, renovando enquanto ela roda.
 *
 * O `finally` libera mesmo se a tarefa lancar: sem isso, um job que
 * falha deixaria o stack travado ate o TTL expirar -- ate 30 minutos
 * de fila parada por causa de um erro.
 */
export async function comLockGlobal<T>(
  redis: Redis,
  tarefa: (renovar: () => Promise<boolean>) => Promise<T>,
  opcoes: OpcoesDoLock = LOCK_PADRAO,
): Promise<T> {
  const lock = await adquirirLock(redis, opcoes);

  if (!lock) {
    throw new Error(
      `nao foi possivel obter o lock global em ${Math.round(opcoes.timeoutMs / 60000)} min; ` +
        'outro job pesado segue em execucao',
    );
  }

  // Renova a cada terco do TTL: frequente o bastante para nao expirar
  // durante o trabalho, espacado o bastante para nao martelar o Redis.
  const intervalo = setInterval(() => {
    void lock.renovar();
  }, Math.floor(opcoes.ttlMs / 3));

  try {
    return await tarefa(lock.renovar);
  } finally {
    clearInterval(intervalo);
    await lock.liberar();
  }
}

/** Ha um job pesado em andamento? Usado pelo painel de status. */
export async function lockOcupado(
  redis: Redis,
  chave: string = LOCK_PADRAO.chave,
): Promise<boolean> {
  return (await redis.exists(chave)) === 1;
}
