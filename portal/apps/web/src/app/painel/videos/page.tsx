'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import NextImage from 'next/image';
import type { CategoryDto, MediaDto, VideoDto } from '@makucho/types';
import { gerarSlug } from '@makucho/validation';
import { ErroApi, painel } from '@/lib/painel';
import { MolduraPainel, TituloPagina } from '@/components/painel/moldura-painel';
import { CampoImagem, miniatura } from '@/components/painel/seletor-midia';
import {
  Alternador,
  Aviso,
  Botao,
  Campo,
  Carregando,
  Confirmacao,
  Entrada,
  Modal,
  Paginacao,
  Selecao,
  AreaTexto,
  Vazio,
  useRecado,
} from '@/components/painel/ui';

interface Formulario {
  id?: string;
  title: string;
  slug: string;
  description: string;
  platform: string;
  url: string;
  duracao: string;
  thumbnail: MediaDto | null;
  categoryId: string;
  isFeatured: boolean;
  isPublished: boolean;
}

const NOVO: Formulario = {
  title: '',
  slug: '',
  description: '',
  platform: 'YOUTUBE',
  url: '',
  duracao: '',
  thumbnail: null,
  categoryId: '',
  isFeatured: false,
  isPublished: true,
};

/** Aceita "8:30" ou segundos puros; a API guarda em segundos. */
function paraSegundos(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  if (t.includes(':')) {
    const partes = /^(\d+):([0-5]?\d)$/.exec(t);
    if (!partes) return null;
    const total = Number(partes[1]) * 60 + Number(partes[2]);
    return total <= 86400 ? total : null;
  }
  const n = Number(t);
  return Number.isInteger(n) && n >= 0 && n <= 86400 ? n : null;
}

function paraTempo(segundos: number | null): string {
  if (segundos === null) return '';
  return `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, '0')}`;
}

function Videos() {
  const recado = useRecado();
  const [itens, setItens] = useState<VideoDto[]>([]);
  const [categorias, setCategorias] = useState<CategoryDto[]>([]);
  const [erroCategorias, setErroCategorias] = useState(false);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1, total: 0 });
  const [carregando, setCarregando] = useState(true);
  const [dadosCarregados, setDadosCarregados] = useState(false);
  const [erroLista, setErroLista] = useState<string | null>(null);
  const requisicaoAtual = useRef(0);
  const [pagina, setPagina] = useState(1);
  const [plataforma, setPlataforma] = useState('');

  const [form, setForm] = useState<Formulario | null>(null);
  const [excluir, setExcluir] = useState<VideoDto | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [slugTocado, setSlugTocado] = useState(false);

  const carregarCategorias = useCallback(async () => {
    try {
      setCategorias(await painel.categorias());
      setErroCategorias(false);
    } catch {
      setErroCategorias(true);
    }
  }, []);

  useEffect(() => {
    void carregarCategorias();
  }, [carregarCategorias]);

  const carregar = useCallback(async () => {
    const requisicao = ++requisicaoAtual.current;
    setCarregando(true);
    setErroLista(null);
    try {
      const r = await painel.videos({
        page: pagina,
        perPage: 24,
        platform: plataforma || undefined,
      });
      if (requisicao !== requisicaoAtual.current) return;
      setItens(r.data);
      setMeta({ page: r.meta.page, totalPages: r.meta.totalPages, total: r.meta.total });
      setDadosCarregados(true);
    } catch (e) {
      if (requisicao !== requisicaoAtual.current) return;
      setErroLista(e instanceof ErroApi ? e.message : 'Não foi possível carregar os vídeos.');
    } finally {
      if (requisicao === requisicaoAtual.current) setCarregando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagina, plataforma]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function abrir(v?: VideoDto) {
    setErro('');
    setSlugTocado(Boolean(v));
    setForm(
      v
        ? {
            id: v.id,
            title: v.title,
            slug: v.slug,
            description: v.description ?? '',
            platform: v.platform,
            url: v.url,
            duracao: paraTempo(v.durationSeconds),
            thumbnail: v.thumbnail,
            categoryId: v.category?.id ?? '',
            isFeatured: v.isFeatured,
            isPublished: v.isPublished,
          }
        : { ...NOVO },
    );
  }

  async function salvar() {
    if (!form || salvando) return;
    setErro('');

    if (form.title.trim().length < 3) {
      setErro('Informe o título do vídeo.');
      return;
    }
    if (!form.url.trim()) {
      setErro('Informe o endereço do vídeo.');
      return;
    }
    const duracao = paraSegundos(form.duracao);
    if (form.duracao.trim() && duracao === null) {
      setErro('Informe a duração em segundos ou no formato 8:30, até 24 horas.');
      return;
    }

    setSalvando(true);
    try {
      const corpo = {
        title: form.title.trim(),
        slug: form.slug.trim() || gerarSlug(form.title),
        description: form.description.trim() || null,
        platform: form.platform,
        url: form.url.trim(),
        durationSeconds: duracao,
        thumbnailId: form.thumbnail?.id ?? null,
        categoryId: form.categoryId || null,
        isFeatured: form.isFeatured,
        isPublished: form.isPublished,
      };

      if (form.id) await painel.atualizarVideo(form.id, corpo);
      else await painel.criarVideo(corpo);

      recado.ok(form.id ? 'Vídeo atualizado.' : 'Vídeo criado.');
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
        titulo="Vídeos"
        descricao={dadosCarregados ? `${meta.total.toLocaleString('pt-BR')} no total` : 'Aguardando dados do painel'}
        acoes={
          <Botao variante="primario" onClick={() => abrir()}>
            + Novo vídeo
          </Botao>
        }
      />

      <div className="pn-filtros">
        <Selecao
          aria-label="Filtrar vídeos por plataforma"
          value={plataforma}
          onChange={(e) => {
            setPagina(1);
            setPlataforma(e.target.value);
          }}
        >
          <option value="">Todas as plataformas</option>
          <option value="YOUTUBE">YouTube</option>
          <option value="INSTAGRAM">Instagram</option>
          <option value="TIKTOK">TikTok</option>
        </Selecao>
      </div>

      {erroCategorias && (
        <div className="pn-erro-lista">
          <Aviso tipo="erro">As categorias não foram carregadas. O campo de categoria pode estar incompleto.</Aviso>
          <Botao variante="neutro" onClick={() => void carregarCategorias()}>Recarregar categorias</Botao>
        </div>
      )}

      <div className="pn-bloco">
        {erroLista && (
          <div className="pn-erro-lista">
            <Aviso tipo="erro">{erroLista} {dadosCarregados ? 'Os resultados anteriores permanecem abaixo.' : 'Nenhum resultado foi carregado.'}</Aviso>
            <Botao variante="neutro" onClick={() => void carregar()}>Tentar novamente</Botao>
          </div>
        )}
        {carregando ? (
          <Carregando />
        ) : erroLista && !dadosCarregados ? null : itens.length === 0 ? (
          <Vazio
            titulo="Nenhum vídeo"
            descricao="Cadastre os vídeos do YouTube, Instagram e TikTok."
            acao={
              <Botao variante="primario" onClick={() => abrir()}>
                + Novo vídeo
              </Botao>
            }
          />
        ) : (
          <div className="pn-tabela-area">
            <table className="pn-tabela">
              <thead>
                <tr>
                  <th style={{ width: 72 }} />
                  <th>Título</th>
                  <th>Plataforma</th>
                  <th>Categoria</th>
                  <th>Duração</th>
                  <th style={{ textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((v) => (
                  <tr key={v.id}>
                    <td>
                      {v.thumbnail ? (
                        <NextImage
                          src={miniatura(v.thumbnail)}
                          alt=""
                          width={60}
                          height={38}
                          unoptimized
                          style={{ borderRadius: 5, objectFit: 'cover' }}
                        />
                      ) : (
                        <span className="pn-avatar-vazio">▶</span>
                      )}
                    </td>
                    <td>
                      <button type="button" className="pn-link" onClick={() => abrir(v)}>
                        {v.title}
                      </button>
                      {v.isFeatured && (
                        <small style={{ display: 'block', color: 'var(--pn-suave)' }}>
                          em destaque
                        </small>
                      )}
                      {!v.isPublished && (
                        <small style={{ display: 'block', color: 'var(--pn-suave)' }}>rascunho · não aparece no portal</small>
                      )}
                    </td>
                    <td style={{ textTransform: 'capitalize' }}>{v.platform.toLowerCase()}</td>
                    <td style={{ color: 'var(--pn-suave)' }}>{v.category?.name ?? '—'}</td>
                    <td>{paraTempo(v.durationSeconds) || '—'}</td>
                    <td>
                      <div className="pn-acoes">
                        <a href={v.url} target="_blank" rel="noopener noreferrer" className="pn-botao pn-botao-fantasma">
                          Abrir
                        </a>
                        <Botao variante="fantasma" onClick={() => abrir(v)}>
                          Editar
                        </Botao>
                        <Botao variante="perigo-suave" onClick={() => setExcluir(v)}>
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

        {!erroLista && <Paginacao pagina={meta.page} totalPaginas={meta.totalPages} aoMudar={setPagina} />}
      </div>

      <Modal
        titulo={form?.id ? 'Editar vídeo' : 'Novo vídeo'}
        aberto={form !== null}
        aoFechar={() => { if (!salvando) setForm(null); }}
        rodape={
          <>
            <Botao variante="fantasma" disabled={salvando} onClick={() => setForm(null)}>
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

            <Campo rotulo="Título" obrigatorio>
              <Entrada
                value={form.title}
                onChange={(e) => {
                  const title = e.target.value;
                  setForm({ ...form, title, slug: slugTocado ? form.slug : gerarSlug(title) });
                }}
                autoFocus
                maxLength={255}
              />
            </Campo>

            <div className="pn-linha">
              <Campo rotulo="Plataforma" obrigatorio>
                <Selecao
                  value={form.platform}
                  onChange={(e) => setForm({ ...form, platform: e.target.value })}
                >
                  <option value="YOUTUBE">YouTube</option>
                  <option value="INSTAGRAM">Instagram</option>
                  <option value="TIKTOK">TikTok</option>
                </Selecao>
              </Campo>

              <Campo rotulo="Duração" dica="Formato 8:30 ou em segundos.">
                <Entrada
                  value={form.duracao}
                  onChange={(e) => setForm({ ...form, duracao: e.target.value })}
                  placeholder="8:30"
                />
              </Campo>
            </div>

            <Campo rotulo="Endereço do vídeo" obrigatorio>
              <Entrada
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://www.youtube.com/watch?v=…"
              />
            </Campo>

            <Campo rotulo="Categoria">
              <Selecao
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              >
                <option value="">Sem categoria</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Selecao>
            </Campo>

            <Campo rotulo="Descrição">
              <AreaTexto
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                maxLength={2000}
              />
            </Campo>

            <CampoImagem
              rotulo="Capa"
              midia={form.thumbnail}
              aoMudar={(m) => setForm({ ...form, thumbnail: m })}
              dica="Use o formato Capa de vídeo (16:9) ao enviar."
            />

            <Alternador
              marcado={form.isPublished}
              aoMudar={(v) => setForm({ ...form, isPublished: v })}
              rotulo="Publicado"
              descricao="Aparece na página de vídeos do site."
            />
            <Alternador
              marcado={form.isFeatured}
              aoMudar={(v) => setForm({ ...form, isFeatured: v })}
              rotulo="Em destaque"
            />
          </>
        )}
      </Modal>

      <Confirmacao
        aberto={excluir !== null}
        titulo="Excluir vídeo"
        mensagem={`"${excluir?.title}" será removido do site.`}
        aoConfirmar={async () => {
          if (!excluir) return;
          try {
            await painel.excluirVideo(excluir.id);
            recado.ok('Vídeo excluído.');
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

export default function PaginaVideosPainel() {
  return (
    <MolduraPainel>
      <Videos />
    </MolduraPainel>
  );
}
