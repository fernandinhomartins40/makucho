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
import { detectarPlataforma } from '../plataforma';
import { nomeSeguro } from './opcoes';
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
  /** Monta no servidor (a fila de render) e traz o arquivo pronto: o caminho do iPhone. */
  iniciarNoServidor: (projectId: string, titulo: string, desligados: readonly string[]) => string;
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

/** iPhone ou iPad: o download por link não funciona no app instalado; o arquivo sai pelo Compartilhar. */
export function ehAparelhoApple(): boolean {
  if (typeof navigator === 'undefined') return false;
  const p = detectarPlataforma({ ua: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints ?? 0 });
  return p.sistema === 'ios' || p.sistema === 'ipados';
}

/** Os arquivos prontos, pela URL deles (o Compartilhar do iPhone precisa do arquivo, não do link). */
const arquivos = new Map<string, Blob>();

/** Guarda o vídeo pronto e devolve a URL dele. */
function guardar(blob: Blob): string {
  const url = URL.createObjectURL(blob);
  arquivos.set(url, blob);
  return url;
}

/** O vídeo pronto como arquivo, se este aparelho consegue entregá-lo a outro app. */
function arquivoParaCompartilhar(url: string, nome: string): File | null {
  const blob = arquivos.get(url);
  if (!blob || typeof navigator === 'undefined' || typeof navigator.share !== 'function') return null;
  const arquivo = new File([blob], nome, { type: blob.type || 'video/mp4' });
  if (navigator.canShare && !navigator.canShare({ files: [arquivo] })) return null;
  return arquivo;
}

/** Dá para abrir o Compartilhar do aparelho com este vídeo? */
export function podeCompartilhar(url: string, nome: string): boolean {
  return arquivoParaCompartilhar(url, nome) !== null;
}

/**
 * Abre o Compartilhar do aparelho com o vídeo: a pessoa escolhe o app
 * (Instagram, TikTok, WhatsApp...) e publica por lá, com a conta dela.
 * O Studio não posta em nome de ninguém nem guarda senha de rede.
 *
 * A legenda vai para a área de transferência, porque junto do arquivo o
 * texto se perde: cada app decide o que aproveita, e no iPhone mandar os
 * dois faz o Safari largar um deles. Só no Android o texto vai junto.
 *
 * Tem de ser chamada direto do toque, sem `await` antes: o iPhone
 * recusa o Compartilhar que não nasce de um gesto.
 */
export function compartilhar(url: string, nome: string, legenda = ''): boolean {
  const arquivo = arquivoParaCompartilhar(url, nome);
  if (!arquivo) return false;
  const texto = legenda.trim();
  if (texto) void navigator.clipboard?.writeText(texto).catch(() => undefined);
  const dados: ShareData = { files: [arquivo] };
  if (texto && !ehAparelhoApple()) dados.text = texto;
  void navigator.share(dados).catch(() => undefined);
  return true;
}

/**
 * Entrega o arquivo. No computador e no Android, o download vai para a
 * pasta; no iPhone/iPad, abre o Compartilhar do sistema ("Salvar vídeo"
 * vai para a galeria) -- o download por link não funciona no app
 * instalado. Precisa vir de um toque (o iPhone recusa o Compartilhar
 * sem ele).
 */
export function baixar(url: string, nome: string) {
  if (ehAparelhoApple() && compartilhar(url, nome)) return;
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Espera `ms`, ou para antes se a tarefa for cancelada. */
function esperar(ms: number, sinal: AbortSignal): Promise<void> {
  return new Promise((ok, falha) => {
    if (sinal.aborted) return falha(new DOMException('cancelada', 'AbortError'));
    const t = setTimeout(ok, ms);
    sinal.addEventListener('abort', () => {
      clearTimeout(t);
      falha(new DOMException('cancelada', 'AbortError'));
    }, { once: true });
  });
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
          const url = guardar(r.blob);
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
          // No iPhone o Compartilhar precisa de um toque: o botão "Salvar" aparece pronto.
          if (!ehAparelhoApple()) baixar(url, r.nomeDoArquivo);
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

    iniciarNoServidor(projectId, titulo, desligados) {
      const emAndamento = get().tarefas.find((t) => t.estado === 'rodando');
      if (emAndamento) return emAndamento.id;
      const id = `srv-${Date.now().toString(36)}`;
      const controlador = new AbortController();
      controladores.set(id, controlador);
      const iniciadaEm = Date.now();
      const progresso = (fracao: number, rotulo: string) => ({ etapa: 'video' as const, fracao, quadro: 0, totalDeQuadros: 0, restanteMs: null, rotulo });
      set((s) => ({
        tarefas: [
          ...s.tarefas.filter((t) => t.projectId !== projectId || t.estado === 'rodando'),
          { id, projectId, titulo, estado: 'rodando', iniciadaEm, progresso: progresso(0.02, 'Enviando para o servidor…') },
        ],
      }));
      const nome = `${nomeSeguro(titulo)}.mp4`;
      void (async () => {
        const { renders } = await import('../api');
        await renders.exportar(projectId, [...desligados]);
        // O servidor não diz quanto falta: a barra anda devagar até 90% e espera o "pronto".
        let duracaoMs = 0;
        for (;;) {
          const s = await renders.situacao(projectId);
          if (s.estado === 'pronto') {
            duracaoMs = s.duracaoMs ?? 0;
            break;
          }
          if (s.estado === 'falhou') throw new Error(s.erro || 'o servidor não conseguiu montar o vídeo.');
          const passou = Date.now() - iniciadaEm;
          atualizar(id, {
            progresso: s.estado === 'na_fila' ? progresso(0.05, 'Na fila do servidor…') : progresso(Math.min(0.9, 0.1 + 0.8 * (1 - Math.exp(-passou / 150_000))), 'Montando o vídeo no servidor…'),
          });
          await esperar(4000, controlador.signal);
        }
        atualizar(id, { progresso: progresso(0.95, 'Trazendo o vídeo pronto…') });
        const resposta = await fetch(renders.urlDeDownload(projectId), { credentials: 'include', signal: controlador.signal });
        if (!resposta.ok) throw new Error('o vídeo ficou pronto, mas não deu para trazê-lo. Tente de novo.');
        const blob = await resposta.blob();
        const url = guardar(blob);
        try {
          window.localStorage.setItem('studio:ja-exportou', '1');
        } catch {
          // Sem armazenamento local: o guia só não marca o passo.
        }
        atualizar(id, {
          estado: 'pronta',
          progresso: { etapa: 'finalizando', fracao: 1, quadro: 0, totalDeQuadros: 0, restanteMs: 0 },
          resultado: { url, nome, bytes: blob.size, duracaoMs, largura: 1080, altura: 1920, avisos: [], levouMs: Date.now() - iniciadaEm },
        });
        if (!ehAparelhoApple()) baixar(url, nome);
      })()
        .catch((e: unknown) => {
          const foiCancelada = e instanceof DOMException && e.name === 'AbortError';
          atualizar(id, {
            estado: foiCancelada ? 'cancelada' : 'erro',
            erro: foiCancelada ? undefined : e instanceof Error ? e.message : 'a exportação falhou.',
          });
        })
        .finally(() => controladores.delete(id));
      return id;
    },

    cancelar(id) {
      controladores.get(id)?.abort();
    },

    dispensar(id) {
      const t = get().tarefas.find((x) => x.id === id);
      if (t?.estado === 'rodando') return;
      if (t?.resultado) {
        URL.revokeObjectURL(t.resultado.url);
        arquivos.delete(t.resultado.url);
      }
      set((s) => ({ tarefas: s.tarefas.filter((x) => x.id !== id) }));
    },
  };
});
