'use client';

// ============================================================
// Painel de legendas — a correção manual da transcrição.
//
// O problema que ele resolve: o whisper erra nome próprio, jargão e
// sigla. "Makucho" sai "macucho", "CNPJ" sai "cinpege". Sem correção,
// o erro vai QUEIMADO no arquivo exportado — e queimado significa sem
// recurso, porque não há faixa de legenda para desligar depois.
//
// DUAS DECISÕES QUE DEFINEM ESTA TELA
//
// 1. Corrige-se PALAVRA, não bloco nem tempo. A correção guarda o id
//    da `TranscriptWord`, e o tempo vem da própria palavra. Por isso
//    ninguém digita tempo aqui: a legenda fica no frame certo porque
//    a palavra sabe onde está, e continua certa depois de um ajuste
//    de corte que mova a fala.
//
// 2. Mostra-se a FRASE, não a palavra isolada. É o contexto que
//    revela que "macucho" era "Makucho" — uma lista de palavras soltas
//    faria a pessoa corrigir no escuro. As palavras aparecem
//    agrupadas por segmento da transcrição, como foram faladas.
// ============================================================

import { useMemo, useState } from 'react';
import type { EditPlanV1, TimelineOperation } from '@makucho/studio-contracts';
import type { Transcricao } from '../../lib/api';
import { tempo } from './funcoes';
import { IconeAviso, IconeCheck, IconeVoltar } from '../icones';

/**
 * Abaixo disso, o whisper está pouco seguro do que ouviu.
 *
 * Não é aviso de erro: é onde olhar primeiro. Pedir revisão de todas
 * as palavras seria pedir que a pessoa refizesse a transcrição à mão,
 * o que anula o valor de ter uma.
 */
const CONFIANCA_BAIXA = 0.6;

interface Props {
  plano: EditPlanV1;
  transcricao: Transcricao | null;
  carregando: boolean;
  onOperacao: (operacao: TimelineOperation) => void;
}

export function PainelDeLegendas({ plano, transcricao, carregando, onOperacao }: Props) {
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState('');

  const correcoes = useMemo(
    () => new Map(plano.captions.corrections.map((c) => [c.wordId, c])),
    [plano.captions.corrections],
  );

  // Somente as palavras que de fato entram no vídeo. Corrigir a
  // legenda de uma fala que foi cortada é trabalho que não aparece no
  // resultado — e listar tudo esconderia o que importa no meio do que
  // ficou de fora.
  const trechos = useMemo(
    () =>
      plano.clips.map((c) => ({
        inicio: c.sourceStartMs,
        fim: c.sourceEndMs,
      })),
    [plano.clips],
  );

  const entraNoVideo = (startMs: number, endMs: number) =>
    trechos.some((t) => startMs >= t.inicio && endMs <= t.fim);

  if (carregando) {
    return (
      <p className="texto-secundario" style={{ fontSize: 13, padding: 'var(--e4)' }}>
        Carregando a transcrição…
      </p>
    );
  }

  if (!transcricao?.existe) {
    return (
      <div style={{ padding: 'var(--e4)' }}>
        <p className="texto-secundario" style={{ fontSize: 13, lineHeight: 1.5 }}>
          A transcrição ainda não está pronta. Ela é gerada depois do envio do vídeo,
          e é dela que as legendas saem.
        </p>
      </div>
    );
  }

  const abrir = (wordId: string, textoAtual: string) => {
    setEditando(wordId);
    setRascunho(textoAtual);
  };

  const salvar = (wordId: string, original: string) => {
    const texto = rascunho.trim();
    setEditando(null);

    // Texto vazio ou igual ao que já está na tela não é correção. Sem
    // esta guarda, o contrato recusaria e a tela mostraria um erro
    // para quem só apertou Enter sem mudar nada.
    if (!texto) return;

    const jaExibido = correcoes.get(wordId)?.text ?? original;
    if (texto === jaExibido) return;

    onOperacao({ op: 'editar_legenda', wordId, text: texto, original });
  };

  const totalCorrigido = plano.captions.corrections.length;

  return (
    <div style={{ display: 'grid', gap: 'var(--e4)', padding: 'var(--e3)' }}>
      <div>
        <p className="texto-secundario" style={{ fontSize: 12, lineHeight: 1.5 }}>
          Clique numa palavra para corrigir a transcrição. A legenda continua no
          mesmo tempo da fala.
        </p>
        {totalCorrigido > 0 && (
          <p style={{ fontSize: 12, marginTop: 'var(--e2)', color: 'var(--accent)' }}>
            {totalCorrigido} {totalCorrigido === 1 ? 'palavra corrigida' : 'palavras corrigidas'}
          </p>
        )}
      </div>

      {transcricao.segmentos.map((segmento) => {
        const noVideo = segmento.palavras.filter((p) => entraNoVideo(p.startMs, p.endMs));
        if (noVideo.length === 0) return null;

        return (
          <div key={segmento.id}>
            <span
              className="texto-secundario"
              style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums' }}
            >
              {tempo(segmento.startMs)}
            </span>

            <p
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '3px 5px',
                marginTop: 'var(--e2)',
                fontSize: 14,
                lineHeight: 1.7,
              }}
            >
              {noVideo.map((palavra) => {
                const correcao = correcoes.get(palavra.id);
                const exibido = correcao?.text ?? palavra.texto;
                const incerta = palavra.confianca < CONFIANCA_BAIXA;

                if (editando === palavra.id) {
                  return (
                    <input
                      key={palavra.id}
                      autoFocus
                      value={rascunho}
                      onChange={(e) => setRascunho(e.target.value)}
                      onBlur={() => salvar(palavra.id, correcao?.original ?? palavra.texto)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.currentTarget.blur();
                        }
                        // Esc descarta: quem abriu por engano precisa
                        // de saída que não altere nada.
                        if (e.key === 'Escape') {
                          setEditando(null);
                        }
                      }}
                      maxLength={80}
                      aria-label={`Corrigir "${palavra.texto}"`}
                      style={{
                        fontSize: 14,
                        padding: '1px 4px',
                        width: `${Math.max(rascunho.length + 2, 6)}ch`,
                        borderRadius: 4,
                        border: '1px solid var(--accent)',
                        background: 'var(--surface-2)',
                        color: 'var(--text-primary)',
                      }}
                    />
                  );
                }

                return (
                  <button
                    key={palavra.id}
                    type="button"
                    onClick={() => abrir(palavra.id, exibido)}
                    title={
                      correcao
                        ? `O áudio diz "${correcao.original}" — corrigido`
                        : incerta
                          ? 'O whisper ficou pouco seguro desta palavra'
                          : 'Clique para corrigir'
                    }
                    style={{
                      font: 'inherit',
                      padding: '1px 4px',
                      borderRadius: 4,
                      cursor: 'pointer',
                      color: 'var(--text-primary)',
                      // Corrigida ganha fundo de destaque; incerta
                      // ganha sublinhado. As duas marcas juntas não
                      // se confundem: uma é estado, outra é aviso.
                      background: correcao ? 'rgba(47,102,255,0.18)' : 'transparent',
                      border: correcao
                        ? '1px solid var(--accent)'
                        : '1px solid transparent',
                      textDecoration: !correcao && incerta ? 'underline wavy' : 'none',
                      textDecorationColor: 'var(--warning)',
                      textUnderlineOffset: 3,
                    }}
                  >
                    {exibido}
                  </button>
                );
              })}
            </p>
          </div>
        );
      })}

      {totalCorrigido > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--e3)' }}>
          <h4 style={{ fontSize: 12, marginBottom: 'var(--e2)' }}>Correções</h4>

          <div style={{ display: 'grid', gap: 'var(--e2)' }}>
            {plano.captions.corrections.map((c) => (
              <div
                key={c.wordId}
                className="linha"
                style={{ gap: 'var(--e2)', fontSize: 12, alignItems: 'center' }}
              >
                <IconeCheck size={12} color="var(--success)" />
                {/* O original fica visível: é o que permite conferir
                    se a legenda corresponde ao que foi dito. Uma
                    correção que esconde o áudio é indistinguível de
                    uma reescrita da fala. */}
                <span className="texto-secundario" style={{ textDecoration: 'line-through' }}>
                  {c.original}
                </span>
                <span aria-hidden>→</span>
                <strong>{c.text}</strong>
                <button
                  type="button"
                  className="botao botao--pequeno"
                  onClick={() => onOperacao({ op: 'desfazer_correcao', wordId: c.wordId })}
                  style={{ marginLeft: 'auto' }}
                  title="Voltar ao que o áudio diz"
                >
                  <IconeVoltar size={12} />
                  Desfazer
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {transcricao.segmentos.every(
        (s) => s.palavras.filter((p) => entraNoVideo(p.startMs, p.endMs)).length === 0,
      ) && (
        <div className="linha" style={{ gap: 'var(--e2)', fontSize: 13 }}>
          <IconeAviso size={14} color="var(--warning)" />
          <span className="texto-secundario">
            Nenhuma fala dos trechos escolhidos tem transcrição para corrigir.
          </span>
        </div>
      )}
    </div>
  );
}
