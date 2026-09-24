'use client';

// ============================================================
// Projetos — dashboard de trabalho.
//
// O diagnóstico do guia apontou que o tutorial dominava a tela e o
// trabalho ficava em segundo plano. Aqui a ordem se inverte: hero
// compacto com a ação principal, projetos recentes em destaque e o
// checklist como apoio.
//
// Os projetos vêm da API. Enquanto não vêm, a tela mostra esqueletos
// com a forma do cartão — não um "carregando…" centralizado, que faz
// o layout saltar quando os dados chegam.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ROTULO_DE_ESTADO, canTransition, estaProcessando } from '@makucho/studio-contracts';
import type { ProjectState } from '@makucho/studio-contracts';
import { Topbar } from '../components/shell/Topbar';
import { projetos as apiProjetos, type Projeto } from '../lib/api';
import { useDados } from '../lib/useDados';
import { formatarBytes } from '../lib/upload';
import { Folha } from '../components/shell/Folha';
import {
  IconeBusca,
  IconeMais,
  IconeAjuda,
  IconeRelogio,
  IconeMenu,
  IconeCheck,
  IconeAviso,
  IconeVideo,
  IconeGravar,
  IconeEnviar,
  IconeLixeira,
  IconeOlhoFechado,
} from '../components/icones';

const PASSOS = [
  {
    titulo: 'Planeje o roteiro',
    texto: 'Hook, problema, autoridade e CTA — a estrutura que segura quem assiste.',
    href: '/roteiros',
  },
  {
    titulo: 'Grave com teleprompter',
    texto: 'O texto sobe no ritmo da sua fala, com a intenção de cada bloco à vista.',
    href: '/gravar',
  },
  {
    titulo: 'A IA monta o vídeo',
    texto: 'Ela escolhe os trechos fortes e explica cada escolha. Você ajusta o que quiser.',
    href: '/editor',
  },
];

export default function ProjetosPage() {
  const [busca, setBusca] = useState('');
  const [erroDeAcao, setErroDeAcao] = useState<string | null>(null);
  const [avisoDeAcao, setAvisoDeAcao] = useState<string | null>(null);
  const [verArquivados, setVerArquivados] = useState(false);
  const [aExcluir, setAExcluir] = useState<Projeto | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const { dados, carregando, erro, recarregar, definir } = useDados<Projeto[]>(
    () => apiProjetos.listar(verArquivados),
    [verArquivados],
  );

  const lista = dados ?? [];
  const filtrados = lista.filter((p) =>
    p.title.toLowerCase().includes(busca.trim().toLowerCase()),
  );

  // O checklist mede progresso real: ter projeto conta como primeiro
  // passo. Um contador fixo seria decoração.
  const concluidos = lista.length > 0 ? 1 : 0;

  // Enquanto algum vídeo está sendo preparado, a lista se atualiza
  // sozinha: o selo "Transcrevendo" vira "Proposta pronta" sem F5.
  const processando = lista.some((p) => estaProcessando(p.state as ProjectState));
  useEffect(() => {
    if (!processando) return;
    const id = setInterval(() => {
      void apiProjetos
        .listar(verArquivados)
        .then(definir)
        .catch(() => undefined);
    }, 6000);
    return () => clearInterval(id);
  }, [processando, definir, verArquivados]);

  const arquivar = async (id: string) => {
    // Some da lista na hora; se o servidor recusar, volta.
    const antes = lista;
    definir(lista.filter((p) => p.id !== id));
    try {
      await apiProjetos.arquivar(id);
    } catch (e) {
      definir(antes);
      setErroDeAcao(e instanceof Error ? e.message : 'não foi possível arquivar.');
    }
  };

  // Sem otimismo: apagar não se desfaz, então o cartão só some quando
  // o servidor confirmar.
  const excluir = async () => {
    if (!aExcluir) return;
    setExcluindo(true);
    setErroDeAcao(null);
    try {
      const { liberadoBytes } = await apiProjetos.excluir(aExcluir.id);
      definir(lista.filter((p) => p.id !== aExcluir.id));
      setAvisoDeAcao(
        `"${aExcluir.title}" foi excluído${liberadoBytes > 0 ? ` e ${formatarBytes(liberadoBytes)} foram liberados` : ''}.`,
      );
    } catch (e) {
      setErroDeAcao(e instanceof Error ? e.message : 'não foi possível excluir.');
    } finally {
      setExcluindo(false);
      setAExcluir(null);
    }
  };

  const fecharConfirmacao = useCallback(() => {
    if (!excluindo) setAExcluir(null);
  }, [excluindo]);

  const reprocessar = async (id: string) => {
    // Otimista como o arquivar: o estado muda na hora para que o
    // clique tenha resposta visível, e volta se o servidor recusar.
    const antes = lista;
    definir(lista.map((p) => (p.id === id ? { ...p, state: 'INGESTING', publicError: null } : p)));
    try {
      const atualizado = await apiProjetos.reprocessar(id);
      // `definir` recebe valor, não função: parte de `antes` para não
      // depender do estado otimista que acabou de ser aplicado.
      definir(antes.map((p) => (p.id === id ? atualizado : p)));
    } catch (e) {
      definir(antes);
      setErroDeAcao(e instanceof Error ? e.message : 'não foi possível tentar de novo.');
    }
  };

  return (
    <>
      <Topbar busca onBuscar={setBusca}>
        <Link href="/ajuda" className="botao-icone" aria-label="Ajuda">
          <IconeAjuda size={20} />
        </Link>
      </Topbar>

      <div className="conteudo">
        <h1 className="titulo-da-pagina">Projetos</h1>

        {erroDeAcao && (
          <div className="aviso aviso--erro" role="alert" style={{ marginBottom: 'var(--e4)' }}>
            <IconeAviso size={16} />
            <span>{erroDeAcao}</span>
          </div>
        )}

        {avisoDeAcao && (
          <div className="aviso aviso--sucesso" role="status" style={{ marginBottom: 'var(--e4)', alignItems: 'center' }}>
            <IconeCheck size={16} />
            <span className="crescer">{avisoDeAcao}</span>
            <button type="button" className="botao-icone botao-icone--pequeno" aria-label="Fechar aviso" onClick={() => setAvisoDeAcao(null)}>
              ✕
            </button>
          </div>
        )}

        {/* ---------- Hero ---------- */}
        <section className="hero" style={{ marginBottom: 'var(--e6)' }}>
          <div style={{ maxWidth: 560 }}>
            <h2 className="hero__titulo" style={{ letterSpacing: -1, marginBottom: 'var(--e3)' }}>
              Crie vídeos melhores, mais rápido
            </h2>
            <p className="texto-secundario" style={{ fontSize: 16, marginBottom: 'var(--e5)' }}>
              Planeje, grave e edite com IA. Do seu jeito, para o seu público.
            </p>
            <div className="linha" style={{ gap: 'var(--e3)', flexWrap: 'wrap' }}>
              <Link href="/gravar" className="botao">
                <IconeMais size={18} weight="bold" />
                Novo vídeo
              </Link>
              <Link href="/gravar?modo=enviar" className="botao botao--secundario">
                <IconeEnviar size={16} />
                Enviar um vídeo pronto
              </Link>
            </div>
          </div>

          <picture className="hero__arte">
            <source srcSet="/assets/makucho-studio/hero-clapperboard.webp" type="image/webp" />
            <img
              src="/assets/makucho-studio/hero-clapperboard.png"
              alt=""
              aria-hidden
              width={768}
              height={512}
              style={{ width: '100%', height: 'auto', display: 'block' }}
            />
          </picture>
        </section>

        <div className="projetos__grade">
          {/* ---------- Projetos recentes ---------- */}
          <section>
            <div className="linha entre" style={{ marginBottom: 'var(--e4)' }}>
              <h2>Meus projetos recentes</h2>
              <span className="linha" style={{ gap: 'var(--e2)' }}>
                {lista.length > 0 && (
                  <span className="texto-secundario" style={{ fontSize: 13 }}>
                    {lista.length} {lista.length === 1 ? 'projeto' : 'projetos'}
                  </span>
                )}
                {/* Arquivados somem da lista mas ocupam espaço: é aqui
                    que se encontra para excluir de vez. */}
                <button
                  type="button"
                  className="botao botao--fantasma botao--pequeno"
                  aria-pressed={verArquivados}
                  onClick={() => setVerArquivados((v) => !v)}
                >
                  {verArquivados ? 'Ocultar arquivados' : 'Ver arquivados'}
                </button>
              </span>
            </div>

            {carregando && <Esqueletos />}

            {erro && !carregando && (
              <div className="cartao vazio">
                <div className="vazio__icone">
                  <IconeAviso size={26} />
                </div>
                <div>
                  <h3 style={{ marginBottom: 4 }}>Não foi possível carregar</h3>
                  <p className="texto-secundario" style={{ marginBottom: 'var(--e4)' }}>
                    {erro}
                  </p>
                  <button type="button" className="botao botao--secundario" onClick={recarregar}>
                    Tentar de novo
                  </button>
                </div>
              </div>
            )}

            {!carregando && !erro && lista.length === 0 && (
              <div className="cartao vazio">
                <div className="vazio__icone">
                  <IconeVideo size={26} />
                </div>
                <div>
                  <h3 style={{ marginBottom: 4 }}>Nenhum projeto ainda</h3>
                  <p className="texto-secundario" style={{ marginBottom: 'var(--e4)' }}>
                    Comece gravando pelo teleprompter ou enviando um vídeo que você já
                    tem.
                  </p>
                  <div className="linha" style={{ gap: 'var(--e3)' }}>
                    <Link href="/gravar" className="botao">
                      <IconeGravar size={16} weight="fill" />
                      Gravar agora
                    </Link>
                    <Link href="/gravar?modo=enviar" className="botao botao--secundario">
                      <IconeEnviar size={16} />
                      Enviar vídeo
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {!carregando && !erro && lista.length > 0 && filtrados.length === 0 && (
              <div className="cartao vazio">
                <div className="vazio__icone">
                  <IconeBusca size={26} />
                </div>
                <div>
                  <h3 style={{ marginBottom: 4 }}>Nenhum projeto encontrado</h3>
                  <p className="texto-secundario">Tente outro termo.</p>
                </div>
              </div>
            )}

            {filtrados.length > 0 && (
              <div className="projetos__cartoes">
                {filtrados.map((projeto) => (
                  <CartaoDeProjeto
                    key={projeto.id}
                    projeto={projeto}
                    onArquivar={() => arquivar(projeto.id)}
                    onExcluir={() => setAExcluir(projeto)}
                    onReprocessar={() => reprocessar(projeto.id)}
                  />
                ))}
              </div>
            )}

            <Folha aberta={aExcluir !== null} aoFechar={fecharConfirmacao} titulo="Excluir o projeto?">
              {aExcluir && (
                <div style={{ display: 'grid', gap: 'var(--e4)' }}>
                  <p style={{ fontSize: 15, lineHeight: 1.5 }}>
                    <strong>{aExcluir.title}</strong> será apagado de vez, com todos os vídeos enviados, a
                    prévia, a transcrição, a edição e os vídeos exportados. Não dá para desfazer.
                  </p>
                  {estaProcessando(aExcluir.state as ProjectState) && (
                    <div className="aviso aviso--atencao">
                      <IconeAviso size={15} />
                      <span>O vídeo ainda está sendo processado; o processamento será interrompido.</span>
                    </div>
                  )}
                  <p className="texto-secundario">
                    O roteiro usado continua salvo em Roteiro. Se ainda for precisar do vídeo exportado,
                    baixe antes.
                  </p>
                  <div className="linha" style={{ gap: 'var(--e2)', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    <button type="button" className="botao botao--secundario" disabled={excluindo} onClick={fecharConfirmacao}>
                      Cancelar
                    </button>
                    <button type="button" className="botao botao--excluir" disabled={excluindo} onClick={() => void excluir()}>
                      <IconeLixeira size={16} />
                      {excluindo ? 'Excluindo…' : 'Excluir de vez'}
                    </button>
                  </div>
                </div>
              )}
            </Folha>
          </section>

          {/* ---------- Comece por aqui ---------- */}
          <aside className="cartao">
            <div className="linha entre" style={{ marginBottom: 'var(--e3)' }}>
              <h3>Comece por aqui</h3>
              <span className="texto-secundario" style={{ fontSize: 12 }}>
                {concluidos} de {PASSOS.length}
              </span>
            </div>

            <div
              className="barra"
              role="progressbar"
              aria-valuenow={concluidos}
              aria-valuemin={0}
              aria-valuemax={PASSOS.length}
              aria-label="Progresso da configuração inicial"
              style={{ marginBottom: 'var(--e4)' }}
            >
              <div
                className="barra__preenchida"
                style={{ width: `${(concluidos / PASSOS.length) * 100}%` }}
              />
            </div>

            <ol style={{ listStyle: 'none', display: 'grid', gap: 'var(--e4)' }}>
              {PASSOS.map((passo, i) => {
                const feito = i < concluidos;

                return (
                  <li key={passo.titulo} style={{ display: 'flex', gap: 'var(--e3)' }}>
                    {/* Número vira check quando concluído: a forma muda,
                        não só a cor. */}
                    <span
                      aria-hidden
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 13,
                        display: 'grid',
                        placeItems: 'center',
                        flexShrink: 0,
                        background: feito ? 'var(--success)' : 'var(--surface-2)',
                        border: feito ? 'none' : '1px solid var(--border-forte)',
                        color: feito ? '#041735' : 'var(--text-secondary)',
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      {feito ? <IconeCheck size={14} weight="bold" /> : i + 1}
                    </span>

                    <div>
                      <Link
                        href={passo.href}
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          textDecoration: 'none',
                        }}
                      >
                        {i + 1}. {passo.titulo}
                      </Link>
                      <p
                        className="texto-secundario"
                        style={{ fontSize: 12, marginTop: 2, lineHeight: 1.45 }}
                      >
                        {passo.texto}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </aside>
        </div>
      </div>
    </>
  );
}

/** Esqueletos com a forma do cartão: o layout não salta ao chegar. */
function Esqueletos() {
  return (
    <div className="projetos__cartoes" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="cartao" style={{ padding: 'var(--e3)' }}>
          <div
            className="esqueleto"
            style={{ aspectRatio: '9 / 16', borderRadius: 'var(--r-controle)' }}
          />
          <div className="esqueleto" style={{ height: 14, marginTop: 'var(--e3)' }} />
          <div className="esqueleto" style={{ height: 12, width: '60%', marginTop: 6 }} />
        </div>
      ))}
    </div>
  );
}

function CartaoDeProjeto({
  projeto,
  onArquivar,
  onExcluir,
  onReprocessar,
}: {
  projeto: Projeto;
  onArquivar: () => void;
  onExcluir: () => void;
  onReprocessar: () => void;
}) {
  // Arquivar só vale fora do processamento; excluir vale sempre.
  const podeArquivar = canTransition(projeto.state as ProjectState, 'ARCHIVED');
  const [menuAberto, setMenuAberto] = useState(false);
  const estado = ROTULO_DE_ESTADO[projeto.state as ProjectState];
  // Todo projeto com vídeo abre no editor, que mostra o andamento do
  // processamento. Antes, só os editáveis iam para lá; o resto abria a
  // câmera em /gravar, mesmo com o vídeo já enviado.
  // Rascunho e vídeos esperando a edição voltam para a lista de vídeos.
  const destino =
    projeto.state === 'DRAFT' || projeto.state === 'UPLOADING'
      ? `/gravar?projeto=${projeto.id}`
      : `/editor?projeto=${projeto.id}`;

  return (
    <article className="cartao" style={{ padding: 'var(--e3)' }}>
      <Link
        href={destino}
        className="projeto__midia"
        style={{ marginBottom: 'var(--e3)', display: 'block' }}
      >
        {projeto.thumbnailUrl ? (
          <img
            src={projeto.thumbnailUrl}
            alt={`Prévia de ${projeto.title}`}
            width={540}
            height={960}
            loading="lazy"
          />
        ) : (
          <span
            style={{
              display: 'grid',
              placeItems: 'center',
              width: '100%',
              height: '100%',
              color: 'var(--text-secondary)',
            }}
          >
            <IconeVideo size={28} />
          </span>
        )}

        <span
          className={`selo selo--${estado.tom}`}
          style={{ position: 'absolute', top: 8, left: 8, fontSize: 11 }}
        >
          <span className="selo__ponto" aria-hidden />
          {estado.texto}
        </span>

        {projeto.durationMs && (
          <span
            style={{
              position: 'absolute',
              bottom: 8,
              left: 8,
              padding: '2px 7px',
              borderRadius: 5,
              background: 'rgb(4 23 53 / 85%)',
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            {formatarDuracao(projeto.durationMs)}
          </span>
        )}
      </Link>

      <div className="linha entre" style={{ gap: 'var(--e2)' }}>
        <div style={{ minWidth: 0 }}>
          <h3
            style={{
              fontSize: 14,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {projeto.title}
          </h3>
          <p className="texto-secundario linha" style={{ fontSize: 12, gap: 4, marginTop: 2 }}>
            <IconeRelogio size={12} />
            {tempoRelativo(projeto.updatedAt)}
          </p>
        </div>

        <span style={{ position: 'relative' }}>
          <button
            type="button"
            className="botao-icone botao-icone--pequeno"
            aria-label={`Mais opções de ${projeto.title}`}
            aria-expanded={menuAberto}
            onClick={() => setMenuAberto((v) => !v)}
          >
            <IconeMenu size={16} />
          </button>

          {menuAberto && (
            <span className="menu">
              {podeArquivar && (
                <button
                  type="button"
                  className="menu__item"
                  onClick={() => {
                    setMenuAberto(false);
                    onArquivar();
                  }}
                >
                  <IconeOlhoFechado size={15} />
                  Arquivar
                </button>
              )}
              <button
                type="button"
                className="menu__item menu__item--perigo"
                onClick={() => {
                  setMenuAberto(false);
                  onExcluir();
                }}
              >
                <IconeLixeira size={15} />
                Excluir
              </button>
            </span>
          )}
        </span>
      </div>

      {/* A falha fica no cartão, não escondida: projeto parado sem
          explicação é o pior estado possível. */}
      {projeto.publicError && (
        <div style={{ marginTop: 'var(--e2)' }}>
          <p
            className="linha"
            style={{ gap: 4, fontSize: 12, color: 'var(--warning)' }}
          >
            <IconeAviso size={13} />
            {projeto.publicError}
          </p>

          {/* O estado já dizia "dá para tentar de novo"; sem este botão
              a frase era só uma descrição de um beco sem saída. */}
          {projeto.state === 'FAILED_RETRYABLE' && (
            <button
              type="button"
              className="botao botao--secundario"
              style={{ marginTop: 'var(--e2)', width: '100%', fontSize: 12 }}
              onClick={(e) => {
                // O cartão inteiro é um link para o editor: sem isto,
                // tentar de novo também navegaria para fora da tela.
                e.preventDefault();
                e.stopPropagation();
                onReprocessar();
              }}
            >
              Tentar de novo
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function formatarDuracao(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)
    .toString()
    .padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
}

/** "há 2 horas" diz mais que uma data completa numa lista de trabalho. */
function tempoRelativo(iso: string): string {
  const minutos = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutos < 1) return 'agora mesmo';
  if (minutos < 60) return `há ${minutos} min`;

  const horas = Math.round(minutos / 60);
  if (horas < 24) return `há ${horas} ${horas === 1 ? 'hora' : 'horas'}`;

  const dias = Math.round(horas / 24);
  if (dias < 30) return `há ${dias} ${dias === 1 ? 'dia' : 'dias'}`;

  return new Date(iso).toLocaleDateString('pt-BR');
}
