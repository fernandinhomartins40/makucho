'use client';

// ============================================================
// Imagens que ilustram a fala: a IA sugere, a pessoa aprova.
//
// A IA de texto lê a fala e marca os momentos que pedem imagem, com a
// cena ideal descrita; o servidor busca nos bancos de licença livre e a
// IA que ENXERGA (CLIP) olha cada candidata e as ordena pelo quanto
// combinam. Aqui a pessoa vê, para cada momento, a PRÉVIA de como fica
// no vídeo, troca a imagem ou o jeito de mostrar, desliga o que não
// quer -- e adiciona tudo numa versão só (um Ctrl+Z desfaz a leva).
// ============================================================

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { COMPOSICOES, NOME_DA_FONTE, NOME_DO_TIPO_DA_BUSCA } from '@makucho/studio-contracts';
import type { Composicao, EditPlanV1, ResultadoDaBusca, TimelineOperation } from '@makucho/studio-contracts';
import { bancoDeMidia, projetos as apiProjetos, type MidiasSeparadas, type MomentoSugerido } from '../../lib/api';
import { operacoesDasEscolhas } from '../../lib/midiasDaIa';
import { tempo } from '../editor/funcoes';
import { IconeIA, IconeCheck, IconeAviso, IconeFechar, IconeTocar } from '../icones';

interface Props {
  plan: EditPlanV1;
  desligados?: readonly string[];
  corDaMarca?: string;
  onOperacoes: (ops: TimelineOperation[]) => void;
  /** O que a montagem com IA já separou: o painel abre com isso para aprovar. */
  separadas?: MidiasSeparadas | null;
  /** Aprovadas ou dispensadas (o editor tira o aviso). */
  onConcluir?: () => void;
  /** Leva o vídeo até o momento, para a pessoa ver onde a imagem entra. */
  onVerNoVideo?: (ms: number) => void;
}

interface Linha {
  momento: MomentoSugerido;
  usar: boolean;
  escolhida: number;
  composicao: Composicao;
}

/** Como aparece, em palavras curtas (os chips da composição). */
const ROTULO_CURTO: Record<Composicao, string> = {
  icone_ao_lado: 'Ao lado',
  cartao: 'Cartão',
  moldura: 'Moldura',
  janela: 'Janela',
  tela_cheia: 'Tela cheia',
  tela_cheia_com_titulo: 'Com título',
};

/** Onde a mídia fica no quadro 9:16 (centro e largura, 0-1), como em operacoesDaComposicao. */
const LUGAR: Record<Composicao, { x: number; y: number; w: number; cheia?: boolean }> = {
  icone_ao_lado: { x: 0.78, y: 0.36, w: 0.3 },
  cartao: { x: 0.76, y: 0.62, w: 0.38 },
  moldura: { x: 0.5, y: 0.42, w: 0.72 },
  janela: { x: 0.72, y: 0.2, w: 0.44 },
  tela_cheia: { x: 0.5, y: 0.5, w: 1, cheia: true },
  tela_cheia_com_titulo: { x: 0.5, y: 0.5, w: 1, cheia: true },
};

const ETAPAS_DA_BUSCA = ['Lendo a sua fala e marcando os momentos…', 'Buscando nos bancos de imagens livres…', 'Olhando cada imagem para escolher a que mais combina…'];

function rotuloDaAfinidade(a: number | undefined): { texto: string; nivel: 'alta' | 'media' | 'baixa' } | null {
  if (a == null) return null;
  if (a >= 70) return { texto: 'Combina muito', nivel: 'alta' };
  if (a >= 40) return { texto: 'Combina', nivel: 'media' };
  return { texto: 'Combina pouco', nivel: 'baixa' };
}

export function SugestoesDeMidia({ plan, desligados = [], corDaMarca, onOperacoes, separadas, onConcluir, onVerNoVideo }: Props) {
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [etapa, setEtapa] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [semOpcoes, setSemOpcoes] = useState<string[]>([]);
  const [aplicando, setAplicando] = useState<string | null>(null);
  const [feito, setFeito] = useState<string | null>(null);
  // A revisão abre numa janela grande: o painel lateral é estreito para prévia e opções.
  const [aberta, setAberta] = useState(false);
  const janela = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberta) return;
    janela.current?.focus();
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = antes;
    };
  }, [aberta]);
  // As operações entram no plano de DEPOIS da importação (que demora):
  // a função mais nova, não a da hora do clique.
  const onOperacoesRef = useRef(onOperacoes);
  onOperacoesRef.current = onOperacoes;

  const encher = (r: { momentos: MomentoSugerido[]; avisos?: string[]; semOpcoes?: string[] }) => {
    setLinhas(r.momentos.map((m) => ({ momento: m, usar: true, escolhida: 0, composicao: m.composicao })));
    setAvisos(r.avisos ?? []);
    setSemOpcoes(r.semOpcoes ?? []);
  };

  // O que a montagem separou entra na lista, pronto para aprovar.
  const [daMontagem, setDaMontagem] = useState(false);
  useEffect(() => {
    if (!separadas?.momentos.length) return;
    encher(separadas);
    setDaMontagem(true);
    setAberta(true);
  }, [separadas]);

  // A busca leva até um minuto: as etapas dizem o que está acontecendo.
  useEffect(() => {
    if (!buscando) return;
    setEtapa(0);
    const a = setTimeout(() => setEtapa(1), 6000);
    const b = setTimeout(() => setEtapa(2), 16000);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [buscando]);

  const sugerir = async () => {
    setBuscando(true);
    setErro(null);
    setFeito(null);
    try {
      encher(await bancoDeMidia.sugerir(plan.projectId, desligados));
      setDaMontagem(false);
      setAberta(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'a IA não conseguiu sugerir agora.');
    } finally {
      setBuscando(false);
    }
  };

  const mudar = (i: number, m: Partial<Linha>) => setLinhas((l) => l?.map((x, j) => (j === i ? { ...x, ...m } : x)) ?? l);
  const marcadas = (linhas ?? []).filter((l) => l.usar);
  const todas = !!linhas?.length && marcadas.length === linhas.length;

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
    setFeito(`${n} ${n === 1 ? 'imagem entrou' : 'imagens entraram'} no vídeo, na faixa Mídia. Ctrl+Z desfaz tudo de uma vez.`);
    if (falhas.length) setErro(falhas.join(' · '));
    setLinhas(null);
    setAberta(false);
    setDaMontagem(false);
    onConcluir?.();
  };

  const descartar = () => {
    setLinhas(null);
    setAberta(false);
    if (daMontagem) {
      setDaMontagem(false);
      onConcluir?.();
    }
  };

  const miniaturaDoVideo = apiProjetos.urlDaMiniatura(plan.projectId);

  return (
    <section className="sugestoes-midia" aria-labelledby="sugestoes-midia-titulo">
      <header className="sugestoes-midia__topo">
        <span className="sugestoes-midia__icone" aria-hidden>
          <IconeIA size={16} weight="fill" />
        </span>
        <div>
          <h3 id="sugestoes-midia-titulo">Imagens que ilustram a fala</h3>
          <p>Ícones 3D, logos, fotos e vídeos de bancos livres, nos momentos certos do vídeo.</p>
        </div>
      </header>

      {/* Como funciona: três passos, sempre à vista enquanto não há lista. */}
      {!linhas && (
        <ol className="sugestoes-midia__passos" aria-label="Como funciona">
          <li data-ativo={buscando && etapa === 0 ? '' : undefined}>
            <b>1</b>
            <span>
              <strong>A IA lê a sua fala</strong> e marca onde uma imagem ajuda
            </span>
          </li>
          <li data-ativo={buscando && etapa >= 1 ? '' : undefined}>
            <b>2</b>
            <span>
              <strong>Olha as imagens</strong> dos bancos e escolhe as que mais combinam
            </span>
          </li>
          <li>
            <b>3</b>
            <span>
              <strong>Você confere</strong> a prévia, troca o que quiser e aprova
            </span>
          </li>
        </ol>
      )}

      {!linhas && (
        <button type="button" className="botao botao--primario" style={{ width: '100%' }} disabled={buscando} onClick={() => void sugerir()}>
          <IconeIA size={16} weight="fill" /> {buscando ? ETAPAS_DA_BUSCA[etapa] : 'Sugerir imagens para este vídeo'}
        </button>
      )}
      {buscando && (
        <div className="sugestoes-midia__carregando" aria-hidden>
          <span />
          <span />
          <span />
        </div>
      )}
      {!linhas && !buscando && (
        <p className="sugestoes-midia__auto">
          A montagem com IA já separa as imagens para você aprovar; aqui você pede outra leva quando quiser.{' '}
          <Link href="/marca#videos">Ligar ou desligar em Marca &gt; Vídeos</Link>
        </p>
      )}

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

      {/* Com a lista pronta, o painel mostra o resumo; a revisão abre grande. */}
      {linhas && (
        <div className="sugestoes-midia__pendente" role="status">
          <div className="midias-separadas__miniaturas" aria-hidden>
            {linhas.slice(0, 5).map((l, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={l.momento.opcoes[l.escolhida]?.miniatura} alt="" data-transparente={l.momento.opcoes[l.escolhida]?.transparente || undefined} />
            ))}
          </div>
          <p>
            <strong>
              {linhas.length} {linhas.length === 1 ? 'momento' : 'momentos'} com imagem
            </strong>{' '}
            esperando a sua aprovação. Nada entrou no vídeo ainda.
          </p>
          <div className="linha" style={{ gap: 'var(--e2)', flexWrap: 'wrap' }}>
            <button type="button" className="botao botao--primario botao--pequeno" onClick={() => setAberta(true)}>
              Revisar e aprovar
            </button>
            <button type="button" className="botao botao--fantasma botao--pequeno" onClick={descartar}>
              {daMontagem ? 'Dispensar' : 'Descartar'}
            </button>
          </div>
        </div>
      )}

      {linhas &&
        aberta &&
        createPortal(
          <div className="revisao-midia" onMouseDown={(e) => e.target === e.currentTarget && setAberta(false)}>
            <div
              ref={janela}
              className="revisao-midia__janela"
              role="dialog"
              aria-modal="true"
              aria-labelledby="revisao-midia-titulo"
              tabIndex={-1}
              onKeyDown={(e) => {
                // O Esc fecha a janela, e não chega aos atalhos do editor.
                e.stopPropagation();
                if (e.key === 'Escape') setAberta(false);
              }}
            >
              <header className="revisao-midia__topo">
                <div>
                  <h2 id="revisao-midia-titulo">
                    <IconeIA size={18} weight="fill" /> Imagens para ilustrar a fala
                  </h2>
                  <p>
                    {daMontagem ? 'Na montagem, a IA' : 'A IA'} separou <strong>{linhas.length}</strong> {linhas.length === 1 ? 'momento' : 'momentos'}. Em cada um: a{' '}
                    <strong>prévia</strong> mostra como fica, <strong>toque em outra imagem</strong> para trocar, escolha <strong>como aparece</strong> e{' '}
                    <strong>desligue</strong> o que não quiser. A porcentagem é o quanto a imagem combina com a fala, na avaliação da IA que olhou cada uma.
                  </p>
                </div>
                <button type="button" className="botao-icone" aria-label="Fechar (as sugestões continuam guardadas)" onClick={() => setAberta(false)}>
                  <IconeFechar size={20} />
                </button>
              </header>

              <div className="revisao-midia__conteudo">
                {avisos.length > 0 && (
                  <div className="aviso aviso--atencao">
                    <IconeAviso size={16} />
                    <span>
                      Algumas fontes ficaram de fora: {avisos.join(' · ')}{' '}
                      <Link href="/configuracoes#midia">Cadastrar as chaves</Link>
                    </span>
                  </div>
                )}
                {linhas.length === 0 ? (
                  <p className="texto-secundario">A IA não achou momentos que pedem imagem nesta fala.</p>
                ) : (
                  <ol className="sugestoes-midia__lista">
                    {linhas.map((l, i) => (
                      <Momento
                        key={`${l.momento.inicioMs}-${i}`}
                        linha={l}
                        fundo={miniaturaDoVideo}
                        onMudar={(m) => mudar(i, m)}
                        {...(onVerNoVideo
                          ? {
                              onVer: () => {
                                setAberta(false);
                                onVerNoVideo(l.momento.inicioMs);
                              },
                            }
                          : {})}
                      />
                    ))}
                  </ol>
                )}
                {semOpcoes.length > 0 && <p className="texto-secundario">Sem imagens boas para: {semOpcoes.join(', ')}.</p>}
              </div>

              <footer className="revisao-midia__rodape">
                {linhas.length > 1 && (
                  <button type="button" className="sugestoes-midia__alternar" onClick={() => setLinhas((l) => l?.map((x) => ({ ...x, usar: !todas })) ?? l)}>
                    {todas ? 'Desligar todos' : 'Ligar todos'}
                  </button>
                )}
                <span className="revisao-midia__contagem">
                  {marcadas.length} de {linhas.length} {linhas.length === 1 ? 'ligado' : 'ligados'}
                </span>
                <button type="button" className="botao botao--fantasma" disabled={aplicando !== null} onClick={descartar}>
                  {daMontagem ? 'Dispensar' : 'Descartar'}
                </button>
                <button type="button" className="botao botao--primario" disabled={!marcadas.length || aplicando !== null} onClick={() => void aplicar()}>
                  <IconeCheck size={16} />
                  {aplicando ?? (marcadas.length ? `Aprovar ${marcadas.length} ${marcadas.length === 1 ? 'imagem' : 'imagens'}` : 'Ligue um momento')}
                </button>
              </footer>
            </div>
          </div>,
          document.body,
        )}
    </section>
  );
}

// ---------- Um momento ----------

function Momento({ linha: l, fundo, onMudar, onVer }: { linha: Linha; fundo: string; onMudar: (m: Partial<Linha>) => void; onVer?: () => void }) {
  const opcao = l.momento.opcoes[l.escolhida]!;
  const nota = rotuloDaAfinidade(opcao.afinidade);
  return (
    <li className="momento-midia" data-usar={l.usar || undefined}>
      <div className="momento-midia__cabeca">
        {onVer ? (
          <button type="button" className="momento-midia__tempo" onClick={onVer} title="Ver este momento no vídeo">
            <IconeTocar size={10} weight="fill" /> {tempo(l.momento.inicioMs)}
          </button>
        ) : (
          <span className="momento-midia__tempo">{tempo(l.momento.inicioMs)}</span>
        )}
        <div className="momento-midia__titulo">
          <strong>{l.momento.conceito}</strong>
          {l.momento.fala && <span>quando você diz &ldquo;{l.momento.fala}&rdquo;</span>}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={l.usar}
          aria-label={l.usar ? `Não usar imagem em ${l.momento.conceito}` : `Usar imagem em ${l.momento.conceito}`}
          className="chave"
          onClick={() => onMudar({ usar: !l.usar })}
        >
          <span className="chave__bola" aria-hidden />
        </button>
      </div>

      {l.usar && (
        <>
          {l.momento.porque && (
            <p className="momento-midia__porque">
              <IconeIA size={12} weight="fill" /> {l.momento.porque}
            </p>
          )}
          <div className="momento-midia__corpo">
            <Previa fundo={fundo} opcao={opcao} composicao={l.composicao} titulo={l.momento.texto ?? l.momento.conceito} />
            <div className="momento-midia__escolha">
              <span className="momento-midia__rotulo">
                {NOME_DO_TIPO_DA_BUSCA[l.momento.tipoAchado]}
                {nota && <em data-nivel={nota.nivel}>{nota.texto}</em>}
              </span>
              <div className="momento-midia__opcoes" role="radiogroup" aria-label={`Imagens para ${l.momento.conceito}`}>
                {l.momento.opcoes.map((o, j) => (
                  <Opcao key={`${o.fonte}-${o.id}`} o={o} escolhida={j === l.escolhida} melhor={j === 0 && o.afinidade != null} onEscolher={() => onMudar({ escolhida: j })} />
                ))}
              </div>
              <a href={opcao.pagina} target="_blank" rel="noreferrer" className="momento-midia__credito">
                {NOME_DA_FONTE[opcao.fonte]} · {opcao.licenca.nome}
                {opcao.licenca.exigeCredito && opcao.autor ? ` · ${opcao.autor}` : ''}
              </a>
            </div>
          </div>
          <div className="momento-midia__como">
            <span className="momento-midia__rotulo">Como aparece no vídeo</span>
            <div role="radiogroup" aria-label="Como aparece no vídeo">
              {COMPOSICOES.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={c === l.composicao} className="composicao-chip" onClick={() => onMudar({ composicao: c })}>
                  <span className="composicao-chip__quadro" aria-hidden>
                    <i style={estiloDoLugar(c, 1)} />
                  </span>
                  {ROTULO_CURTO[c]}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </li>
  );
}

function Opcao({ o, escolhida, melhor, onEscolher }: { o: ResultadoDaBusca; escolhida: boolean; melhor: boolean; onEscolher: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={escolhida}
      className="momento-midia__opcao"
      data-transparente={o.transparente || undefined}
      title={`${o.titulo} · ${NOME_DA_FONTE[o.fonte]} · ${o.licenca.nome}`}
      onClick={onEscolher}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={o.miniatura} alt={o.titulo} loading="lazy" />
      {o.tipo === 'video' && <span className="momento-midia__selo">vídeo</span>}
      {o.afinidade != null && (
        <span className="momento-midia__nota" data-nivel={rotuloDaAfinidade(o.afinidade)!.nivel}>
          {melhor ? '★ ' : ''}
          {o.afinidade}%
        </span>
      )}
      {escolhida && (
        <span className="momento-midia__marcada" aria-hidden>
          <IconeCheck size={12} />
        </span>
      )}
    </button>
  );
}

/** O lugar da mídia no quadro 9:16, em CSS. `proporcao` = largura/altura da mídia. */
function estiloDoLugar(c: Composicao, proporcao: number): CSSProperties {
  const l = LUGAR[c];
  if (l.cheia) return { left: 0, top: 0, width: '100%', height: '100%' };
  // A largura é da tela (9); a altura sai da proporção da mídia no quadro 9:16.
  const h = Math.min(0.9, (l.w / proporcao) * (9 / 16));
  return { left: `${(l.x - l.w / 2) * 100}%`, top: `${(l.y - h / 2) * 100}%`, width: `${l.w * 100}%`, height: `${h * 100}%` };
}

function Previa({ fundo, opcao, composicao, titulo }: { fundo: string; opcao: ResultadoDaBusca; composicao: Composicao; titulo: string }) {
  const icone = opcao.transparente;
  const proporcao = icone ? 1 : opcao.largura && opcao.altura ? opcao.largura / opcao.altura : 1;
  return (
    <figure className="previa-midia" aria-label="Prévia de como fica no vídeo">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="previa-midia__fundo" src={fundo} alt="" />
      <span className="previa-midia__midia" data-composicao={composicao} data-transparente={icone || undefined} style={estiloDoLugar(composicao, proporcao)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={opcao.miniatura} alt="" />
      </span>
      {composicao === 'tela_cheia_com_titulo' && <span className="previa-midia__titulo">{titulo}</span>}
      <figcaption>Prévia</figcaption>
    </figure>
  );
}
