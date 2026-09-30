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

/** Os três passos da matéria: um assunto por vez. */
const PASSOS_DA_MATERIA = [
  { titulo: 'Escrever', ajuda: 'Título, texto, foto e vídeo' },
  { titulo: 'Onde aparece', ajuda: 'Editoria, destaque e assuntos' },
  { titulo: 'Publicar', ajuda: 'Prévia, resumo e quando vai ao ar' },
] as const;

const NOME_DA_PLATAFORMA: Record<string, string> = { YOUTUBE: 'YouTube', INSTAGRAM: 'Instagram', TIKTOK: 'TikTok' };

/** A plataforma pelo link colado (a pessoa não precisa escolher). */
function plataformaDoLink(url: string): 'YOUTUBE' | 'INSTAGRAM' | 'TIKTOK' | null {
  const u = url.toLowerCase();
  if (/youtube\.com|youtu\.be/.test(u)) return 'YOUTUBE';
  if (/instagram\.com/.test(u)) return 'INSTAGRAM';
  if (/tiktok\.com/.test(u)) return 'TIKTOK';
  return null;
}

const normalizarNome = (n: string) => n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

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
  // O passo (1 Escrever, 2 Onde aparece, 3 Publicar). Depois de criar a
  // matéria nova a tela recarrega com o id: ?passo=3 volta ao mesmo lugar.
  const [passo, setPasso] = useState(0);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('passo') === '3') setPasso(2);
  }, []);
  const [decisao, setDecisao] = useState<'PUBLISHED' | 'SCHEDULED' | 'REVIEW' | 'DRAFT'>(podePublicar ? 'PUBLISHED' : 'REVIEW');

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
          setErroCarga(e instanceof ErroApi ? e.message : 'Não foi possível carregar a matéria.');
        }
      } else {
        // Categoria padrao evita um erro bobo de validacao no primeiro save.
        // A assinatura padrao e a da propria pessoa, quando existe uma com o nome dela.
        const minha = auts.find((a) => a.userId && a.userId === usuario?.id) ?? auts.find((a) => normalizarNome(a.name) === normalizarNome(usuario?.name ?? ''));
        setDados((d) => ({ ...d, categoryId: cats[0]?.id ?? '', authorId: d.authorId || minha?.id || '' }));
      }

      setCarregando(false);
    })();

    return () => {
      vivo = false;
    };
  }, [id, tentativaPost, usuario?.name, usuario?.id]);

  useEffect(() => {
    if (carregando) return;
    if (dados.status === 'SCHEDULED') setDecisao('SCHEDULED');
    else if (dados.status === 'REVIEW' && !podePublicar) setDecisao('REVIEW');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregando]);

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
      setErro('Escreva o título da matéria.');
      setPasso(0);
      return;
    }
    if (!dados.categoryId) {
      setErro('Escolha a editoria da matéria.');
      setPasso(1);
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
            setErro('Escolha o dia e a hora do agendamento.');
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

      if (!id) router.replace(`/painel/publicacoes/${salvo.id}${passo === 2 ? '?passo=3' : ''}`);
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

  if (carregando) return <Carregando texto="Carregando a matéria…" />;
  if (erroCarga) return <div className="pn-bloco pn-erro-lista"><Aviso tipo="erro">{erroCarga}</Aviso><Botao variante="neutro" onClick={() => setTentativaPost((valor) => valor + 1)}>Tentar novamente</Botao></div>;

  const publicado = dados.status === 'PUBLISHED';
  const novo = !id;
  const nomeDaEditoria = categorias.find((c) => c.id === dados.categoryId)?.name ?? '';
  const destaque: 'normal' | 'destaque' | 'manchete' = dados.isHomepageTop ? 'manchete' : dados.isFeatured ? 'destaque' : 'normal';
  const podeAvancar = passo === 0 ? dados.title.trim().length > 0 : passo === 1 ? Boolean(dados.categoryId) : true;
  const irPara = (p: number) => {
    // Numa matéria nova, só avança com o passo anterior completo.
    if (novo && p > passo && !podeAvancar) {
      setErro(passo === 0 ? 'Escreva o título para continuar.' : 'Escolha a editoria para continuar.');
      return;
    }
    setErro('');
    setPasso(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const acaoFinal = publicado ? 'salvar' : decisao;
  const rotuloFinal =
    acaoFinal === 'salvar' ? 'Salvar alterações' : acaoFinal === 'PUBLISHED' ? 'Publicar agora' : acaoFinal === 'SCHEDULED' ? 'Agendar publicação' : acaoFinal === 'REVIEW' ? 'Enviar para revisão' : 'Salvar rascunho';
  const concluir = () => {
    if (acaoFinal === 'salvar') return void salvar();
    // "Ainda não": grava como está; volta a rascunho só o que estava agendado ou em revisão.
    if (acaoFinal === 'DRAFT') return void salvar(!novo && dados.status !== 'DRAFT' ? 'DRAFT' : undefined);
    void salvar(acaoFinal);
  };
  const urlDoSite = `makucho.com.br/artigo/${dados.slug || gerarSlug(dados.title) || '…'}`;

  return (
    <>
      <TituloPagina
        fixo
        titulo={novo ? 'Escrever matéria' : 'Editar matéria'}
        descricao={
          autosaveEstado === 'salvando' ? 'Salvando automaticamente…' : autosaveEstado === 'erro' ? 'Salvamento automático falhou; use Salvar para tentar novamente.' : id && estadoAtual.current !== referencia.current ? 'Alterações ainda não salvas' : salvoEm
            ? `Salvo às ${new Date(salvoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
            : novo ? 'Três passos: escrever, onde aparece, publicar.' : undefined
        }
        acoes={
          <>
            {!novo && <SeloStatus status={dados.status} />}
            {id && (
              <Botao variante="fantasma" onClick={() => setRevisoesAbertas(true)}>
                Versões anteriores
              </Botao>
            )}
            {publicado && (
              <a href={`/artigo/${dados.slug}`} target="_blank" rel="noopener noreferrer" className="pn-botao pn-botao-fantasma">Ver no site</a>
            )}
            <Botao variante="neutro" carregando={salvando} onClick={() => void salvar()}>
              {novo ? 'Salvar rascunho' : 'Salvar'}
            </Botao>
          </>
        }
      />

      {/* ---------- Os três passos ---------- */}
      <nav className="pn-passos" aria-label="Passos da matéria">
        {PASSOS_DA_MATERIA.map((p, i) => (
          <button key={p.titulo} type="button" data-estado={i < passo ? 'feito' : i === passo ? 'atual' : 'depois'} aria-current={i === passo ? 'step' : undefined} onClick={() => irPara(i)}>
            <span className="pn-passo-bola">{i + 1}</span>
            <span className="pn-passo-texto">
              <strong>{p.titulo}</strong>
              <small>{p.ajuda}</small>
            </span>
          </button>
        ))}
      </nav>

      <Aviso tipo="erro">{erro}</Aviso>
      {erroReferencias && <div className="pn-erro-lista"><Aviso tipo="erro">{erroReferencias} O texto em edição foi preservado.</Aviso><Botao variante="neutro" onClick={() => void tentarReferencias()}>Tentar novamente</Botao></div>}

      {/* ---------- 1. Escrever ---------- */}
      {passo === 0 && (
        <div className="pn-editor-grade">
          <div>
            <div className="pn-bloco">
              <Campo rotulo="Título" obrigatorio erro={campos.title}>
                <Entrada value={dados.title} onChange={(e) => atualizar('title', e.target.value)} placeholder="Copom mantém a Selic e sinaliza cautela" maxLength={255} autoFocus={novo} />
              </Campo>
              <Campo rotulo="Linha fina (opcional)" erro={campos.subtitle} dica="A frase logo abaixo do título, na página da matéria.">
                <Entrada value={dados.subtitle} onChange={(e) => atualizar('subtitle', e.target.value)} maxLength={320} />
              </Campo>
            </div>
            <div className="pn-bloco">
              <h2 className="pn-bloco-h2">Texto</h2>
              <EditorConteudo valor={dados.content} aoMudar={(doc) => atualizar('content', doc)} />
            </div>
          </div>
          <aside className="pn-editor-lado">
            <div className="pn-bloco">
              <CampoImagem rotulo="Foto de capa" preset="HERO" midia={dados.coverImage} aoMudar={(m) => atualizar('coverImage', m)} dica="Aparece no topo da matéria e nas listas do site." />
            </div>
            <div className="pn-bloco">
              <h2 className="pn-bloco-h2">Vídeo (opcional)</h2>
              <Campo rotulo="Link do vídeo" erro={campos.videoUrl ?? campos.videoPlatform} dica={dados.videoPlatform ? `Reconhecido: ${NOME_DA_PLATAFORMA[dados.videoPlatform] ?? dados.videoPlatform}. Gera o botão “Assistir” na matéria.` : 'Cole o link do YouTube, Instagram ou TikTok.'}>
                <Entrada
                  value={dados.videoUrl}
                  placeholder="https://www.youtube.com/watch?v=…"
                  onChange={(e) => {
                    const url = e.target.value;
                    const plataforma = plataformaDoLink(url);
                    setDados((d) => ({ ...d, videoUrl: url, videoPlatform: url.trim() ? plataforma ?? d.videoPlatform : '' }));
                  }}
                />
              </Campo>
              {dados.videoUrl.trim() && !plataformaDoLink(dados.videoUrl) && (
                <Campo rotulo="De qual plataforma?">
                  <Selecao value={dados.videoPlatform} onChange={(e) => atualizar('videoPlatform', e.target.value)}>
                    <option value="">Escolha…</option>
                    <option value="YOUTUBE">YouTube</option>
                    <option value="INSTAGRAM">Instagram</option>
                    <option value="TIKTOK">TikTok</option>
                  </Selecao>
                </Campo>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* ---------- 2. Onde aparece ---------- */}
      {passo === 1 && (
        <div className="pn-passo-corpo">
          <section className="pn-bloco">
            <h2 className="pn-bloco-h2">Em qual editoria?</h2>
            <p className="pn-dica-bloco">A seção do site onde a matéria entra (é também o menu do site).</p>
            {campos.categoryId && <Aviso tipo="erro">{campos.categoryId}</Aviso>}
            <div className="pn-escolhas" role="radiogroup" aria-label="Editoria">
              {categorias.map((c) => (
                <button key={c.id} type="button" role="radio" aria-checked={dados.categoryId === c.id} onClick={() => atualizar('categoryId', c.id)} style={{ '--cor-escolha': c.color ?? 'var(--pn-azul)' } as React.CSSProperties}>
                  <i aria-hidden="true" />
                  {c.name}
                </button>
              ))}
              {categorias.length === 0 && <small className="pn-dica">Nenhuma editoria cadastrada: crie em Organização → Editorias.</small>}
            </div>
          </section>

          <section className="pn-bloco">
            <h2 className="pn-bloco-h2">Na página inicial</h2>
            <div className="pn-cartoes-escolha" role="radiogroup" aria-label="Destaque na página inicial">
              {(
                [
                  ['normal', 'Normal', 'Entra nas listas da editoria e nas últimas matérias.'],
                  ['destaque', 'Em destaque', 'Ganha espaço nos blocos de destaque da página inicial.'],
                  ['manchete', 'Manchete principal', 'O bloco grande do topo da página inicial. Uma por vez.'],
                ] as const
              ).map(([valor, titulo, texto]) => (
                <button
                  key={valor}
                  type="button"
                  role="radio"
                  aria-checked={destaque === valor}
                  onClick={() =>
                    setDados((d) =>
                      valor === 'normal' ? { ...d, isFeatured: false, isHomepageTop: false } : valor === 'destaque' ? { ...d, isFeatured: true, isHomepageTop: false } : { ...d, isHomepageTop: true },
                    )
                  }
                >
                  <strong>{titulo}</strong>
                  <small>{texto}</small>
                </button>
              ))}
            </div>
            <details className="pn-detalhes-simples">
              <summary>Mais opções de destaque</summary>
              <Alternador marcado={dados.isTrending} aoMudar={(v) => atualizar('isTrending', v)} rotulo="Em alta" descricao="Aparece no bloco “Em alta”." />
              <Alternador marcado={dados.isPinned} aoMudar={(v) => atualizar('isPinned', v)} rotulo="Fixar no topo das listas" descricao="Fica em primeiro na editoria, mesmo com matérias mais novas." />
            </details>
          </section>

          <div className="pn-passo-duas">
            <section className="pn-bloco">
              <h2 className="pn-bloco-h2">Assuntos</h2>
              <p className="pn-dica-bloco">Palavras-chave que ligam esta matéria a outras do mesmo tema.</p>
              <div className="pn-tags">
                {tags.length === 0 && <small className="pn-dica">Nenhum assunto cadastrado: crie em Organização → Assuntos.</small>}
                {tags.map((t) => {
                  const marcada = dados.tagIds.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className={`pn-tag ${marcada ? 'pn-tag-on' : ''}`}
                      aria-pressed={marcada}
                      onClick={() => atualizar('tagIds', marcada ? dados.tagIds.filter((x) => x !== t.id) : [...dados.tagIds, t.id].slice(0, 20))}
                    >
                      {t.name}
                    </button>
                  );
                })}
              </div>
            </section>
            <section className="pn-bloco">
              <h2 className="pn-bloco-h2">Quem assina</h2>
              <Campo rotulo="Assinatura" erro={campos.authorId} dica="O nome e a foto que aparecem na matéria.">
                <Selecao value={dados.authorId} onChange={(e) => atualizar('authorId', e.target.value)}>
                  <option value="">Sem assinatura</option>
                  {autores.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Selecao>
              </Campo>
            </section>
          </div>
        </div>
      )}

      {/* ---------- 3. Publicar ---------- */}
      {passo === 2 && (
        <div className="pn-editor-grade">
          <div>
            <section className="pn-bloco">
              <h2 className="pn-bloco-h2">Como aparece no site</h2>
              <div className="pn-previa-cartao">
                <span className="pn-previa-capa" style={dados.coverImage ? { backgroundImage: `url(${dados.coverImage.url})` } : undefined}>
                  {!dados.coverImage && 'Sem foto de capa'}
                </span>
                <span className="pn-previa-corpo">
                  {nomeDaEditoria && <small>{nomeDaEditoria}</small>}
                  <strong>{dados.title || 'Título da matéria'}</strong>
                  <span>{dados.excerpt || 'Escreva o resumo abaixo: é o texto que aparece aqui.'}</span>
                </span>
              </div>
              <Campo rotulo="Resumo" erro={campos.excerpt} dica="Duas ou três linhas que convidam a ler. Aparece nas listas e nas buscas (até 600 caracteres).">
                <AreaTexto value={dados.excerpt} onChange={(e) => atualizar('excerpt', e.target.value)} maxLength={600} />
              </Campo>
            </section>

            <section className="pn-bloco">
              <h2 className="pn-bloco-h2">Como aparece no Google</h2>
              <div className="pn-previa-google">
                <small>{urlDoSite}</small>
                <strong>{dados.seoTitle || dados.title || 'Título da matéria'}</strong>
                <span>{dados.seoDescription || dados.excerpt || 'O resumo aparece aqui.'}</span>
              </div>
              <details className="pn-detalhes-simples">
                <summary>Ajustar (opcional)</summary>
                <Campo rotulo="Endereço da matéria" erro={campos.slug} dica={urlDoSite}>
                  <Entrada
                    value={dados.slug}
                    onChange={(e) => {
                      setSlugTocado(true);
                      atualizar('slug', e.target.value);
                    }}
                    placeholder="gerado a partir do título"
                  />
                </Campo>
                <Campo rotulo="Título no Google" dica="Vazio = o título da matéria." erro={campos.seoTitle}>
                  <Entrada value={dados.seoTitle} onChange={(e) => atualizar('seoTitle', e.target.value)} maxLength={200} />
                </Campo>
                <Campo rotulo="Descrição no Google" dica="Vazio = o resumo." erro={campos.seoDescription}>
                  <AreaTexto value={dados.seoDescription} onChange={(e) => atualizar('seoDescription', e.target.value)} maxLength={320} />
                </Campo>
                <CampoImagem rotulo="Imagem ao compartilhar" preset="SOCIAL" midia={dados.ogImage} aoMudar={(m) => atualizar('ogImage', m)} dica="Usada no WhatsApp e nas redes. Sem ela, vale a capa." />
              </details>
            </section>
          </div>

          <aside className="pn-editor-lado">
            <section className="pn-bloco">
              <h2 className="pn-bloco-h2">{publicado ? 'Esta matéria está no ar' : 'Quando vai ao ar?'}</h2>
              {publicado ? (
                <p className="pn-dica-bloco">As alterações salvas aparecem no site na hora.</p>
              ) : (
                <div className="pn-cartoes-escolha pn-cartoes-escolha-coluna" role="radiogroup" aria-label="Quando publicar">
                  {(podePublicar
                    ? ([
                        ['PUBLISHED', 'Agora', 'Entra no site assim que você confirmar.'],
                        ['SCHEDULED', 'Agendar', 'Escolha o dia e a hora; entra sozinha.'],
                        ['DRAFT', 'Ainda não', 'Fica como rascunho, só no painel.'],
                      ] as const)
                    : ([
                        ['REVIEW', 'Enviar para revisão', 'Um editor confere e publica.'],
                        ['DRAFT', 'Ainda não', 'Fica como rascunho, só no painel.'],
                      ] as const)
                  ).map(([valor, titulo, texto]) => (
                    <button key={valor} type="button" role="radio" aria-checked={decisao === valor} onClick={() => setDecisao(valor)}>
                      <strong>{titulo}</strong>
                      <small>{texto}</small>
                    </button>
                  ))}
                </div>
              )}
              {!publicado && decisao === 'SCHEDULED' && (
                <Campo rotulo="Dia e hora" erro={campos.scheduledFor}>
                  <Entrada type="datetime-local" value={dados.scheduledFor} onChange={(e) => atualizar('scheduledFor', e.target.value)} />
                </Campo>
              )}
              <Botao variante="primario" className="pn-largo" carregando={salvando} onClick={concluir}>
                {rotuloFinal}
              </Botao>
              {publicado && podePublicar && (
                <Botao variante="neutro" className="pn-largo" carregando={salvando} onClick={() => void salvar('DRAFT')}>
                  Tirar do ar (voltar a rascunho)
                </Botao>
              )}
            </section>
            {id && (
              <div className="pn-bloco">
                <Botao variante="perigo" className="pn-largo" onClick={() => setExcluindo(true)}>
                  Excluir matéria
                </Botao>
              </div>
            )}
          </aside>
        </div>
      )}

      {/* ---------- Navegação entre os passos ---------- */}
      <div className="pn-passos-rodape">
        {passo > 0 ? (
          <Botao variante="fantasma" onClick={() => irPara(passo - 1)}>
            ← Voltar
          </Botao>
        ) : (
          <span />
        )}
        {passo < 2 && (
          <Botao variante="primario" onClick={() => irPara(passo + 1)}>
            Continuar →
          </Botao>
        )}
      </div>

      <Confirmacao
        aberto={excluindo}
        titulo="Excluir matéria"
        mensagem="A matéria sai do site. Esta ação não pode ser desfeita."
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
