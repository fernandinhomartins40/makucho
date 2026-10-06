// ============================================================
// Projeto excluído: a IA para na hora.
//
// Excluir o projeto tirava das filas só o que ainda não tinha começado. A
// análise e as animações que já rodavam (as etapas caras) seguiam até o
// fim chamando a IA -- pagando por um vídeo que ninguém ia ver.
//
// Aqui fica o que a API sabe dos projetos excluídos: as chamadas de IA em
// andamento de cada projeto (para abortar) e a lista dos excluídos (para
// recusar, sem custo, a próxima chamada de quem ainda está no meio de um
// laço). Em memória: a API roda numa instância só, e um reinício já mata
// o que estava em andamento.
// ============================================================

/** Por quanto tempo um projeto excluído é lembrado (os laços terminam bem antes). */
const LEMBRAR_POR_MS = 2 * 60 * 60_000;

const excluidos = new Map<string, number>();
const emAndamento = new Map<string, Set<AbortController>>();

export class ProjetoExcluido extends Error {
  constructor(readonly projectId: string) {
    super(`projeto ${projectId} excluído: a IA parou`);
    this.name = 'ProjetoExcluido';
  }
}

/** Marca o projeto como excluído e aborta as chamadas de IA dele em andamento. */
export function cancelarProjeto(projectId: string): number {
  excluidos.set(projectId, Date.now());
  const agora = Date.now();
  for (const [id, em] of excluidos) if (agora - em > LEMBRAR_POR_MS) excluidos.delete(id);
  const controles = emAndamento.get(projectId);
  emAndamento.delete(projectId);
  controles?.forEach((c) => c.abort(new ProjetoExcluido(projectId)));
  return controles?.size ?? 0;
}

export function projetoFoiExcluido(projectId: string | undefined | null): boolean {
  return !!projectId && excluidos.has(projectId);
}

/**
 * Um sinal de aborto para uma chamada de IA do projeto (somado ao de quem
 * chamou). `soltar` ao terminar. Projeto já excluído: lança na hora.
 */
export function sinalDoProjeto(projectId: string, sinal?: AbortSignal): { sinal: AbortSignal; soltar: () => void } {
  if (projetoFoiExcluido(projectId)) throw new ProjetoExcluido(projectId);
  const controle = new AbortController();
  const conjunto = emAndamento.get(projectId) ?? new Set<AbortController>();
  conjunto.add(controle);
  emAndamento.set(projectId, conjunto);
  return {
    sinal: sinal ? AbortSignal.any([sinal, controle.signal]) : controle.signal,
    soltar: () => {
      conjunto.delete(controle);
      if (!conjunto.size && emAndamento.get(projectId) === conjunto) emAndamento.delete(projectId);
    },
  };
}
