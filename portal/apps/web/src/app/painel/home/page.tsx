'use client';

import { useEffect, useState } from 'react';
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
  LATEST_POSTS: { rotulo: 'Últimas publicações', descricao: 'Os artigos mais recentes.' },
  TRENDING: { rotulo: 'Em alta', descricao: 'Artigos marcados como “em alta”.' },
  VIDEOS: { rotulo: 'Vídeos', descricao: 'Grade com os vídeos publicados.' },
  CATEGORIES: { rotulo: 'Editorias', descricao: 'Atalhos para as categorias.' },
  MOST_READ: { rotulo: 'Mais lidas', descricao: 'Ranking por número de leituras.' },
  NEWSLETTER: { rotulo: 'Newsletter', descricao: 'Formulário de inscrição.' },
  AD_SLOT: { rotulo: 'Espaço de anúncio', descricao: 'Faixa publicitária.' },
  CUSTOM_POSTS: { rotulo: 'Seleção manual', descricao: 'Artigos escolhidos a dedo.' },
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

  async function carregar() {
    setCarregando(true);
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
        titulo="Montagem da home"
        descricao="A ordem destas seções é a ordem da página inicial do site."
        acoes={
          <>
            <a href="/" target="_blank" rel="noopener noreferrer">
              <Botao variante="fantasma">Ver a home</Botao>
            </a>
            <Botao variante="primario" onClick={() => abrir()}>
              + Nova seção
            </Botao>
          </>
        }
      />

      <div className="pn-bloco">
        {carregando ? (
          <Carregando />
        ) : secoes.length === 0 ? (
          <Vazio
            titulo="Nenhuma seção"
            descricao="Monte a home adicionando as seções na ordem que quiser."
            acao={
              <Botao variante="primario" onClick={() => abrir()}>
                + Nova seção
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
                  <strong>{s.title || TIPOS[s.type].rotulo}</strong>
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
                  <Botao variante="fantasma" onClick={() => setExcluir(s)}>
                    Excluir
                  </Botao>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal
        titulo={form?.id ? 'Editar seção' : 'Nova seção'}
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
                  {form.type === 'VIDEOS' ? 'Escolher vídeos' : 'Escolher publicações'}
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
        titulo="Excluir seção"
        mensagem="A seção sai da home. Os artigos e vídeos continuam publicados."
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

export default function PaginaHome() {
  return (
    <MolduraPainel>
      <Home />
    </MolduraPainel>
  );
}
