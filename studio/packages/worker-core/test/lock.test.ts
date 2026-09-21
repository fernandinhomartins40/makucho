import { adquirirLock, comLockGlobal, lockOcupado, LOCK_PADRAO } from '../src/global-lock';

// O pacote compila para CommonJS e o esbuild recusa top-level await
// nesse formato; por isso o corpo do teste vive numa funcao.
async function main() {

  let ok = 0, fail = 0;
  const t = (nome: string, cond: boolean) => {
    cond ? ok++ : fail++;
    console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
  };

  /**
   * Redis simulado com o comportamento que o lock depende:
   * SET NX (so grava se nao existir), PX (expiracao) e EVAL dos dois
   * scripts Lua.
   */
  class RedisFake {
    private dados = new Map<string, { valor: string; expiraEm: number }>();

    private vivo(chave: string): boolean {
      const item = this.dados.get(chave);
      if (!item) return false;
      if (Date.now() >= item.expiraEm) {
        this.dados.delete(chave);
        return false;
      }
      return true;
    }

    async set(
      chave: string,
      valor: string,
      _px: 'PX',
      ttlMs: number,
      _nx: 'NX',
    ): Promise<'OK' | null> {
      if (this.vivo(chave)) return null;
      this.dados.set(chave, { valor, expiraEm: Date.now() + ttlMs });
      return 'OK';
    }

    async exists(chave: string): Promise<number> {
      return this.vivo(chave) ? 1 : 0;
    }

    async eval(script: string, _n: number, chave: string, token: string, ttl?: string) {
      const item = this.dados.get(chave);
      if (!item || item.valor !== token) return 0;

      if (script.includes('del')) {
        this.dados.delete(chave);
        return 1;
      }
      if (script.includes('pexpire') && ttl) {
        item.expiraEm = Date.now() + Number(ttl);
        return 1;
      }
      return 0;
    }

    /** Simula um worker morto que nao liberou o lock. */
    forcarLock(chave: string, ttlMs: number) {
      this.dados.set(chave, { valor: 'outro-worker', expiraEm: Date.now() + ttlMs });
    }
  }

  const redis = () => new RedisFake() as unknown as import('ioredis').default;

  // ============================================================
  // Aquisição
  // ============================================================

  const r1 = redis();
  const lock1 = await adquirirLock(r1);
  t('adquire o lock quando livre', lock1 !== null);
  t('o lock tem token proprio', (lock1?.token.length ?? 0) > 10);
  t('o lock aparece como ocupado', await lockOcupado(r1));

  // ============================================================
  // Exclusão mútua — o ponto do ADR 0003
  // ============================================================

  // Tres workers com concurrency 1 cada ainda dariam tres jobs
  // simultaneos. Por isso o lock e global, e nao por fila.
  const r2 = redis();
  const primeiro = await adquirirLock(r2);
  const segundo = await adquirirLock(r2, { ...LOCK_PADRAO, timeoutMs: 300 });

  t('o primeiro worker adquire', primeiro !== null);
  t('o segundo NAO adquire enquanto o primeiro segura', segundo === null);

  // Liberado, o proximo entra.
  await primeiro?.liberar();
  const terceiro = await adquirirLock(r2, { ...LOCK_PADRAO, timeoutMs: 300 });
  t('apos liberar, outro worker adquire', terceiro !== null);
  await terceiro?.liberar();

  // ============================================================
  // Token: ninguém libera o lock alheio
  // ============================================================

  const r3 = redis();
  const meu = await adquirirLock(r3);

  // Um worker que perdeu o lock por expiracao nao pode apagar o do
  // sucessor ao terminar.
  await (r3 as unknown as RedisFake).eval(
    'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end',
    1,
    LOCK_PADRAO.chave,
    'token-de-outro',
  );
  t('token errado nao libera o lock', await lockOcupado(r3));
  await meu?.liberar();
  t('token correto libera', !(await lockOcupado(r3)));

  // ============================================================
  // TTL: worker morto não trava o stack
  // ============================================================

  const r4 = redis();
  // Um container morto por OOM nao libera o que segurava.
  (r4 as unknown as RedisFake).forcarLock(LOCK_PADRAO.chave, 200);

  t('lock de worker morto bloqueia enquanto vale',
    (await adquirirLock(r4, { ...LOCK_PADRAO, timeoutMs: 50 })) === null);

  await new Promise((r) => setTimeout(r, 260));

  // Sem TTL, o stack inteiro ficaria travado ate alguem intervir.
  const apos = await adquirirLock(r4, { ...LOCK_PADRAO, timeoutMs: 300 });
  t('apos o TTL expirar, o proximo entra', apos !== null);
  await apos?.liberar();

  // ============================================================
  // Renovação
  // ============================================================

  const r5 = redis();
  const longo = await adquirirLock(r5, { ...LOCK_PADRAO, ttlMs: 300 });
  await new Promise((r) => setTimeout(r, 150));
  t('renova o TTL enquanto o job roda', (await longo?.renovar()) === true);
  await new Promise((r) => setTimeout(r, 200));
  // Sem a renovacao, teria expirado aos 300ms.
  t('o lock sobrevive alem do TTL original', await lockOcupado(r5));
  await longo?.liberar();

  // ============================================================
  // comLockGlobal: libera mesmo com erro
  // ============================================================

  const r6 = redis();
  const valor = await comLockGlobal(r6, async () => 42);
  t('devolve o resultado da tarefa', valor === 42);
  t('libera ao terminar', !(await lockOcupado(r6)));

  // Um job que falha nao pode deixar o stack travado ate o TTL -- seriam
  // ate 30 min de fila parada por causa de um erro.
  let lancou = false;
  try {
    await comLockGlobal(r6, async () => {
      throw new Error('falha no render');
    });
  } catch {
    lancou = true;
  }
  t('propaga o erro da tarefa', lancou);
  t('libera o lock mesmo com erro', !(await lockOcupado(r6)));

  // ============================================================
  // Timeout de espera
  // ============================================================

  const r7 = redis();
  (r7 as unknown as RedisFake).forcarLock(LOCK_PADRAO.chave, 60_000);

  let erroDeEspera = '';
  try {
    await comLockGlobal(r7, async () => 1, { ...LOCK_PADRAO, timeoutMs: 200 });
  } catch (e) {
    erroDeEspera = (e as Error).message;
  }

  t('falha quando nao consegue a vez', erroDeEspera.includes('lock global'));
  t('a mensagem explica o motivo', erroDeEspera.includes('outro job pesado'));
  console.log(`\n${ok} ok, ${fail} falha(s)`);
  if (fail > 0) process.exit(1);

}

void main();
