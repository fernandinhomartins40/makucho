'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AuthorDto, CategoryDto, MediaDto, PostDto, TagDto } from '@makucho/types';
import { gerarSlug } from '@makucho/validation';
import { ErroApi, painel, pode } from '@/lib/painel';
import { useSessao } from '@/components/painel/sessao';
import { EditorConteudo } from '@/components/painel/editor';
import { CampoImagem } from '@/components/painel/seletor-midia';
import { TituloPagina } from '@/components/painel/moldura-painel';
import {
  Alternador,
  Aviso,
  Botao,
  Campo,
  Carregando,
  Confirmacao,
  Entrada,
  Modal,
  SeloStatus,
  Selecao,
  AreaTexto,
  useRecado,
} from '@/components/painel/ui';

interface Estado {
  title: string;
  slug: string;
  subtitle: string;
  excerpt: string;
  content: unknown;
  categoryId: string;
  authorId: string;
  tagIds: string[];
  coverImage: MediaDto | null;
  ogImage: MediaDto | null;
  videoPlatform: string;
  videoUrl: string;
  isFeatured: boolean;
  isHomepageTop: boolean;
  isTrending: boolean;
  isPinned: boolean;
  seoTitle: string;
  seoDescription: string;
  status: string;
  scheduledFor: string;
}

const VAZIO: Estado = {
  title: '',
  slug: '',
  subtitle: '',
  excerpt: '',
  content: null,
  categoryId: '',
  authorId: '',
  tagIds: [],
  coverImage: null,
  ogImage: null,
  videoPlatform: '',
  videoUrl: '',
  isFeatured: false,
  isHomepageTop: false,
  isTrending: false,
  isPinned: false,
  seoTitle: '',
  seoDescription: '',
  status: 'DRAFT',
  scheduledFor: '',
};

/** Converte ISO para o formato aceito por datetime-local, no fuso local. */
function paraCampoData(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const ajustado = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return ajustado.toISOString().slice(0, 16);
}

export function FormularioPost({ id }: { id?: string }) {
  const router = useRouter();
  const recado = useRecado();
  const { usuario } = useSessao();
  const podePublicar = pode(usuario, 'EDITOR');

  const [dados, setDados] = useState<Estado>(VAZIO);
  const [categorias, setCategorias] = useState<CategoryDto[]>([]);
  const [autores, setAutores] = useState<AuthorDto[]>([]);
  const [tags, setTags] = useState<TagDto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [erroReferencias, setErroReferencias] = useState<string | null>(null);
  const [tentativaPost, setTentativaPost] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [salvoEm, setSalvoEm] = useState<string | null>(null);
  const [autosaveEstado, setAutosaveEstado] = useState<'ocioso' | 'salvando' | 'erro'>('ocioso');
  const [excluindo, setExcluindo] = useState(false);
  const [revisoesAbertas, setRevisoesAbertas] = useState(false);
  const [slugTocado, setSlugTocado] = useState(Boolean(id));

  // O autosave compara com o ultimo estado salvo para nao gravar igual.
  const referencia = useRef<string>('');
  const primeiroRender = useRef(true);
  const filaGravacoes = useRef<Promise<void>>(Promise.resolve());
  const bloqueioManual = useRef(false);
  const estadoAtual = useRef('');
  estadoAtual.current = JSON.stringify(dados);

  const atualizar = useCallback(<K extends keyof Estado>(chave: K, valor: Estado[K]) => {
    setDados((d) => ({ ...d, [chave]: valor }));
  }, []);

  // ---------- carga inicial ----------
  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    setErroCarga(null);

    (async () => {
      const [cats, auts, tgs] = await Promise.all([
        painel.categorias().catch(() => { setErroReferencias('Algumas referências do editor não foram carregadas.'); return []; }),
        painel.autores().catch(() => { setErroReferencias('Algumas referências do editor não foram carregadas.'); return []; }),
        painel.tags().catch(() => { setErroReferencias('Algumas referências do editor não foram carregadas.'); return []; }),
      ]);

      if (!vivo) return;
      setCategorias(cats);
      setAutores(auts);
      setTags(tgs);

      if (id) {
        try {
          const p = await painel.post(id);
          if (!vivo) return;

          const estado: Estado = {
            title: p.title,
            slug: p.slug,
            subtitle: p.subtitle ?? '',
            excerpt: p.excerpt ?? '',
            content: p.content ?? null,
            categoryId: p.category.id,
            authorId: p.author?.id ?? '',
            tagIds: p.tags.map((t) => t.id),
            coverImage: p.coverImage,
            ogImage: p.ogImage,
            videoPlatform: p.videoPlatform ?? '',
            videoUrl: p.videoUrl ?? '',
            isFeatured: p.isFeatured,
            isHomepageTop: p.isHomepageTop,
            isTrending: p.isTrending,
            isPinned: p.isPinned,
            seoTitle: p.seoTitle ?? '',
            seoDescription: p.seoDescription ?? '',
            status: p.status,
            scheduledFor: paraCampoData(p.scheduledFor),
          };
          setDados(estado);
          referencia.current = JSON.stringify(estado);
        } catch (e) {
          setErroCarga(e instanceof ErroApi ? e.message : 'Não foi possível carregar a publicação.');
        }
      } else {
        // Categoria padrao evita um erro bobo de validacao no primeiro save.
        setDados((d) => ({ ...d, categoryId: cats[0]?.id ?? '' }));
      }

      setCarregando(false);
    })();

    return () => {
      vivo = false;
    };
  }, [id, tentativaPost]);

  // O slug acompanha o título até alguém editá-lo à mão.
  useEffect(() => {
    if (!slugTocado && dados.title) {
      setDados((d) => ({ ...d, slug: gerarSlug(d.title) }));
    }
  }, [dados.title, slugTocado]);

  // ---------- corpo enviado à API ----------
  const montarCorpo = useCallback(() => {
    const limpo = (v: string) => (v.trim() ? v.trim() : null);

    return {
      title: dados.title.trim(),
      slug: dados.slug.trim() || undefined,
      subtitle: limpo(dados.subtitle),
      excerpt: limpo(dados.excerpt),
      content: dados.content,
      categoryId: dados.categoryId,
      authorId: dados.authorId || null,
      tagIds: dados.tagIds,
      coverImageId: dados.coverImage?.id ?? null,
      ogImageId: dados.ogImage?.id ?? null,
      videoPlatform: dados.videoPlatform || null,
      videoUrl: limpo(dados.videoUrl),
      isFeatured: dados.isFeatured,
      isHomepageTop: dados.isHomepageTop,
      isTrending: dados.isTrending,
      isPinned: dados.isPinned,
      seoTitle: limpo(dados.seoTitle),
      seoDescription: limpo(dados.seoDescription),
    };
  }, [dados]);

  // ---------- autosave ----------
  useEffect(() => {
    // Só depois de existir um id: autosave precisa de registro no banco.
    if (!id || carregando || salvando) return;

    if (primeiroRender.current) {
      primeiroRender.current = false;
      return;
    }

    const atual = JSON.stringify(dados);
    if (atual === referencia.current) return;

    const t = setTimeout(async () => {
      if (bloqueioManual.current) return;
      setAutosaveEstado('salvando');
      const operacao = filaGravacoes.current.then(() => painel.autosave(id, montarCorpo()));
      filaGravacoes.current = operacao.then(() => undefined, () => undefined);
      try {
        const r = await operacao;
        const estadoSalvo = { ...dados, slug: r.slug };
        referencia.current = JSON.stringify(estadoSalvo);
        if (dados.slug !== r.slug) setDados((vigente) => vigente.slug === dados.slug ? { ...vigente, slug: r.slug } : vigente);
        setSalvoEm(r.updatedAt);
        if (estadoAtual.current === atual) setAutosaveEstado('ocioso');
      } catch {
        setAutosaveEstado('erro');
      }
    }, 2500);

    return () => clearTimeout(t);
  }, [dados, id, carregando, salvando, montarCorpo]);

  // Avisa antes de fechar a aba com alteração pendente.
  useEffect(() => {
    const aoSair = (e: BeforeUnloadEvent) => {
      const alterado = id
        ? JSON.stringify(dados) !== referencia.current
        : JSON.stringify({ ...dados, categoryId: '' }) !== JSON.stringify(VAZIO);
      if (alterado && !carregando) e.preventDefault();
    };
    window.addEventListener('beforeunload', aoSair);
    return () => window.removeEventListener('beforeunload', aoSair);
  }, [dados, carregando, id]);

  // ---------- ações ----------
  async function salvar(novoStatus?: string) {
    if (bloqueioManual.current) return;
    setErro('');
    setCampos({});

    if (!dados.title.trim()) {
      setErro('Informe o título da publicação.');
      return;
    }
    if (!dados.categoryId) {
      setErro('Escolha a categoria.');
      return;
    }

    bloqueioManual.current = true;
    setSalvando(true);
    try {
      const corpo: Record<string, unknown> = { ...montarCorpo() };
      const estadoEnviado = { ...dados, status: novoStatus ?? dados.status };

      if (novoStatus) {
        corpo.status = novoStatus;
        if (novoStatus === 'SCHEDULED') {
          if (!dados.scheduledFor) {
            setErro('Informe a data do agendamento.');
            return;
          }
          const data = new Date(dados.scheduledFor);
          if (!Number.isFinite(data.getTime()) || data.getTime() <= Date.now()) {
            setErro('Escolha uma data futura para o agendamento.');
            return;
          }
          corpo.scheduledFor = data.toISOString();
        }
      }

      await filaGravacoes.current;

      const salvo = id
        ? await painel.atualizarPost(id, corpo)
        : await painel.criarPost({ ...corpo, status: novoStatus ?? 'DRAFT' });

      referencia.current = JSON.stringify({ ...estadoEnviado, slug: salvo.slug, status: salvo.status });
      setSalvoEm(salvo.updatedAt);
      setAutosaveEstado('ocioso');

      setDados((vigente) => ({
        ...vigente,
        slug: vigente.slug === estadoEnviado.slug ? salvo.slug : vigente.slug,
        status: novoStatus ? salvo.status : vigente.status,
      }));
      recado.ok(novoStatus === 'PUBLISHED' ? 'Publicado.' : novoStatus === 'REVIEW' ? 'Enviado para revisão.' : novoStatus === 'SCHEDULED' ? 'Publicação agendada.' : 'Alterações salvas.');

      if (!id) router.replace(`/painel/publicacoes/${salvo.id}`);
    } catch (e) {
      if (e instanceof ErroApi) {
        setErro(e.message);
        if (e.fields) setCampos(e.fields);
      } else {
        setErro('Não foi possível salvar agora.');
      }
    } finally {
      bloqueioManual.current = false;
      setSalvando(false);
    }
  }

  async function excluir() {
    if (!id) return;
    try {
      await painel.excluirPost(id);
      router.replace('/painel/publicacoes');
    } catch (e) {
      recado.erro(e instanceof ErroApi ? e.message : 'Não foi possível excluir.');
      setExcluindo(false);
    }
  }

  async function tentarReferencias() {
    setErroReferencias(null);
    const [cats, auts, tgs] = await Promise.allSettled([
      painel.categorias(), painel.autores(), painel.tags(),
    ]);
    if (cats.status === 'fulfilled') {
      setCategorias(cats.value);
      if (!id) setDados((atual) => atual.categoryId ? atual : { ...atual, categoryId: cats.value[0]?.id ?? '' });
    }
    if (auts.status === 'fulfilled') setAutores(auts.value);
    if (tgs.status === 'fulfilled') setTags(tgs.value);
    if ([cats, auts, tgs].some((resultado) => resultado.status === 'rejected')) {
      setErroReferencias('Algumas referências do editor não foram carregadas.');
    }
  }

  if (carregando) return <Carregando texto="Carregando a publicação…" />;
  if (erroCarga) return <div className="pn-bloco pn-erro-lista"><Aviso tipo="erro">{erroCarga}</Aviso><Botao variante="neutro" onClick={() => setTentativaPost((valor) => valor + 1)}>Tentar novamente</Botao></div>;

  const publicado = dados.status === 'PUBLISHED';

  return (
    <>
      <TituloPagina
        titulo={id ? 'Editar publicação' : 'Nova publicação'}
        descricao={
          autosaveEstado === 'salvando' ? 'Salvando automaticamente…' : autosaveEstado === 'erro' ? 'Salvamento automático falhou; use Salvar para tentar novamente.' : id && estadoAtual.current !== referencia.current ? 'Alterações ainda não salvas' : salvoEm
            ? `Salvo às ${new Date(salvoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
            : undefined
        }
        acoes={
          <>
            <SeloStatus status={dados.status} />
            {id && (
              <Botao variante="fantasma" onClick={() => setRevisoesAbertas(true)}>
                Revisões
              </Botao>
            )}
            {publicado && (
              <a href={`/artigo/${dados.slug}`} target="_blank" rel="noopener noreferrer" className="pn-botao pn-botao-fantasma">Ver no site</a>
            )}
            <Botao variante="neutro" carregando={salvando} onClick={() => void salvar()}>
              Salvar
            </Botao>
            {!publicado && podePublicar ? (
              <Botao variante="primario" carregando={salvando} onClick={() => void salvar('PUBLISHED')}>
                Publicar
              </Botao>
            ) : !publicado ? (
              <Botao variante="primario" carregando={salvando} onClick={() => void salvar('REVIEW')}>
                Enviar para revisão
              </Botao>
            ) : (
              <Botao variante="neutro" carregando={salvando} onClick={() => void salvar('DRAFT')}>
                Despublicar
              </Botao>
            )}
          </>
        }
      />

      <Aviso tipo="erro">{erro}</Aviso>
      {erroReferencias && <div className="pn-erro-lista"><Aviso tipo="erro">{erroReferencias} O texto em edição foi preservado.</Aviso><Botao variante="neutro" onClick={() => void tentarReferencias()}>Tentar novamente</Botao></div>}

      <div className="pn-editor-grade">
        {/* ---------- coluna principal ---------- */}
        <div>
          <div className="pn-bloco">
            <Campo rotulo="Título" obrigatorio erro={campos.title}>
              <Entrada
                value={dados.title}
                onChange={(e) => atualizar('title', e.target.value)}
                placeholder="Copom mantém a Selic e sinaliza cautela"
                maxLength={255}
                autoFocus={!id}
              />
            </Campo>

            <Campo
              rotulo="Endereço (slug)"
              erro={campos.slug}
              dica={`makucho.com.br/artigo/${dados.slug || '…'}`}
            >
              <Entrada
                value={dados.slug}
                onChange={(e) => {
                  setSlugTocado(true);
                  atualizar('slug', e.target.value);
                }}
                placeholder="gerado a partir do título"
              />
            </Campo>

            <Campo rotulo="Subtítulo" erro={campos.subtitle}>
              <Entrada
                value={dados.subtitle}
                onChange={(e) => atualizar('subtitle', e.target.value)}
                maxLength={320}
              />
            </Campo>

            <Campo
              rotulo="Resumo"
              erro={campos.excerpt}
              dica="Aparece nos cards e nas buscas. Até 600 caracteres."
            >
              <AreaTexto
                value={dados.excerpt}
                onChange={(e) => atualizar('excerpt', e.target.value)}
                maxLength={600}
              />
            </Campo>
          </div>

          <div className="pn-bloco">
            <h2 className="pn-bloco-h2">Conteúdo</h2>
            <EditorConteudo
              valor={dados.content}
              aoMudar={(doc) => atualizar('content', doc)}
            />
          </div>

          <details className="pn-bloco pn-detalhes">
            <summary>SEO e compartilhamento</summary>

            <Campo
              rotulo="Título para buscadores"
              dica="Deixe vazio para usar o título da publicação."
              erro={campos.seoTitle}
            >
              <Entrada
                value={dados.seoTitle}
                onChange={(e) => atualizar('seoTitle', e.target.value)}
                maxLength={200}
              />
            </Campo>

            <Campo
              rotulo="Descrição para buscadores"
              dica="Deixe vazio para usar o resumo."
              erro={campos.seoDescription}
            >
              <AreaTexto
                value={dados.seoDescription}
                onChange={(e) => atualizar('seoDescription', e.target.value)}
                maxLength={320}
              />
            </Campo>

            <CampoImagem
              rotulo="Imagem de compartilhamento"
              midia={dados.ogImage}
              aoMudar={(m) => atualizar('ogImage', m)}
              dica="Usada no WhatsApp e nas redes. Sem ela, vale a capa."
            />
          </details>
        </div>

        {/* ---------- coluna lateral ---------- */}
        <aside className="pn-editor-lado">
          <div className="pn-bloco">
            <h2 className="pn-bloco-h2">Publicação</h2>

            <Campo rotulo="Categoria" obrigatorio erro={campos.categoryId}>
              <Selecao
                value={dados.categoryId}
                onChange={(e) => atualizar('categoryId', e.target.value)}
              >
                <option value="">Escolha…</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Selecao>
            </Campo>

            <Campo rotulo="Autor" erro={campos.authorId}>
              <Selecao
                value={dados.authorId}
                onChange={(e) => atualizar('authorId', e.target.value)}
              >
                <option value="">Sem autor</option>
                {autores.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Selecao>
            </Campo>

            {podePublicar && (
              <Campo rotulo="Agendar para" erro={campos.scheduledFor}>
                <Entrada
                  type="datetime-local"
                  value={dados.scheduledFor}
                  onChange={(e) => atualizar('scheduledFor', e.target.value)}
                />
              </Campo>
            )}

            {podePublicar && dados.scheduledFor && dados.status !== 'SCHEDULED' && (
              <Botao
                variante="neutro"
                className="pn-largo"
                carregando={salvando}
                onClick={() => void salvar('SCHEDULED')}
              >
                Agendar publicação
              </Botao>
            )}
          </div>

          <div className="pn-bloco">
            <CampoImagem
              rotulo="Imagem de capa"
              midia={dados.coverImage}
              aoMudar={(m) => atualizar('coverImage', m)}
            />
          </div>

          <div className="pn-bloco">
            <h2 className="pn-bloco-h2">Tags</h2>
            <div className="pn-tags">
              {tags.length === 0 && <small className="pn-dica">Nenhuma tag cadastrada.</small>}
              {tags.map((t) => {
                const marcada = dados.tagIds.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={`pn-tag ${marcada ? 'pn-tag-on' : ''}`}
                    aria-pressed={marcada}
                    onClick={() =>
                      atualizar(
                        'tagIds',
                        marcada
                          ? dados.tagIds.filter((x) => x !== t.id)
                          : // O backend recusa acima de 20.
                            [...dados.tagIds, t.id].slice(0, 20),
                      )
                    }
                  >
                    {t.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pn-bloco">
            <h2 className="pn-bloco-h2">Vídeo</h2>

            <Campo rotulo="Plataforma" erro={campos.videoPlatform}>
              <Selecao
                value={dados.videoPlatform}
                onChange={(e) => atualizar('videoPlatform', e.target.value)}
              >
                <option value="">Sem vídeo</option>
                <option value="YOUTUBE">YouTube</option>
                <option value="INSTAGRAM">Instagram</option>
                <option value="TIKTOK">TikTok</option>
              </Selecao>
            </Campo>

            {dados.videoPlatform && (
              <Campo
                rotulo="Endereço do vídeo"
                erro={campos.videoUrl}
                dica="Gera o botão “Assistir no…” no card."
              >
                <Entrada
                  value={dados.videoUrl}
                  onChange={(e) => atualizar('videoUrl', e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=…"
                />
              </Campo>
            )}
          </div>

          <div className="pn-bloco">
            <h2 className="pn-bloco-h2">Destaques</h2>
            <Alternador
              marcado={dados.isHomepageTop}
              aoMudar={(v) => atualizar('isHomepageTop', v)}
              rotulo="Manchete principal"
              descricao="Ocupa o destaque grande do topo da home."
            />
            <Alternador
              marcado={dados.isFeatured}
              aoMudar={(v) => atualizar('isFeatured', v)}
              rotulo="Em destaque"
            />
            <Alternador
              marcado={dados.isTrending}
              aoMudar={(v) => atualizar('isTrending', v)}
              rotulo="Em alta"
            />
            <Alternador
              marcado={dados.isPinned}
              aoMudar={(v) => atualizar('isPinned', v)}
              rotulo="Fixar no topo das listas"
            />
          </div>

          {id && (
            <div className="pn-bloco">
              <Botao variante="perigo" className="pn-largo" onClick={() => setExcluindo(true)}>
                Excluir publicação
              </Botao>
            </div>
          )}
        </aside>
      </div>

      <Confirmacao
        aberto={excluindo}
        titulo="Excluir publicação"
        mensagem="A publicação será removida do site. Esta ação não pode ser desfeita."
        aoConfirmar={excluir}
        aoCancelar={() => setExcluindo(false)}
      />

      {id && (
        <Revisoes
          id={id}
          aberto={revisoesAbertas}
          alteracoesPendentes={JSON.stringify(dados) !== referencia.current || salvando || autosaveEstado === 'salvando'}
          aoFechar={() => setRevisoesAbertas(false)}
          aoRestaurar={() => {
            setRevisoesAbertas(false);
            router.refresh();
            window.location.reload();
          }}
        />
      )}

      {recado.elemento}
    </>
  );
}

// ============================================================
// REVISOES
// ============================================================

function Revisoes({
  id,
  aberto,
  alteracoesPendentes,
  aoFechar,
  aoRestaurar,
}: {
  id: string;
  aberto: boolean;
  alteracoesPendentes: boolean;
  aoFechar: () => void;
  aoRestaurar: () => void;
}) {
  const [itens, setItens] = useState<
    Array<{ id: string; createdAt: string; title: string; authorName: string | null }>
  >([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [restaurando, setRestaurando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setItens(await painel.revisoes(id));
    } catch (falha) {
      setErro(falha instanceof ErroApi ? falha.message : 'Não foi possível carregar as revisões.');
    } finally {
      setCarregando(false);
    }
  }, [id]);

  useEffect(() => { if (aberto) void carregar(); }, [aberto, carregar]);

  return (
    <Modal titulo="Revisões" aberto={aberto} aoFechar={() => { if (!restaurando) aoFechar(); }} largura={540}>
      {alteracoesPendentes && <Aviso tipo="info">Salve as alterações atuais antes de restaurar uma revisão.</Aviso>}
      {erro && <div className="pn-erro-lista"><Aviso tipo="erro">{erro}</Aviso><Botao variante="neutro" onClick={() => void carregar()}>Tentar novamente</Botao></div>}
      {carregando ? (
        <Carregando />
      ) : erro && itens.length === 0 ? null : itens.length === 0 ? (
        <p className="pn-dica">Ainda não há revisões guardadas desta publicação.</p>
      ) : (
        <ul className="pn-lista-simples">
          {itens.map((r) => (
            <li key={r.id}>
              <div style={{ flex: 1 }}>
                <span className="pn-lista-titulo">{r.title}</span>
                <span className="pn-lista-meta">
                  {new Date(r.createdAt).toLocaleString('pt-BR')}
                  {r.authorName && ` · ${r.authorName}`}
                </span>
              </div>
              <Botao
                variante="neutro"
                carregando={restaurando}
                disabled={alteracoesPendentes}
                onClick={async () => {
                  setRestaurando(true);
                  setErro(null);
                  try {
                    await painel.restaurarRevisao(id, r.id);
                    aoRestaurar();
                  } catch (falha) {
                    setErro(falha instanceof ErroApi ? falha.message : 'Não foi possível restaurar a revisão.');
                  } finally {
                    setRestaurando(false);
                  }
                }}
              >
                Restaurar
              </Botao>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
