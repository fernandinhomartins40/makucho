'use client';

// ============================================================
// Cartão de progresso no canto da tela, em qualquer página do app.
//
// É o que deixa continuar usando o Studio enquanto um vídeo é
// exportado: a janela de exportação pode ser fechada, e aqui ficam a
// barra, o tempo restante, o cancelar e, no fim, o botão de baixar.
// ============================================================

import { formatarBytes, formatarDuracao } from '../../lib/exportacao/opcoes';
import { baixar, useExportacoes } from '../../lib/exportacao/tarefas';
import { ROTULO_DA_ETAPA } from './DialogoDeExportacao';
import { IconeAviso, IconeCheck, IconeExportar, IconeFechar } from '../icones';

export function ExportacoesEmAndamento() {
  const tarefas = useExportacoes((s) => s.tarefas);
  const cancelar = useExportacoes((s) => s.cancelar);
  const dispensar = useExportacoes((s) => s.dispensar);
  const visiveis = tarefas.filter((t) => t.estado !== 'cancelada');
  if (!visiveis.length) return null;

  return (
    <div className="exportacoes" aria-live="polite">
      {visiveis.map((t) => {
        const pct = Math.round(Math.min(1, t.progresso.fracao) * 100);
        return (
          <div key={t.id} className="exportacao" data-estado={t.estado}>
            <div className="exportacao__topo">
              <span className="exportacao__icone" aria-hidden>
                {t.estado === 'pronta' ? <IconeCheck size={16} /> : t.estado === 'erro' ? <IconeAviso size={16} /> : <IconeExportar size={16} />}
              </span>
              <span className="exportacao__titulo" title={t.titulo}>
                {t.estado === 'pronta' ? 'Vídeo pronto' : t.estado === 'erro' ? 'Exportação falhou' : `Exportando… ${pct}%`}
                <small>{t.titulo}</small>
              </span>
              {t.estado !== 'rodando' && (
                <button type="button" className="botao-icone botao-icone--pequeno" aria-label="Dispensar" onClick={() => dispensar(t.id)}>
                  <IconeFechar size={14} />
                </button>
              )}
            </div>
            {t.estado === 'rodando' && (
              <>
                <div className="exportar__barra exportar__barra--fina">
                  <span style={{ width: `${pct}%` }} />
                </div>
                <div className="exportacao__rodape">
                  <span>
                    {ROTULO_DA_ETAPA[t.progresso.etapa]}
                    {t.progresso.restanteMs ? ` · ~${formatarDuracao(t.progresso.restanteMs)}` : ''}
                  </span>
                  <button type="button" className="exportacao__cancelar" onClick={() => cancelar(t.id)}>
                    Cancelar
                  </button>
                </div>
              </>
            )}
            {t.estado === 'pronta' && t.resultado && (
              <div className="exportacao__rodape">
                <span>{formatarBytes(t.resultado.bytes)}</span>
                <button type="button" className="botao botao--primario botao--pequeno" onClick={() => baixar(t.resultado!.url, t.resultado!.nome)}>
                  Baixar
                </button>
              </div>
            )}
            {t.estado === 'erro' && <p className="exportacao__erro">{t.erro}</p>}
          </div>
        );
      })}
    </div>
  );
}
