// ============================================================
// Exportações em andamento, fora de qualquer tela.
//
// A exportação roda no navegador e leva de segundos a minutos. Ela vive
// aqui (e não no componente do editor) para a pessoa poder fechar a
// janela de exportação, voltar a editar, ir para outra página do app --
// e acompanhar tudo no cartão de progresso da moldura. Fechar a ABA
// interrompe (o trabalho está no navegador): enquanto roda, o navegador
// pede confirmação antes de fechar.
// ============================================================

import { create } from 'zustand';
// Só os tipos: o exportador (mediabunny, compositor, libass) é carregado
// quando alguém exporta, e não no carregamento do editor.
import type { PedidoDeExportacao, ProgressoDaExportacao } from './exportador';

export type EstadoDaTarefa = 'rodando' | 'pronta' | 'erro' | 'cancelada';

export interface TarefaDeExportacao {
  id: string;
  projectId: string;
  titulo: string;
  estado: EstadoDaTarefa;
  progresso: ProgressoDaExportacao;
  iniciadaEm: number;
  resultado?: { url: string; nome: string; bytes: number; duracaoMs: number; largura: number; altura: number; avisos: string[]; levouMs: number };
  erro?: string;
}

interface Loja {
  tarefas: TarefaDeExportacao[];
  iniciar: (projectId: string, pedido: PedidoDeExportacao) => string;
  cancelar: (id: string) => void;
  dispensar: (id: string) => void;
}

const controladores = new Map<string, AbortController>();

function aoSair(e: BeforeUnloadEvent) {
  e.preventDefault();
  e.returnValue = '';
}

function vigiarSaida(rodando: boolean) {
  if (typeof window === 'undefined') return;
  window.removeEventListener('beforeunload', aoSair);
  if (rodando) window.addEventListener('beforeunload', aoSair);
}

/** Baixa o arquivo (o navegador salva na pasta de downloads). */
export function baixar(url: string, nome: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export const useExportacoes = create<Loja>((set, get) => {
  const atualizar = (id: string, mudanca: Partial<TarefaDeExportacao>) =>
    set((s) => ({ tarefas: s.tarefas.map((t) => (t.id === id ? { ...t, ...mudanca } : t)) }));

  return {
    tarefas: [],

    iniciar(projectId, pedido) {
      // Uma de cada vez: duas exportações dividiriam o codificador e a
      // placa de vídeo e as duas ficariam lentas.
      const emAndamento = get().tarefas.find((t) => t.estado === 'rodando');
      if (emAndamento) return emAndamento.id;

      const id = `exp-${Date.now().toString(36)}`;
      const controlador = new AbortController();
      controladores.set(id, controlador);
      const iniciadaEm = Date.now();
      set((s) => ({
        tarefas: [
          ...s.tarefas.filter((t) => t.projectId !== projectId || t.estado === 'rodando'),
          {
            id,
            projectId,
            titulo: pedido.titulo,
            estado: 'rodando',
            iniciadaEm,
            progresso: { etapa: 'preparando', fracao: 0, quadro: 0, totalDeQuadros: 0, restanteMs: null },
          },
        ],
      }));
      vigiarSaida(true);

      let ultimo = 0;
      void import('./exportador')
        .then(({ exportarNoNavegador }) =>
          exportarNoNavegador(
            pedido,
            (p) => {
              // No máximo ~8 atualizações por segundo na tela.
              const agora = performance.now();
              if (agora - ultimo < 120 && p.fracao < 0.99) return;
              ultimo = agora;
              atualizar(id, { progresso: p });
            },
            controlador.signal,
          ),
        )
        .then((r) => {
          const url = URL.createObjectURL(r.blob);
          // O guia "Comece por aqui" marca o último passo (exportar).
          try {
            window.localStorage.setItem('studio:ja-exportou', '1');
          } catch {
            // Sem armazenamento local: o guia só não marca o passo.
          }
          atualizar(id, {
            estado: 'pronta',
            progresso: { etapa: 'finalizando', fracao: 1, quadro: 0, totalDeQuadros: 0, restanteMs: 0 },
            resultado: {
              url,
              nome: r.nomeDoArquivo,
              bytes: r.bytes,
              duracaoMs: r.duracaoMs,
              largura: r.largura,
              altura: r.altura,
              avisos: r.avisos,
              levouMs: Date.now() - iniciadaEm,
            },
          });
          baixar(url, r.nomeDoArquivo);
        })
        .catch((e: unknown) => {
          const foiCancelada = e instanceof DOMException && e.name === 'AbortError';
          if (!foiCancelada) console.error('[exportação]', e);
          atualizar(id, {
            estado: foiCancelada ? 'cancelada' : 'erro',
            erro: foiCancelada ? undefined : e instanceof Error ? e.message : 'a exportação falhou.',
          });
        })
        .finally(() => {
          controladores.delete(id);
          vigiarSaida(get().tarefas.some((t) => t.estado === 'rodando'));
        });
      return id;
    },

    cancelar(id) {
      controladores.get(id)?.abort();
    },

    dispensar(id) {
      const t = get().tarefas.find((x) => x.id === id);
      if (t?.estado === 'rodando') return;
      if (t?.resultado) URL.revokeObjectURL(t.resultado.url);
      set((s) => ({ tarefas: s.tarefas.filter((x) => x.id !== id) }));
    },
  };
});
