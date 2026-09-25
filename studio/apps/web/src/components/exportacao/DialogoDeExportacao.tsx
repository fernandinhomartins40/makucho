'use client';

// ============================================================
// Janela de exportação: opções antes, progresso durante, arquivo depois.
//
// Antes: o que vai sair (duração, tamanho do quadro, tamanho estimado
// do arquivo) e o que dá para escolher, com o recomendado já marcado --
// quem não quer pensar só clica em "Exportar".
// Durante: barra, etapa em palavras, quadro X de Y e tempo restante. A
// janela pode ser fechada: a exportação continua e o cartão no canto da
// tela acompanha.
// Depois: baixar de novo, avisos e "exportar outra vez".
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import type { EditPlanV1 } from '@makucho/studio-contracts';
import { agendaDoPlano } from '@makucho/studio-contracts';
import {
  OPCOES_PADRAO,
  QUALIDADES,
  RESOLUCOES,
  formatarBytes,
  formatarDuracao,
  nomeSeguro,
  tamanhoDoQuadro,
  tamanhoEstimado,
  faltaNoNavegador,
  type OpcoesDeExportacao,
} from '../../lib/exportacao/opcoes';
import { baixar, useExportacoes, type TarefaDeExportacao } from '../../lib/exportacao/tarefas';
import { IconeAviso, IconeCheck, IconeExportar, IconeFechar } from '../icones';

const CHAVE = 'studio:opcoes-de-exportacao';

interface Props {
  aberto: boolean;
  aoFechar: () => void;
  projectId: string;
  titulo: string;
  plano: EditPlanV1;
  desligados: ReadonlySet<string>;
  /** Monta o pedido completo e começa (quem sabe das URLs e da transcrição é o editor). */
  aoExportar: (opcoes: OpcoesDeExportacao) => void;
}

export const ROTULO_DA_ETAPA: Record<string, string> = {
  preparando: 'Preparando os arquivos',
  audio: 'Mixando o áudio',
  video: 'Montando os quadros do vídeo',
  finalizando: 'Finalizando o arquivo',
};

export function DialogoDeExportacao({ aberto, aoFechar, projectId, titulo, plano, desligados, aoExportar }: Props) {
  const tarefa = useExportacoes((s) => [...s.tarefas].reverse().find((t) => t.projectId === projectId));
  const outraRodando = useExportacoes((s) => s.tarefas.some((t) => t.estado === 'rodando' && t.projectId !== projectId));
  const [configurando, setConfigurando] = useState(true);
  const [opcoes, setOpcoes] = useState<OpcoesDeExportacao>(() => {
    let salvas: Partial<OpcoesDeExportacao> = {};
    try {
      salvas = JSON.parse(localStorage.getItem(CHAVE) ?? '{}');
    } catch {
      // Sem armazenamento: os padrões.
    }
    return { ...OPCOES_PADRAO, ...salvas, nomeDoArquivo: nomeSeguro(titulo) };
  });

  useEffect(() => {
    if (!aberto) return;
    // Reabrir durante (ou depois de) uma exportação mostra o andamento.
    setConfigurando(!tarefa || tarefa.estado === 'cancelada');
    setOpcoes((o) => ({ ...o, nomeDoArquivo: nomeSeguro(titulo) }));
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar();
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  const duracaoMs = useMemo(() => agendaDoPlano(plano, [...desligados]).duracaoMs, [plano, desligados]);
  const vinhetasMs = (plano.intro?.durationMs ?? 0) + (plano.outro?.durationMs ?? 0);
  const totalMs = duracaoMs + (opcoes.vinhetas ? vinhetasMs : 0);
  const quadro = tamanhoDoQuadro(plano.canvas, opcoes.resolucao);
  const falta = useMemo(() => (aberto ? faltaNoNavegador() : null), [aberto]);

  if (!aberto) return null;

  const mudar = (m: Partial<OpcoesDeExportacao>) => setOpcoes((o) => ({ ...o, ...m }));
  const exportar = () => {
    try {
      const { nomeDoArquivo: _n, ...lembrar } = opcoes;
      localStorage.setItem(CHAVE, JSON.stringify(lembrar));
    } catch {
      // Sem armazenamento, sem memória das opções.
    }
    setConfigurando(false);
    aoExportar(opcoes);
  };

  return (
    <div className="exportar" onClick={aoFechar}>
      <div className="exportar__caixa" role="dialog" aria-modal="true" aria-labelledby="exportar-titulo" onClick={(e) => e.stopPropagation()}>
        <header className="exportar__topo">
          <div>
            <h2 id="exportar-titulo">Exportar vídeo</h2>
            <p>O vídeo é montado aqui mesmo, no seu computador: mais rápido e sem fila.</p>
          </div>
          <button type="button" className="botao-icone" aria-label="Fechar" onClick={aoFechar}>
            <IconeFechar size={20} />
          </button>
        </header>

        {configurando || !tarefa || tarefa.estado === 'cancelada' ? (
          <>
            <div className="exportar__resumo">
              <span>
                <strong>{formatarDuracao(totalMs)}</strong>duração
              </span>
              <span>
                <strong>
                  {quadro.largura}×{quadro.altura}
                </strong>
                quadro
              </span>
              <span>
                <strong>~{formatarBytes(tamanhoEstimado(opcoes, plano.canvas, totalMs))}</strong>arquivo MP4
              </span>
            </div>

            <div className="exportar__corpo">
              <fieldset className="exportar__grupo">
                <legend>Resolução</legend>
                <div className="exportar__opcoes">
                  {RESOLUCOES.map((r) => (
                    <label key={r.id} className="exportar__opcao" data-marcada={opcoes.resolucao === r.id || undefined}>
                      <input type="radio" name="resolucao" checked={opcoes.resolucao === r.id} onChange={() => mudar({ resolucao: r.id })} />
                      <strong>{r.rotulo}</strong>
                      <span>{r.ajuda}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset className="exportar__grupo">
                <legend>Qualidade</legend>
                <div className="exportar__opcoes">
                  {QUALIDADES.map((q) => (
                    <label key={q.id} className="exportar__opcao" data-marcada={opcoes.qualidade === q.id || undefined}>
                      <input type="radio" name="qualidade" checked={opcoes.qualidade === q.id} onChange={() => mudar({ qualidade: q.id })} />
                      <strong>{q.rotulo}</strong>
                      <span>{q.ajuda}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset className="exportar__grupo exportar__grupo--linha">
                <legend>Quadros por segundo</legend>
                <div className="exportar__segmentos" role="radiogroup" aria-label="Quadros por segundo">
                  {([30, 60] as const).map((f) => (
                    <button key={f} type="button" role="radio" aria-checked={opcoes.fps === f} onClick={() => mudar({ fps: f })}>
                      {f} fps
                    </button>
                  ))}
                </div>
                <span className="exportar__ajuda">{opcoes.fps === 60 ? 'Movimento mais liso; exporta mais devagar.' : 'O padrão das redes.'}</span>
              </fieldset>

              <fieldset className="exportar__grupo">
                <legend>O que entra</legend>
                <label className="exportar__marcar">
                  <input type="checkbox" checked={opcoes.legendas} onChange={(e) => mudar({ legendas: e.target.checked })} />
                  Legendas da fala
                </label>
                {vinhetasMs > 0 && (
                  <label className="exportar__marcar">
                    <input type="checkbox" checked={opcoes.vinhetas} onChange={(e) => mudar({ vinhetas: e.target.checked })} />
                    Vinhetas da marca ({formatarDuracao(vinhetasMs)})
                  </label>
                )}
                <label className="exportar__marcar">
                  <input type="checkbox" checked={opcoes.fonte === 'original'} onChange={(e) => mudar({ fonte: e.target.checked ? 'original' : 'rapida' })} />
                  Usar o arquivo original (máxima nitidez)
                </label>
                {opcoes.fonte !== 'original' && <span className="exportar__ajuda">Mais rápido, mas a imagem sai da versão de edição (720p).</span>}
              </fieldset>

              <label className="exportar__grupo exportar__nome">
                <span>Nome do arquivo</span>
                <span className="exportar__nome-campo">
                  <input
                    className="campo__entrada"
                    value={opcoes.nomeDoArquivo}
                    maxLength={60}
                    onChange={(e) => mudar({ nomeDoArquivo: nomeSeguro(e.target.value) || e.target.value })}
                  />
                  <span>.mp4</span>
                </span>
              </label>
            </div>

            {falta && (
              <p className="exportar__alerta">
                <IconeAviso size={15} /> Não dá para exportar neste navegador: {falta}
              </p>
            )}
            {outraRodando && (
              <p className="exportar__alerta">
                <IconeAviso size={15} /> Outro vídeo está sendo exportado. Espere ele terminar para começar este.
              </p>
            )}

            <footer className="exportar__rodape">
              <span className="exportar__ajuda">Você pode continuar editando enquanto exporta. Não feche esta aba até terminar.</span>
              <button type="button" className="botao botao--primario" disabled={Boolean(falta) || outraRodando || duracaoMs <= 0} onClick={exportar}>
                <IconeExportar size={16} />
                Exportar
              </button>
            </footer>
          </>
        ) : (
          <Andamento tarefa={tarefa} aoFechar={aoFechar} aoRefazer={() => setConfigurando(true)} />
        )}
      </div>
    </div>
  );
}

function Andamento({ tarefa, aoFechar, aoRefazer }: { tarefa: TarefaDeExportacao; aoFechar: () => void; aoRefazer: () => void }) {
  const cancelar = useExportacoes((s) => s.cancelar);
  const pct = Math.round(Math.min(1, tarefa.progresso.fracao) * 100);
  const p = tarefa.progresso;

  if (tarefa.estado === 'pronta' && tarefa.resultado) {
    const r = tarefa.resultado;
    return (
      <div className="exportar__andamento">
        <span className="exportar__icone exportar__icone--ok" aria-hidden>
          <IconeCheck size={28} />
        </span>
        <h3>Vídeo pronto</h3>
        <p className="exportar__ajuda">
          {r.largura}×{r.altura} · {formatarDuracao(r.duracaoMs)} · {formatarBytes(r.bytes)} · exportado em {formatarDuracao(r.levouMs)}. O download começou
          sozinho; se não começou, use o botão.
        </p>
        {r.avisos.map((a) => (
          <p key={a} className="exportar__alerta">
            <IconeAviso size={15} /> {a}
          </p>
        ))}
        <div className="exportar__botoes">
          <button type="button" className="botao botao--primario" onClick={() => baixar(r.url, r.nome)}>
            <IconeExportar size={16} /> Baixar de novo
          </button>
          <button type="button" className="botao botao--secundario" onClick={aoRefazer}>
            Exportar com outras opções
          </button>
          <button type="button" className="botao botao--fantasma" onClick={aoFechar}>
            Fechar
          </button>
        </div>
      </div>
    );
  }

  if (tarefa.estado === 'erro') {
    return (
      <div className="exportar__andamento">
        <span className="exportar__icone exportar__icone--erro" aria-hidden>
          <IconeAviso size={28} />
        </span>
        <h3>A exportação não terminou</h3>
        <p className="exportar__ajuda">{tarefa.erro}</p>
        <div className="exportar__botoes">
          <button type="button" className="botao botao--primario" onClick={aoRefazer}>
            Tentar de novo
          </button>
          <button type="button" className="botao botao--fantasma" onClick={aoFechar}>
            Fechar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="exportar__andamento" aria-live="polite">
      <div className="exportar__porcento">{pct}%</div>
      <div className="exportar__barra" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Progresso da exportação">
        <span style={{ width: `${pct}%` }} />
      </div>
      <p className="exportar__etapa">{ROTULO_DA_ETAPA[p.etapa] ?? 'Exportando'}</p>
      <p className="exportar__ajuda">
        {p.etapa === 'video' && p.totalDeQuadros > 0 ? `Quadro ${p.quadro} de ${p.totalDeQuadros}` : 'Isso leva alguns segundos'}
        {p.restanteMs !== null && p.restanteMs > 0 ? ` · faltam ~${formatarDuracao(p.restanteMs)}` : ''}
      </p>
      <p className="exportar__ajuda">Pode fechar esta janela e continuar editando: o progresso fica no canto da tela.</p>
      <div className="exportar__botoes">
        <button type="button" className="botao botao--primario" onClick={aoFechar}>
          Continuar editando
        </button>
        <button type="button" className="botao botao--fantasma" onClick={() => cancelar(tarefa.id)}>
          Cancelar exportação
        </button>
      </div>
    </div>
  );
}
