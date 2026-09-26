'use client';

// ============================================================
// Mídias sugeridas pela IA: imagens, ícones 3D, logos e vídeos que
// ilustram a fala, de bancos de licença livre.
//
// A IA marca os momentos da fala que pedem imagem; para cada um, o
// servidor traz até 4 opções. Aqui a pessoa confere: troca a opção, muda
// a composição, desmarca o que não quer -- e adiciona tudo numa versão só
// (um Ctrl+Z desfaz a leva). A montagem com IA já ilustra sozinha no
// servidor (midias.service, `midiasDaIa` no Kit de marca); aqui é pedir
// outra leva ou escolher uma a uma.
// ============================================================

import { useRef, useState } from 'react';
import Link from 'next/link';
import { COMPOSICOES, NOME_DA_COMPOSICAO, NOME_DA_FONTE, NOME_DO_TIPO_DA_BUSCA } from '@makucho/studio-contracts';
import type { Composicao, EditPlanV1, TimelineOperation } from '@makucho/studio-contracts';
import { bancoDeMidia, type MomentoSugerido } from '../../lib/api';
import { operacoesDasEscolhas } from '../../lib/midiasDaIa';
import { tempo } from '../editor/funcoes';
import { IconeIA, IconeCheck, IconeAviso } from '../icones';

interface Props {
  plan: EditPlanV1;
  desligados?: readonly string[];
  corDaMarca?: string;
  onOperacoes: (ops: TimelineOperation[]) => void;
}

interface Linha {
  momento: MomentoSugerido;
  usar: boolean;
  escolhida: number;
  composicao: Composicao;
}

export function SugestoesDeMidia({ plan, desligados = [], corDaMarca, onOperacoes }: Props) {
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [semOpcoes, setSemOpcoes] = useState<string[]>([]);
  const [aplicando, setAplicando] = useState<string | null>(null);
  const [feito, setFeito] = useState<string | null>(null);
  // As operações entram no plano de DEPOIS da importação (que demora):
  // a função mais nova, não a da hora do clique.
  const onOperacoesRef = useRef(onOperacoes);
  onOperacoesRef.current = onOperacoes;

  const sugerir = async () => {
    setBuscando(true);
    setErro(null);
    setFeito(null);
    try {
      const r = await bancoDeMidia.sugerir(plan.projectId, desligados);
      setLinhas(r.momentos.map((m) => ({ momento: m, usar: true, escolhida: 0, composicao: m.composicao })));
      setAvisos(r.avisos);
      setSemOpcoes(r.semOpcoes);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'a IA não conseguiu sugerir agora.');
    } finally {
      setBuscando(false);
    }
  };

  const mudar = (i: number, m: Partial<Linha>) => setLinhas((l) => l?.map((x, j) => (j === i ? { ...x, ...m } : x)) ?? l);
  const marcadas = (linhas ?? []).filter((l) => l.usar);

  const aplicar = async () => {
    if (!marcadas.length) return;
    setErro(null);
    const { ops, falhas } = await operacoesDasEscolhas(
      marcadas.map((l) => ({ momento: l.momento, opcao: l.momento.opcoes[l.escolhida]!, composicao: l.composicao })),
      corDaMarca,
      (feitas, total) => setAplicando(`Trazendo ${Math.min(feitas + 1, total)} de ${total}…`),
    );
    setAplicando(null);
    if (ops.length) onOperacoesRef.current(ops);
    const n = marcadas.length - falhas.length;
    setFeito(`${n} ${n === 1 ? 'mídia entrou' : 'mídias entraram'} no vídeo (faixa Mídia). Ctrl+Z desfaz tudo de uma vez.`);
    if (falhas.length) setErro(falhas.join(' · '));
    setLinhas(null);
  };

  return (
    <section className="sugestoes-midia" aria-labelledby="sugestoes-midia-titulo">
      <header className="sugestoes-midia__topo">
        <span className="sugestoes-midia__icone" aria-hidden>
          <IconeIA size={16} weight="fill" />
        </span>
        <div>
          <h3 id="sugestoes-midia-titulo">Mídias sugeridas pela IA</h3>
          <p>A IA lê a fala e escolhe ícones 3D, logos, fotos e vídeos de bancos de licença livre para ilustrar cada momento. Você confere antes.</p>
        </div>
      </header>

      {!linhas && (
        <button type="button" className="botao botao--primario" style={{ width: '100%' }} disabled={buscando} onClick={() => void sugerir()}>
          <IconeIA size={16} weight="fill" /> {buscando ? 'Lendo a fala e buscando as mídias… (até 1 min)' : 'Sugerir mídias para este vídeo'}
        </button>
      )}

      <p className="sugestoes-midia__auto">
        A montagem com IA já coloca as mídias sozinha; aqui você pede outra leva ou escolhe uma a uma.{' '}
        <Link href="/marca#videos">Ligar ou desligar em Marca &gt; Vídeos</Link>
      </p>

      {erro && (
        <p className="campo__erro" role="alert">
          {erro}
        </p>
      )}
      {feito && (
        <p className="sugestoes-midia__feito" role="status">
          <IconeCheck size={14} /> {feito}
        </p>
      )}
      {avisos.length > 0 && (
        <div className="aviso aviso--atencao">
          <IconeAviso size={16} />
          <span>
            Algumas fontes ficaram de fora: {avisos.join(' · ')}{' '}
            <Link href="/configuracoes#midia">Cadastrar as chaves</Link>
          </span>
        </div>
      )}

      {linhas && (
        <>
          {linhas.length === 0 ? (
            <p className="texto-secundario">A IA não achou momentos que pedem imagem nesta fala.</p>
          ) : (
            <ol className="sugestoes-midia__lista">
              {linhas.map((l, i) => {
                const opcao = l.momento.opcoes[l.escolhida]!;
                return (
                  <li key={`${l.momento.inicioMs}-${i}`} className="momento-midia" data-usar={l.usar || undefined}>
                    <div className="momento-midia__topo">
                      <label className="momento-midia__usar">
                        <input type="checkbox" checked={l.usar} onChange={(e) => mudar(i, { usar: e.target.checked })} />
                        <span className="momento-midia__tempo">{tempo(l.momento.inicioMs)}</span>
                        <strong>{l.momento.conceito}</strong>
                      </label>
                      <span className="momento-midia__tipo">{NOME_DO_TIPO_DA_BUSCA[l.momento.tipoAchado]}</span>
                    </div>
                    {l.momento.fala && <p className="momento-midia__fala">&ldquo;{l.momento.fala}&rdquo;</p>}
                    <div className="momento-midia__opcoes" role="radiogroup" aria-label={`Opções para ${l.momento.conceito}`}>
                      {l.momento.opcoes.map((o, j) => (
                        <button
                          key={`${o.fonte}-${o.id}`}
                          type="button"
                          role="radio"
                          aria-checked={j === l.escolhida}
                          className="momento-midia__opcao"
                          data-transparente={o.transparente || undefined}
                          title={`${o.titulo} · ${NOME_DA_FONTE[o.fonte]} · ${o.licenca.nome}`}
                          onClick={() => mudar(i, { escolhida: j, usar: true })}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={o.miniatura} alt={o.titulo} loading="lazy" />
                          {o.tipo === 'video' && <span className="momento-midia__selo">vídeo</span>}
                        </button>
                      ))}
                    </div>
                    <div className="momento-midia__rodape">
                      <select
                        className="campo__selecao"
                        value={l.composicao}
                        aria-label="Como mostrar"
                        onChange={(e) => mudar(i, { composicao: e.target.value as Composicao })}
                      >
                        {COMPOSICOES.map((c) => (
                          <option key={c} value={c}>
                            {NOME_DA_COMPOSICAO[c]}
                          </option>
                        ))}
                      </select>
                      <a href={opcao.pagina} target="_blank" rel="noreferrer" className="momento-midia__credito">
                        {NOME_DA_FONTE[opcao.fonte]} · {opcao.licenca.nome}
                        {opcao.licenca.exigeCredito && opcao.autor ? ` · ${opcao.autor}` : ''}
                      </a>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          {semOpcoes.length > 0 && <p className="texto-secundario">Sem opções boas para: {semOpcoes.join(', ')}.</p>}
          <div className="sugestoes-midia__acoes">
            <button type="button" className="botao botao--primario botao--pequeno" disabled={!marcadas.length || aplicando !== null} onClick={() => void aplicar()}>
              {aplicando ?? `Adicionar ${marcadas.length} ${marcadas.length === 1 ? 'mídia' : 'mídias'} ao vídeo`}
            </button>
            <button type="button" className="botao botao--fantasma botao--pequeno" disabled={aplicando !== null} onClick={() => setLinhas(null)}>
              Descartar
            </button>
          </div>
        </>
      )}
    </section>
  );
}
