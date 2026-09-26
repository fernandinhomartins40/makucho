'use client';

// ============================================================
// Painel de legendas — ler e corrigir o que vai escrito no vídeo.
//
// O problema que ele resolve: o whisper erra nome próprio, jargão e
// sigla. "Makucho" sai "macucho", "CNPJ" sai "cinpege". Sem correção,
// o erro vai QUEIMADO no arquivo exportado.
//
// COMO A TELA SE LÊ
//
// - Como um texto, não como uma grade de botões: cada frase é um
//   parágrafo corrido, na ORDEM DO VÍDEO EDITADO (um trecho reordenado
//   aparece onde toca), com o tempo do vídeo final -- não o da gravação
//   bruta, que pulava de 0:25 para 0:42 sem explicação.
// - A frase que está tocando fica em destaque e a palavra falada
//   acende; tocar no tempo leva o vídeo até ela.
// - As palavras em que a transcrição ficou em dúvida têm um filtro
//   próprio ("Revisar") e a marca é explicada na legenda da tela.
//
// Corrige-se PALAVRA, não bloco nem tempo: a correção guarda o id da
// `TranscriptWord`, e a legenda fica no frame certo porque a palavra
// sabe onde está -- e continua certa depois de um ajuste de corte.
// ============================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import type { EditPlanV1, TimelineOperation } from '@makucho/studio-contracts';
import { agendaDoPlano } from '@makucho/studio-contracts';
import type { Transcricao } from '../../lib/api';
import { tempo } from './funcoes';
import { IconeBusca, IconeCheck, IconeVoltar } from '../icones';

/**
 * Abaixo disso, o whisper está pouco seguro do que ouviu.
 *
 * Não é aviso de erro: é onde olhar primeiro. Pedir revisão de todas
 * as palavras seria pedir que a pessoa refizesse a transcrição à mão.
 */
const CONFIANCA_BAIXA = 0.6;

type Palavra = Transcricao['segmentos'][number]['palavras'][number];

interface Frase {
  chave: string;
  inicioMs: number;
  fimMs: number;
  palavras: Array<{ palavra: Palavra; inicioMs: number; fimMs: number }>;
}

interface Props {
  plano: EditPlanV1;
  transcricao: Transcricao | null;
  carregando: boolean;
  onOperacao: (operacao: TimelineOperation) => void;
  /** Tempo do vídeo (timeline): acende a frase e a palavra faladas. */
  posicaoMs?: number;
  onPosicao?: (ms: number) => void;
  desligados?: ReadonlySet<string>;
}

type Filtro = 'tudo' | 'revisar' | 'corrigidas';

export function PainelDeLegendas({ plano, transcricao, carregando, onOperacao, posicaoMs = 0, onPosicao, desligados }: Props) {
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('tudo');
  const [busca, setBusca] = useState('');
  const listaRef = useRef<HTMLDivElement>(null);

  const correcoes = useMemo(() => new Map(plano.captions.corrections.map((c) => [c.wordId, c])), [plano.captions.corrections]);
  const ocultas = useMemo(() => new Set(plano.captions.hiddenWordIds ?? []), [plano.captions.hiddenWordIds]);

  // As frases na ordem do vídeo: para cada trecho que toca, as palavras
  // de cada segmento que caem dentro dele, com o tempo do vídeo final.
  const frases = useMemo<Frase[]>(() => {
    if (!transcricao?.existe) return [];
    const agenda = agendaDoPlano(plano, desligados ? [...desligados] : []);
    const lista: Frase[] = [];
    agenda.trechos.forEach((t, k) => {
      const { sourceStartMs: ini, sourceEndMs: fim } = t.clip;
      for (const seg of transcricao.segmentos) {
        if (seg.endMs <= ini || seg.startMs >= fim) continue;
        const palavras = seg.palavras
          .filter((p) => p.startMs >= ini && p.startMs < fim)
          .map((p) => ({ palavra: p, inicioMs: t.inicioMs + (p.startMs - ini) / t.velocidade, fimMs: t.inicioMs + (Math.min(p.endMs, fim) - ini) / t.velocidade }));
        if (!palavras.length) continue;
        lista.push({ chave: `${k}-${seg.id}`, inicioMs: palavras[0]!.inicioMs, fimMs: palavras[palavras.length - 1]!.fimMs, palavras });
      }
    });
    return lista;
  }, [plano, transcricao, desligados]);

  const exibido = (p: Palavra) => correcoes.get(p.id)?.text ?? p.texto;
  const duvidosa = (p: Palavra) => p.confianca < CONFIANCA_BAIXA && !correcoes.has(p.id);
  const totalRevisar = useMemo(() => new Set(frases.flatMap((f) => f.palavras.filter((x) => duvidosa(x.palavra)).map((x) => x.palavra.id))).size, [frases, correcoes]); // eslint-disable-line react-hooks/exhaustive-deps
  const totalCorrigido = plano.captions.corrections.length;
  const termo = busca.trim().toLocaleLowerCase('pt-BR');

  const visiveis = frases.filter((f) => {
    if (filtro === 'revisar' && !f.palavras.some((x) => duvidosa(x.palavra))) return false;
    if (filtro === 'corrigidas' && !f.palavras.some((x) => correcoes.has(x.palavra.id))) return false;
    if (termo && !f.palavras.some((x) => exibido(x.palavra).toLocaleLowerCase('pt-BR').includes(termo))) return false;
    return true;
  });

  const tocando = frases.find((f) => posicaoMs >= f.inicioMs && posicaoMs < f.fimMs + 250)?.chave;

  // A frase que toca fica à vista enquanto o vídeo anda (sem puxar a
  // rolagem de quem está editando uma palavra).
  useEffect(() => {
    if (!tocando || editando) return;
    const el = listaRef.current?.querySelector<HTMLElement>(`[data-chave="${CSS.escape(tocando)}"]`);
    const caixa = listaRef.current?.closest('.editor__ia') as HTMLElement | null;
    if (!el || !caixa) return;
    const r = el.getBoundingClientRect();
    const c = caixa.getBoundingClientRect();
    if (r.top < c.top + 60 || r.bottom > c.bottom - 20) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [tocando, editando]);

  if (carregando) {
    return <p className="legendas__aviso">Carregando a transcrição…</p>;
  }

  if (!transcricao?.existe) {
    return <p className="legendas__aviso">A transcrição ainda não está pronta. Ela é gerada depois do envio do vídeo, e é dela que as legendas saem.</p>;
  }

  const abrir = (p: Palavra) => {
    setEditando(p.id);
    setRascunho(exibido(p));
  };

  const salvar = (p: Palavra) => {
    const texto = rascunho.trim();
    setEditando(null);
    // Vazio ou igual ao que já está na tela não é correção.
    if (!texto || texto === exibido(p)) return;
    onOperacao({ op: 'editar_legenda', wordId: p.id, text: texto, original: correcoes.get(p.id)?.original ?? p.texto });
  };

  /** A próxima palavra duvidosa depois desta, para revisar em sequência. */
  const proximaDuvidosa = (depoisDe: string) => {
    const todas = frases.flatMap((f) => f.palavras.map((x) => x.palavra));
    const i = todas.findIndex((p) => p.id === depoisDe);
    return todas.slice(i + 1).find((p) => duvidosa(p) && p.id !== depoisDe);
  };

  return (
    <div className="legendas" ref={listaRef}>
      <div className="legendas__topo">
        <p className="legendas__ajuda">
          Este é o texto que aparece no vídeo. <strong>Toque numa palavra</strong> para corrigir; toque no tempo para ver o trecho.
        </p>
        <div className="legendas__filtros" role="radiogroup" aria-label="Mostrar">
          {(
            [
              ['tudo', 'Tudo', null],
              ['revisar', 'Revisar', totalRevisar],
              ['corrigidas', 'Corrigidas', totalCorrigido],
            ] as const
          ).map(([id, rotulo, n]) => (
            <button key={id} type="button" role="radio" aria-checked={filtro === id} className="legendas__filtro" data-tipo={id} onClick={() => setFiltro(id)}>
              {rotulo}
              {n !== null && <span className="legendas__conta">{n}</span>}
            </button>
          ))}
        </div>
        <label className="legendas__busca">
          <IconeBusca size={14} aria-hidden />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar uma palavra" aria-label="Buscar uma palavra na legenda" />
        </label>
        {totalRevisar > 0 && filtro !== 'corrigidas' && (
          <p className="legendas__marca">
            <span className="legendas__exemplo-duvida">Sublinhado ondulado</span>: a transcrição ficou em dúvida nessa palavra. Vale conferir.
          </p>
        )}
      </div>

      {visiveis.length === 0 ? (
        <p className="legendas__aviso">
          {frases.length === 0
            ? 'Nenhuma fala dos trechos escolhidos tem transcrição.'
            : filtro === 'revisar'
              ? 'Nada para revisar: a transcrição ficou segura em todas as palavras.'
              : filtro === 'corrigidas'
                ? 'Nenhuma palavra corrigida ainda.'
                : 'Nenhuma frase com essa palavra.'}
        </p>
      ) : (
        <ol className="legendas__lista">
          {visiveis.map((f) => (
            <li key={f.chave} className="legendas__frase" data-chave={f.chave} data-tocando={f.chave === tocando || undefined}>
              <button type="button" className="legendas__tempo" onClick={() => onPosicao?.(f.inicioMs)} title="Ver este trecho no vídeo">
                {tempo(f.inicioMs)}
              </button>
              <p className="legendas__texto">
                {f.palavras.map(({ palavra: p, inicioMs, fimMs }, i) => {
                  const texto = exibido(p);
                  const espaco = i > 0 ? ' ' : '';
                  if (editando === p.id) {
                    return (
                      <span key={p.id}>
                        {espaco}
                        <input
                          autoFocus
                          className="legendas__campo"
                          value={rascunho}
                          onChange={(e) => setRascunho(e.target.value)}
                          onBlur={() => salvar(p)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur();
                            // Esc descarta: quem abriu por engano precisa de saída.
                            if (e.key === 'Escape') setEditando(null);
                            // Tab salva e vai para a próxima dúvida: revisar em sequência.
                            if (e.key === 'Tab' && !e.shiftKey) {
                              const prox = proximaDuvidosa(p.id);
                              if (prox) {
                                e.preventDefault();
                                salvar(p);
                                abrir(prox);
                              }
                            }
                          }}
                          maxLength={80}
                          aria-label={`Corrigir "${p.texto}"`}
                          style={{ width: `${Math.max(rascunho.length + 2, 5)}ch` }}
                        />
                      </span>
                    );
                  }
                  const achada = termo && texto.toLocaleLowerCase('pt-BR').includes(termo);
                  return (
                    <span key={p.id}>
                      {espaco}
                      <button
                        type="button"
                        className="legendas__palavra"
                        data-corrigida={correcoes.has(p.id) || undefined}
                        data-duvida={duvidosa(p) || undefined}
                        data-oculta={ocultas.has(p.id) || undefined}
                        data-falando={(posicaoMs >= inicioMs && posicaoMs < fimMs) || undefined}
                        data-achada={achada || undefined}
                        onClick={() => abrir(p)}
                        title={
                          correcoes.has(p.id)
                            ? `Corrigida. O áudio diz "${correcoes.get(p.id)!.original}"`
                            : ocultas.has(p.id)
                              ? 'Fora da legenda (continua na fala)'
                              : duvidosa(p)
                                ? 'A transcrição ficou em dúvida aqui. Toque para corrigir'
                                : 'Toque para corrigir'
                        }
                      >
                        {texto}
                      </button>
                    </span>
                  );
                })}
              </p>
            </li>
          ))}
        </ol>
      )}

      {totalCorrigido > 0 && (
        <section className="legendas__correcoes">
          <h4>Palavras corrigidas</h4>
          <ul>
            {plano.captions.corrections.map((c) => (
              <li key={c.wordId}>
                <IconeCheck size={12} color="var(--success)" />
                {/* O original fica visível: é o que permite conferir que a
                    legenda corresponde ao que foi dito. */}
                <span className="texto-secundario" style={{ textDecoration: 'line-through' }}>
                  {c.original}
                </span>
                <span aria-hidden>→</span>
                <strong>{c.text}</strong>
                <button
                  type="button"
                  className="botao botao--fantasma botao--pequeno"
                  onClick={() => onOperacao({ op: 'desfazer_correcao', wordId: c.wordId })}
                  title="Voltar ao que o áudio diz"
                >
                  <IconeVoltar size={12} />
                  Desfazer
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
