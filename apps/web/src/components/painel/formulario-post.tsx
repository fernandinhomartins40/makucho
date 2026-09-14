'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AuthorDto, CategoryDto, MediaDto, PostDto, TagDto } from '@makucho/types';
import { gerarSlug } from '@makucho/validation';
import { ErroApi, painel } from '@/lib/painel';
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

  const [dados, setDados] = useState<Estado>(VAZIO);
  const [categorias, setCategorias] = useState<CategoryDto[]>([]);
  const [autores, setAutores] = useState<AuthorDto[]>([]);
  const [tags, setTags] = useState<TagDto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [salvoEm, setSalvoEm] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [revisoesAbertas, setRevisoesAbertas] = useState(false);
  const [slugTocado, setSlugTocado] = useState(Boolean(id));

  // O autosave compara com o ultimo estado salvo para nao gravar igual.
  const referencia = useRef<string>('');
  const primeiroRender = useRef(true);

  const atualizar = useCallback(<K extends keyof Estado>(chave: K, valor: Estado[K]) => {
    setDados((d) => ({ ...d, [chave]: valor }));
  }, []);

  // ---------- carga inicial ----------
  useEffect(() => {
    let vivo = true;

    (async () => {
      const [cats, auts, tgs] = await Promise.all([
        painel.categorias().catch(() => []),
        painel.autores().catch(() => []),
        painel.tags().catch(() => []),
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
          setErro(e instanceof ErroApi ? e.message : 'Não foi possível carregar a publicação.');
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
  }, [id]);

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
    if (!id || carregando) return;

    if (primeiroRender.current) {
      primeiroRender.current = false;
      return;
    }

    const atual = JSON.stringify(dados);
    if (atual === referencia.current) return;

    const t = setTimeout(async () => {
      try {
        const r = await painel.autosave(id, montarCorpo());
        referencia.current = atual;
        setSalvoEm(r.savedAt ?? new Date().toISOString());
      } catch {
        // Silencioso de proposito: o autosave nao pode interromper a
        // escrita. O salvamento explicito mostra o erro.
      }
    }, 2500);

    return () => clearTimeout(t);
  }, [dados, id, carregando, montarCorpo]);

  // Avisa antes de fechar a aba com alteração pendente.
  useEffect(() => {
    const aoSair = (e: BeforeUnloadEvent) => {
      if (JSON.stringify(dados) !== referencia.current && !carregando) e.preventDefault();
    };
    window.addEventListener('beforeunload', aoSair);
    return () => window.removeEventListener('beforeunload', aoSair);
  }, [dados, carregando]);

  // ---------- ações ----------
  async function salvar(novoStatus?: string) {
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

    setSalvando(true);
    try {
      const corpo: Record<string, unknown> = { ...montarCorpo() };

      if (novoStatus) {
        corpo.status = novoStatus;
        if (novoStatus === 'SCHEDULED') {
          if (!dados.scheduledFor) {
            setErro('Informe a data do agendamento.');
            setSalvando(false);
            return;
          }
          corpo.scheduledFor = new Date(dados.scheduledFor).toISOString();
        }
      }

      const salvo = id
        ? await painel.atualizarPost(id, corpo)
        : await painel.criarPost({ ...corpo, status: novoStatus ?? 'DRAFT' });

      referencia.current = JSON.stringify(dados);
      setSalvoEm(new Date().toISOString());

      if (novoStatus) setDados((d) => ({ ...d, status: novoStatus }));
      recado.ok(novoStatus === 'PUBLISHED' ? 'Publicado.' : 'Alterações salvas.');

      if (!id) router.replace(`/painel/publicacoes/${salvo.id}`);
    } catch (e) {
      if (e instanceof ErroApi) {
        setErro(e.message);
        if (e.fields) setCampos(e.fields);
      } else {
        setErro('Não foi possível salvar agora.');
      }
    } finally {
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

  if (carregando) return <Carregando texto="Carregando a publicação…" />;

  const publicado = dados.status === 'PUBLISHED';

  return (
    <>
      <TituloPagina
        titulo={id ? 'Editar publicação' : 'Nova publicação'}
        descricao={
          salvoEm
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
              <a href={`/artigo/${dados.slug}`} target="_blank" rel="noopener noreferrer">
                <Botao variante="fantasma">Ver no site</Botao>
              </a>
            )}
            <Botao variante="neutro" carregando={salvando} onClick={() => void salvar()}>
              Salvar
            </Botao>
            {!publicado ? (
              <Botao variante="primario" carregando={salvando} onClick={() => void salvar('PUBLISHED')}>
                Publicar
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

            <Campo rotulo="Agendar para" erro={campos.scheduledFor}>
              <Entrada
                type="datetime-local"
                value={dados.scheduledFor}
                onChange={(e) => atualizar('scheduledFor', e.target.value)}
              />
            </Campo>

            {dados.scheduledFor && dados.status !== 'SCHEDULED' && (
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
  aoFechar,
  aoRestaurar,
}: {
  id: string;
  aberto: boolean;
  aoFechar: () => void;
  aoRestaurar: () => void;
}) {
  const [itens, setItens] = useState<
    Array<{ id: string; createdAt: string; title: string; authorName: string | null }>
  >([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (!aberto) return;
    setCarregando(true);
    painel
      .revisoes(id)
      .then(setItens)
      .catch(() => setItens([]))
      .finally(() => setCarregando(false));
  }, [aberto, id]);

  return (
    <Modal titulo="Revisões" aberto={aberto} aoFechar={aoFechar} largura={540}>
      {carregando ? (
        <Carregando />
      ) : itens.length === 0 ? (
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
                onClick={async () => {
                  await painel.restaurarRevisao(id, r.id);
                  aoRestaurar();
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
