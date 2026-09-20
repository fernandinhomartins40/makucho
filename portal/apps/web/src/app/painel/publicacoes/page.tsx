'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { CategoryDto, PostSummaryDto } from '@makucho/types';
import { ErroApi, painel } from '@/lib/painel';
import { MolduraPainel, TituloPagina } from '@/components/painel/moldura-painel';
import {
  Botao,
  Carregando,
  Confirmacao,
  Entrada,
  Paginacao,
  SeloStatus,
  Selecao,
  Vazio,
  useRecado,
} from '@/components/painel/ui';

const STATUS = [
  { valor: '', rotulo: 'Todos os status' },
  { valor: 'DRAFT', rotulo: 'Rascunho' },
  { valor: 'REVIEW', rotulo: 'Em revisão' },
  { valor: 'SCHEDULED', rotulo: 'Agendado' },
  { valor: 'PUBLISHED', rotulo: 'Publicado' },
  { valor: 'ARCHIVED', rotulo: 'Arquivado' },
];

function Lista() {
  const router = useRouter();
  const params = useSearchParams();
  const recado = useRecado();

  const [posts, setPosts] = useState<PostSummaryDto[]>([]);
  const [categorias, setCategorias] = useState<CategoryDto[]>([]);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1, total: 0 });
  const [carregando, setCarregando] = useState(true);
  const [excluir, setExcluir] = useState<PostSummaryDto | null>(null);

  const [status, setStatus] = useState(params.get('status') ?? '');
  const [categoria, setCategoria] = useState('');
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(1);
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [termo, setTermo] = useState('');

  useEffect(() => {
    painel.categorias().then(setCategorias).catch(() => setCategorias([]));
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await painel.posts({
        page: pagina,
        perPage: 20,
        status: status || undefined,
        categoryId: categoria || undefined,
        search: termo || undefined,
      });
      setPosts(r.data);
      setMeta({ page: r.meta.page, totalPages: r.meta.totalPages, total: r.meta.total });
    } catch (e) {
      recado.erro(e instanceof ErroApi ? e.message : 'Não foi possível carregar a lista.');
    } finally {
      setCarregando(false);
    }
    // O `recado` muda a cada render e nao deve disparar recarga.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagina, status, categoria, termo]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // A busca so vale depois que o usuario para de digitar.
  useEffect(() => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      setPagina(1);
      setTermo(busca.trim());
    }, 380);
    return () => clearTimeout(debounce.current);
  }, [busca]);

  async function duplicar(p: PostSummaryDto) {
    try {
      const novo = await painel.duplicarPost(p.id);
      recado.ok('Cópia criada.');
      router.push(`/painel/publicacoes/${novo.id}`);
    } catch (e) {
      recado.erro(e instanceof ErroApi ? e.message : 'Não foi possível duplicar.');
    }
  }

  async function confirmarExclusao() {
    if (!excluir) return;
    try {
      await painel.excluirPost(excluir.id);
      recado.ok('Publicação excluída.');
      setExcluir(null);
      void carregar();
    } catch (e) {
      recado.erro(e instanceof ErroApi ? e.message : 'Não foi possível excluir.');
    }
  }

  return (
    <>
      <TituloPagina
        titulo="Publicações"
        descricao={`${meta.total.toLocaleString('pt-BR')} no total`}
        acoes={
          <Link href="/painel/publicacoes/nova">
            <Botao variante="primario">+ Nova publicação</Botao>
          </Link>
        }
      />

      <div className="pn-filtros">
        <Entrada
          className="pn-busca"
          placeholder="Buscar por título…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <Selecao
          value={status}
          onChange={(e) => {
            setPagina(1);
            setStatus(e.target.value);
          }}
        >
          {STATUS.map((s) => (
            <option key={s.valor} value={s.valor}>
              {s.rotulo}
            </option>
          ))}
        </Selecao>
        <Selecao
          value={categoria}
          onChange={(e) => {
            setPagina(1);
            setCategoria(e.target.value);
          }}
        >
          <option value="">Todas as categorias</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Selecao>
      </div>

      <div className="pn-bloco">
        {carregando ? (
          <Carregando />
        ) : posts.length === 0 ? (
          <Vazio
            titulo="Nenhuma publicação encontrada"
            descricao="Ajuste os filtros ou crie uma nova publicação."
            acao={
              <Link href="/painel/publicacoes/nova">
                <Botao variante="primario">+ Nova publicação</Botao>
              </Link>
            }
          />
        ) : (
          <div className="pn-tabela-area">
            <table className="pn-tabela">
              <thead>
                <tr>
                  <th>Título</th>
                  <th>Categoria</th>
                  <th>Status</th>
                  <th>Data</th>
                  <th style={{ textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/painel/publicacoes/${p.id}`}>{p.title}</Link>
                      {p.videoPlatform && (
                        <small style={{ display: 'block', color: 'var(--pn-suave)' }}>
                          vídeo · {p.videoPlatform.toLowerCase()}
                        </small>
                      )}
                    </td>
                    <td>{p.category.name}</td>
                    <td>
                      <SeloStatus status={p.status} />
                    </td>
                    <td style={{ whiteSpace: 'nowrap', color: 'var(--pn-suave)' }}>
                      {p.publishedAt
                        ? new Date(p.publishedAt).toLocaleDateString('pt-BR')
                        : '—'}
                    </td>
                    <td>
                      <div className="pn-acoes">
                        {p.status === 'PUBLISHED' && (
                          <a
                            href={`/artigo/${p.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Ver no site"
                          >
                            <Botao variante="fantasma">Ver</Botao>
                          </a>
                        )}
                        <Botao variante="fantasma" onClick={() => void duplicar(p)}>
                          Duplicar
                        </Botao>
                        <Botao variante="fantasma" onClick={() => setExcluir(p)}>
                          Excluir
                        </Botao>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Paginacao pagina={meta.page} totalPaginas={meta.totalPages} aoMudar={setPagina} />
      </div>

      <Confirmacao
        aberto={excluir !== null}
        titulo="Excluir publicação"
        mensagem={`"${excluir?.title}" será removida. Esta ação não pode ser desfeita.`}
        aoConfirmar={confirmarExclusao}
        aoCancelar={() => setExcluir(null)}
      />

      {recado.elemento}
    </>
  );
}

export default function PaginaPublicacoes() {
  return (
    <MolduraPainel>
      <Suspense fallback={<Carregando />}>
        <Lista />
      </Suspense>
    </MolduraPainel>
  );
}
