// ============================================================
// Mídias da IA no editor: das escolhas às operações da timeline.
//
// Cada momento escolhido é importado (o servidor baixa da fonte e grava
// o asset com a licença) e vira as operações da composição
// (contracts/midias-da-ia.ts). Tudo entra numa versão só do plano: um
// Ctrl+Z desfaz a leva inteira.
//
// Também guarda a preferência "colocar sozinha ao montar com IA".
// ============================================================

import { operacoesDaComposicao } from '@makucho/studio-contracts';
import type { Composicao, MomentoVisual, ResultadoDaBusca, TimelineOperation } from '@makucho/studio-contracts';
import { bancoDeMidia } from './api';

export interface EscolhaDeMidia {
  momento: MomentoVisual;
  opcao: ResultadoDaBusca;
  composicao: Composicao;
}

/**
 * Importa as mídias escolhidas e devolve as operações. Uma que falha
 * (fonte fora do ar, arquivo grande demais) não derruba as outras: vira
 * falha na lista.
 */
export async function operacoesDasEscolhas(
  escolhas: readonly EscolhaDeMidia[],
  corDaMarca: string | undefined,
  aoProgredir?: (feitas: number, total: number) => void,
): Promise<{ ops: TimelineOperation[]; falhas: string[] }> {
  const ops: TimelineOperation[] = [];
  const falhas: string[] = [];
  for (const [i, e] of escolhas.entries()) {
    aoProgredir?.(i, escolhas.length);
    try {
      const importada = await bancoDeMidia.importar(e.opcao);
      // Tela cheia com título precisa de um título: o conceito, se a IA não deu.
      const texto = e.momento.texto ?? (e.composicao === 'tela_cheia_com_titulo' ? e.momento.conceito.replace(/^./, (l) => l.toUpperCase()) : undefined);
      ops.push(
        ...operacoesDaComposicao(
          { ...e.momento, composicao: e.composicao, ...(texto ? { texto } : {}) },
          {
            assetId: importada.id,
            kind: e.opcao.tipo === 'video' ? 'video' : 'image',
            largura: importada.largura ?? e.opcao.largura,
            altura: importada.altura ?? e.opcao.altura,
            transparente: importada.transparente || e.opcao.transparente,
          },
          { ...(corDaMarca ? { corDaMarca } : {}) },
        ),
      );
    } catch (erro) {
      falhas.push(`${e.momento.conceito}: ${erro instanceof Error ? erro.message : 'não foi possível trazer'}`);
    }
  }
  aoProgredir?.(escolhas.length, escolhas.length);
  return { ops, falhas };
}

const CHAVE_AUTOMATICO = 'studio:midias-automaticas';

/** "Ao montar com IA, colocar as mídias sugeridas sozinha." */
export function midiasAutomaticas(): boolean {
  try {
    return window.localStorage.getItem(CHAVE_AUTOMATICO) === '1';
  } catch {
    return false;
  }
}

export function definirMidiasAutomaticas(v: boolean): void {
  try {
    window.localStorage.setItem(CHAVE_AUTOMATICO, v ? '1' : '0');
  } catch {
    // Vale só nesta aba.
  }
}
