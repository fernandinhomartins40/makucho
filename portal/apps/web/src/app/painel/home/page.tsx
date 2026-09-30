'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { HomepageSectionAdminDto, HomepageSectionType, PostSummaryDto, VideoDto } from '@makucho/types';
import { AD_PLACEMENTS } from '@makucho/types';
import { ErroApi, painel } from '@/lib/painel';
import { MolduraPainel, TituloPagina } from '@/components/painel/moldura-painel';
import {
  Alternador,
  Aviso,
  Botao,
  Campo,
  Carregando,
  Confirmacao,
  Entrada,
  Modal,
  Selecao,
  Vazio,
  useRecado,
} from '@/components/painel/ui';

/** Cada tipo explica o que renderiza, para a escolha não ser adivinhação. */
const TIPOS: Record<HomepageSectionType, { rotulo: string; descricao: string }> = {
  HERO: { rotulo: 'Destaque principal', descricao: 'O bloco grande do topo, com a manchete.' },
  LATEST_POSTS: { rotulo: 'Últimas matérias', descricao: 'As matérias mais recentes.' },
  TRENDING: { rotulo: 'Em alta', descricao: 'Matérias marcadas como “em alta”.' },
  VIDEOS: { rotulo: 'Vídeos', descricao: 'Grade com os vídeos publicados.' },
  CATEGORIES: { rotulo: 'Editorias', descricao: 'Atalhos para as editorias do site.' },
  MOST_READ: { rotulo: 'Mais lidas', descricao: 'Ranking por número de leituras.' },
  NEWSLETTER: { rotulo: 'Newsletter', descricao: 'Formulário de inscrição.' },
  AD_SLOT: { rotulo: 'Espaço de anúncio', descricao: 'Faixa publicitária.' },
  CUSTOM_POSTS: { rotulo: 'Seleção manual', descricao: 'Matérias escolhidas a dedo.' },
};

interface Formulario {
  id?: string;
  type: HomepageSectionType;
  title: string;
  subtitle: string;
  isVisible: boolean;
  limite: string;
  config: Record<string, unknown>;
  selecionados: Array<{ id: string; title: string }>;
}

function Home() {
  const recado = useRecado();
  const [secoes, setSecoes] = useState<HomepageSectionAdminDto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [form, setForm] = useState<Formulario | null>(null);
  const [excluir, setExcluir] = useState<HomepageSectionAdminDto | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [opcoes, setOpcoes] = useState<Array<{ id: string; title: string }>>([]);
  const [buscando, setBuscando] = useState(false);
  // O que está no topo agora: a manchete e os destaques marcados nas matérias.
  const [manchete, setManchete] = useState<PostSummaryDto | null>(null);
  const [destaques, setDestaques] = useState<PostSummaryDto[]>([]);

  async function carregar() {
    setCarregando(true);
    void Promise.allSettled([
      painel.posts({ status: 'PUBLISHED', isHomepageTop: true, perPage: 1 }),
      painel.posts({ status: 'PUBLISHED', isFeatured: true, perPage: 6 }),
    ]).then(([m, d]) => {
      setManchete(m.status === 'fulfilled' ? m.value.data[0] ?? null : null);
      setDestaques(d.status === 'fulfilled' ? d.value.data : []);
    });
    try {
      const s = await painel.secoesHome();
      setSecoes([...s].sort((a, b) => a.position - b.position));
    } catch (e) {
      recado.erro(e instanceof ErroApi ? e.message : 'Não foi possível carregar as seções.');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function mover(indice: number, direcao: -1 | 1) {
    const destino = indice + direcao;
    if (destino < 0 || destino >= secoes.length) return;

    const atual = secoes[indice];
    const outro = secoes[destino];
    if (!atual || !outro) return;

    const novas = [...secoes];
    novas[indice] = outro;
    novas[destino] = atual;
    setSecoes(novas);

    try {
      await painel.reordenarSecoes(novas.map((s, i) => ({ id: s.id, position: i })));
    } catch (e) {
      recado.erro(e instanceof ErroApi ? e.message : 'Não foi possível reordenar.');
      void carregar();
    }
  }

  /** A visibilidade é o botão mais usado: alterna direto na lista. */
  async function alternarVisivel(s: HomepageSectionAdminDto) {
    setSecoes((atuais) =>
      atuais.map((x) => (x.id === s.id ? { ...x, isVisible: !x.isVisible } : x)),
    );
    try {
      await painel.atualizarSecao(s.id, { isVisible: !s.isVisible });
    } catch (e) {
      recado.erro(e instanceof ErroApi ? e.message : 'Não foi possível salvar.');
      void carregar();
    }
  }

  function abrir(s?: HomepageSectionAdminDto) {
    setErro('');
    setBusca('');
    setOpcoes([]);
    setForm(
      s
        ? {
            id: s.id,
            type: s.type,
            title: s.title ?? '',
            subtitle: s.subtitle ?? '',
            isVisible: s.isVisible,
            limite: String((s.config?.limit as number) ?? ''),
            config: s.config ?? {},
            selecionados: s.items.map((item) => item.post ?? item.video).filter((item): item is { id: string; title: string; slug: string } => Boolean(item)).map((item) => ({ id: item.id, title: item.title })),
          }
        : {
            type: 'LATEST_POSTS',
            title: '',
            subtitle: '',
            isVisible: true,
            limite: '',
            config: {},
            selecionados: [],
          },
    );
  }

  const tipoBusca = form?.type;
  const secaoEmEdicao = form?.id;

  useEffect(() => {
    if (!tipoBusca || !['HERO', 'CUSTOM_POSTS', 'VIDEOS'].includes(tipoBusca)) return;
    let vivo = true;
    const timer = setTimeout(async () => {
      setBuscando(true);
      try {
        const resultado = tipoBusca === 'VIDEOS'
          ? await painel.videos({ page: 1, perPage: 30, search: busca || undefined })
          : await painel.posts({ page: 1, perPage: 30, search: busca || undefined, status: 'PUBLISHED' });
        if (vivo) setOpcoes(resultado.data.map((item: PostSummaryDto | VideoDto) => ({ id: item.id, title: item.title })));
      } catch {
        if (vivo) setErro('Não foi possível buscar conteúdos. Tente novamente.');
      } finally {
        if (vivo) setBuscando(false);
      }
    }, 250);
    return () => { vivo = false; clearTimeout(timer); };
  }, [tipoBusca, busca, secaoEmEdicao]);

  function alternarSelecao(item: { id: string; title: string }) {
    setForm((atual) => atual ? {
      ...atual,
      selecionados: atual.selecionados.some((x) => x.id === item.id)
        ? atual.selecionados.filter((x) => x.id !== item.id)
        : [...atual.selecionados, item],
    } : null);
  }

  async function salvar() {
    if (!form) return;
    setErro('');
    setSalvando(true);

    try {
      const limite = Number(form.limite);
      const config = { ...form.config };
      if (Number.isFinite(limite) && limite > 0) config.limit = limite;
      else delete config.limit;
      const corpo = {
        type: form.type,
        title: form.title.trim() || null,
        subtitle: form.subtitle.trim() || null,
        isVisible: form.isVisible,
        config: Object.keys(config).length ? config : null,
        ...(['HERO', 'CUSTOM_POSTS'].includes(form.type)
          ? { postIds: form.selecionados.map((item) => item.id) }
          : form.type === 'VIDEOS'
            ? { videoIds: form.selecionados.map((item) => item.id) }
            : {}),
        position: form.id
          ? secoes.find((s) => s.id === form.id)?.position ?? 0
          : secoes.length,
      };

      if (form.id) await painel.atualizarSecao(form.id, corpo);
      else await painel.criarSecao(corpo);

      recado.ok(form.id ? 'Seção atualizada.' : 'Seção criada.');
      setForm(null);
      void carregar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <TituloPagina
        titulo="Página inicial"
        descricao="Os blocos da capa do site, de cima para baixo. Mude a ordem, ligue ou desligue cada um."
        acoes={
          <>
            <a href="/" target="_blank" rel="noopener noreferrer">
              <Botao variante="fantasma">Ver a home</Botao>
            </a>
            <Botao variante="primario" onClick={() => abrir()}>
              + Novo bloco
            </Botao>
          </>
        }
      />

      {/* O topo da página inicial vem das matérias: aqui a pessoa vê o que está lá e onde mudar. */}
      <section className="pn-bloco pn-home-topo" aria-labelledby="home-topo">
        <header className="pn-bloco-topo">
          <h2 id="home-topo">No topo agora</h2>
          <small className="pn-suave">Escolhido em cada matéria, no passo “Onde aparece”.</small>
        </header>
        <div className="pn-home-topo-grade">
          <div>
            <span className="pn-rotulo">Manchete principal</span>
            {manchete ? (
              <Link href={`/painel/publicacoes/${manchete.id}`} className="pn-home-manchete">
                <strong>{manchete.title}</strong>
                <small>{manchete.category.name} · trocar na matéria</small>
              </Link>
            ) : (
              <p className="pn-suave">Nenhuma matéria marcada como manchete: o topo mostra a seleção do bloco “Destaque principal” ou as matérias em destaque.</p>
            )}
          </div>
          <div>
            <span className="pn-rotulo">Em destaque ({destaques.length})</span>
            {destaques.length ? (
              <ul className="pn-home-destaques">
                {destaques.map((p) => (
                  <li key={p.id}>
                    <Link href={`/painel/publicacoes/${p.id}`}>{p.title}</Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="pn-suave">Nenhuma matéria em destaque.</p>
            )}
          </div>
        </div>
      </section>

      <div className="pn-home-grade">
      <div className="pn-bloco">
        {carregando ? (
          <Carregando />
        ) : secoes.length === 0 ? (
          <Vazio
            titulo="Nenhum bloco"
            descricao="Monte a home adicionando as seções na ordem que quiser."
            acao={
              <Botao variante="primario" onClick={() => abrir()}>
                + Novo bloco
              </Botao>
            }
          />
        ) : (
          <ul className="pn-secoes">
            {secoes.map((s, i) => (
              <li key={s.id} className={s.isVisible ? '' : 'pn-secao-oculta'}>
                <div className="pn-secao-ordem">
                  <button
                    type="button"
                    className="pn-mover"
                    onClick={() => void mover(i, -1)}
                    disabled={i === 0}
                    aria-label="Mover para cima"
                  >
                    ↑
                  </button>
                  <span>{i + 1}</span>
                  <button
                    type="button"
                    className="pn-mover"
                    onClick={() => void mover(i, 1)}
                    disabled={i === secoes.length - 1}
                    aria-label="Mover para baixo"
                  >
                    ↓
                  </button>
                </div>

                <div className="pn-secao-corpo">
                  <strong>
                    {s.title || TIPOS[s.type].rotulo}
                    {!s.isVisible && <span className="pn-secao-selo">Oculta na home</span>}
                  </strong>
                  <small>
                    {TIPOS[s.type].descricao}
                    {s.config?.limit ? ` · ${String(s.config.limit)} itens` : ''}
                  </small>
                </div>

                <div className="pn-acoes">
                  <Botao variante="fantasma" onClick={() => void alternarVisivel(s)}>
                    {s.isVisible ? 'Ocultar' : 'Mostrar'}
                  </Botao>
                  <Botao variante="fantasma" onClick={() => abrir(s)}>
                    Editar
                  </Botao>
                  <Botao variante="perigo-suave" onClick={() => setExcluir(s)}>
                    Excluir
                  </Botao>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <aside className="pn-bloco pn-home-esboco" aria-label="Como a página inicial fica">
        <h2 className="pn-bloco-h2">Como fica</h2>
        <p className="pn-dica-bloco">De cima para baixo, só os blocos visíveis. Toque num bloco para editar.</p>
        <div className="pn-esboco-tela">
          <div className="pn-esboco-cabecalho" aria-hidden="true" />
          {secoes.filter((s) => s.isVisible).map((s) => (
            <button key={s.id} type="button" className="pn-esboco-bloco" data-tipo={s.type} onClick={() => abrir(s)} title={`Editar: ${s.title || TIPOS[s.type].rotulo}`}>
              <span className="pn-esboco-nome">{s.title || TIPOS[s.type].rotulo}</span>
              <EsbocoDoTipo tipo={s.type} />
            </button>
          ))}
          {secoes.every((s) => !s.isVisible) && <p className="pn-suave">Nenhum bloco visível: a página inicial fica vazia.</p>}
        </div>
      </aside>
      </div>

      <Modal
        titulo={form?.id ? 'Editar bloco' : 'Novo bloco da página inicial'}
        aberto={form !== null}
        aoFechar={() => setForm(null)}
        rodape={
          <>
            <Botao variante="fantasma" onClick={() => setForm(null)}>
              Cancelar
            </Botao>
            <Botao variante="primario" carregando={salvando} onClick={salvar}>
              Salvar
            </Botao>
          </>
        }
      >
        {form && (
          <>
            <Aviso tipo="erro">{erro}</Aviso>

            {!form.id && (
              <div className="pn-campo">
                <span className="pn-rotulo">Que bloco?</span>
                <div className="pn-cartoes-escolha" role="radiogroup" aria-label="Tipo do bloco">
                  {(Object.keys(TIPOS) as HomepageSectionType[]).map((t) => (
                    <button key={t} type="button" role="radio" aria-checked={form.type === t} onClick={() => setForm({ ...form, type: t })}>
                      <strong>{TIPOS[t].rotulo}</strong>
                      <small>{TIPOS[t].descricao}</small>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {form.id && (
            <Campo rotulo="Tipo" obrigatorio dica={TIPOS[form.type].descricao}>
              <Selecao
                value={form.type}
                onChange={(e) =>
                  setForm({ ...form, type: e.target.value as HomepageSectionType })
                }
                // Trocar o tipo de uma seção existente mudaria o que ela
                // renderiza sem aviso; melhor criar outra.
                disabled={Boolean(form.id)}
              >
                {(Object.keys(TIPOS) as HomepageSectionType[]).map((t) => (
                  <option key={t} value={t}>
                    {TIPOS[t].rotulo}
                  </option>
                ))}
              </Selecao>
            </Campo>
            )}

            <Campo
              rotulo="Título exibido"
              dica="Deixe vazio para usar o nome padrão do tipo."
            >
              <Entrada
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                maxLength={160}
                placeholder={TIPOS[form.type].rotulo}
              />
            </Campo>

            <Campo rotulo="Subtítulo">
              <Entrada
                value={form.subtitle}
                onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
                maxLength={320}
              />
            </Campo>

            <Campo rotulo="Quantidade de itens" dica="Deixe vazio para usar o padrão.">
              <Entrada
                type="number"
                min={1}
                max={24}
                value={form.limite}
                onChange={(e) => setForm({ ...form, limite: e.target.value })}
              />
            </Campo>

            {form.type === 'AD_SLOT' && (
              <Campo rotulo="Posição do anúncio" dica="A campanha também precisa estar vinculada a esta posição no cadastro de anúncios.">
                <Selecao
                  value={typeof form.config.placement === 'string' ? form.config.placement : 'HOME_MIDDLE'}
                  onChange={(e) => setForm({ ...form, config: { ...form.config, placement: e.target.value } })}
                >
                  {AD_PLACEMENTS.filter((item) => item.startsWith('HOME_')).map((item) => (
                    <option key={item} value={item}>{item === 'HOME_TOP' ? 'Topo' : item === 'HOME_AFTER_HERO' ? 'Após o destaque' : 'Meio da página'}</option>
                  ))}
                </Selecao>
              </Campo>
            )}

            {['HERO', 'CUSTOM_POSTS', 'VIDEOS'].includes(form.type) && (
              <div className="pn-escolha-home">
                <label htmlFor="busca-conteudo-home" className="pn-rotulo">
                  {form.type === 'VIDEOS' ? 'Escolher vídeos' : 'Escolher matérias'}
                </label>
                <Entrada
                  id="busca-conteudo-home"
                  type="search"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar pelo título"
                />
                <small className="pn-dica">Selecionados aparecem primeiro na ordem escolhida. Sem seleção, a seção usa o conteúdo recente.</small>
                {form.selecionados.length > 0 && (
                  <ol className="pn-escolhidos">
                    {form.selecionados.map((item) => (
                      <li key={item.id}>
                        <span>{item.title}</span>
                        <button type="button" className="pn-link" onClick={() => alternarSelecao(item)} aria-label={`Remover ${item.title}`}>Remover</button>
                      </li>
                    ))}
                  </ol>
                )}
                <div className="pn-opcoes-home" role="group" aria-label="Resultados de conteúdo">
                  {buscando ? <Carregando texto="Buscando conteúdos…" /> : opcoes.filter((item) => !form.selecionados.some((x) => x.id === item.id)).map((item) => (
                    <button type="button" key={item.id} onClick={() => alternarSelecao(item)}>+ {item.title}</button>
                  ))}
                </div>
              </div>
            )}

            <Alternador
              marcado={form.isVisible}
              aoMudar={(v) => setForm({ ...form, isVisible: v })}
              rotulo="Visível no site"
            />
          </>
        )}
      </Modal>

      <Confirmacao
        aberto={excluir !== null}
        titulo="Excluir bloco"
        mensagem="O bloco sai da página inicial. As matérias e os vídeos continuam publicados."
        aoConfirmar={async () => {
          if (!excluir) return;
          try {
            await painel.excluirSecao(excluir.id);
            recado.ok('Seção excluída.');
            setExcluir(null);
            void carregar();
          } catch (e) {
            recado.erro(e instanceof ErroApi ? e.message : 'Não foi possível excluir.');
          }
        }}
        aoCancelar={() => setExcluir(null)}
      />

      {recado.elemento}
    </>
  );
}

/** Um esboço de cada tipo de bloco (não é a página: é o formato, para achar o bloco). */
function EsbocoDoTipo({ tipo }: { tipo: HomepageSectionType }) {
  const n = (q: number) => Array.from({ length: q }, (_, i) => <i key={i} />);
  switch (tipo) {
    case 'HERO':
      return <span className="pn-esboco-hero" aria-hidden="true"><i /><b /><b /></span>;
    case 'LATEST_POSTS':
    case 'CUSTOM_POSTS':
    case 'TRENDING':
      return <span className="pn-esboco-cartoes" aria-hidden="true">{n(3)}</span>;
    case 'VIDEOS':
      return <span className="pn-esboco-cartoes pn-esboco-videos" aria-hidden="true">{n(3)}</span>;
    case 'MOST_READ':
      return <span className="pn-esboco-lista" aria-hidden="true">{n(4)}</span>;
    case 'CATEGORIES':
      return <span className="pn-esboco-chips" aria-hidden="true">{n(5)}</span>;
    case 'NEWSLETTER':
      return <span className="pn-esboco-news" aria-hidden="true"><i /><b /></span>;
    case 'AD_SLOT':
      return <span className="pn-esboco-anuncio" aria-hidden="true">anúncio</span>;
    default:
      return null;
  }
}

export default function PaginaHome() {
  return (
    <MolduraPainel>
      <Home />
    </MolduraPainel>
  );
}
