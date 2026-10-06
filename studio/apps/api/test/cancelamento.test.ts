// ============================================================
// Projeto excluído: a IA para na hora.
//
// A chamada em andamento é abortada, e a próxima chamada do mesmo projeto
// (de quem ainda está num laço) é recusada sem ir ao provedor.
// ============================================================

process.env.STUDIO_SEM_CACHE_REDIS = '1';

import { cancelarProjeto, projetoFoiExcluido, sinalDoProjeto } from '../src/common/cancelamento';
import { AiService } from '../src/modules/ai/ai.service';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

async function main() {
  // O registro.
  const s = sinalDoProjeto('p1');
  t('o sinal começa ativo', !s.sinal.aborted && !projetoFoiExcluido('p1'));
  t('excluir aborta a chamada em andamento', cancelarProjeto('p1') === 1 && s.sinal.aborted && projetoFoiExcluido('p1'));
  let recusou = false;
  try {
    sinalDoProjeto('p1');
  } catch {
    recusou = true;
  }
  t('a próxima chamada do projeto excluído é recusada', recusou);
  s.soltar();

  // O serviço de IA: o provedor recebe o sinal; a exclusão no meio aborta.
  let chamadasAoProvedor = 0;
  const provedor = {
    conversar: (p: { sinal?: AbortSignal }) => {
      chamadasAoProvedor += 1;
      return new Promise((_ok, falha) => p.sinal?.addEventListener('abort', () => falha(Object.assign(new Error('abortado'), { name: 'AbortError' }))));
    },
  };
  const ai = new AiService({ aiCredential: { updateMany: async () => ({}) } } as never, {} as never, { conferirAntes: async () => ({}), registrar: async () => 0 } as never);
  (ai as unknown as { provedorDe: () => Promise<unknown> }).provedorDe = async () => provedor;
  const pedido = { workspaceId: 'w', projectId: 'p2', chamada: 'desenhar_animacao' as const, sistema: 's', usuario: 'u', maxTokens: 10, promptVersion: 'v', semCache: true };
  const emAndamento = ai.chamar(pedido).then(
    () => 'respondeu',
    (e: Error) => e.name,
  );
  await new Promise((r) => setTimeout(r, 20));
  cancelarProjeto('p2');
  t('excluir no meio: a chamada de IA para com "projeto excluído"', (await emAndamento) === 'ProjetoExcluido');
  const depois = await ai.chamar(pedido).then(
    () => 'respondeu',
    (e: Error) => e.name,
  );
  t('a seguinte nem chega ao provedor', depois === 'ProjetoExcluido' && chamadasAoProvedor === 1);

  console.log(`\n${ok} ok, ${fail} falha(s)`);
  if (fail) process.exit(1);
}

void main();
