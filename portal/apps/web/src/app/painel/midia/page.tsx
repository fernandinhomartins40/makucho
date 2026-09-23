'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import NextImage from 'next/image';
import type { MediaDto } from '@makucho/types';
import { ErroApi, painel, pode } from '@/lib/painel';
import { useSessao } from '@/components/painel/sessao';
import { MolduraPainel, TituloPagina } from '@/components/painel/moldura-painel';
import { Envio, GradeMidia, SeletorMidia, miniatura } from '@/components/painel/seletor-midia';
import {
  Aviso,
  Botao,
  Campo,
  Carregando,
  Confirmacao,
  Entrada,
  Modal,
  Paginacao,
  Vazio,
  useRecado,
} from '@/components/painel/ui';

/** Tamanho legível: a lista mostra quanto cada arquivo ocupa no disco. */
function tamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function Midia() {
  const { usuario } = useSessao();
  const recado = useRecado();

  const [itens, setItens] = useState<MediaDto[]>([]);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1, total: 0 });
  const [carregando, setCarregando] = useState(true);
  const [dadosCarregados, setDadosCarregados] = useState(false);
  const [erroLista, setErroLista] = useState<string | null>(null);
  const requisicaoAtual = useRef(0);
  const [pagina, setPagina] = useState(1);
  const [busca, setBusca] = useState('');
  const [termo, setTermo] = useState('');
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);

  const [enviando, setEnviando] = useState(false);
  const [detalhe, setDetalhe] = useState<MediaDto | null>(null);
  // Imagem cujo arquivo está sendo trocado (mesmo id, todos os usos atualizam).
  const [substituindo, setSubstituindo] = useState<MediaDto | null>(null);
  const [visualizar, setVisualizar] = useState<MediaDto | null>(null);
  const [ocupadoSubstituindo, setOcupadoSubstituindo] = useState(false);
  const [excluir, setExcluir] = useState<MediaDto | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    const requisicao = ++requisicaoAtual.current;
    setCarregando(true);
    setErroLista(null);
    try {
      const r = await painel.midias({ page: pagina, perPage: 36, search: termo || undefined });
      if (requisicao !== requisicaoAtual.current) return;
      setItens(r.data);
      setMeta({ page: r.meta.page, totalPages: r.meta.totalPages, total: r.meta.total });
      setDadosCarregados(true);
    } catch (e) {
      if (requisicao !== requisicaoAtual.current) return;
      setErroLista(e instanceof ErroApi ? e.message : 'Não foi possível carregar a biblioteca.');
    } finally {
      if (requisicao === requisicaoAtual.current) setCarregando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagina, termo]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      setPagina(1);
      setTermo(busca.trim());
    }, 380);
    return () => clearTimeout(debounce.current);
  }, [busca]);

  async function salvarDetalhe() {
    if (!detalhe || salvando) return;
    setErro('');
    setSalvando(true);

    try {
      await painel.atualizarMidia(detalhe.id, {
        alt: detalhe.alt?.trim() || null,
        caption: detalhe.caption?.trim() || null,
        credit: detalhe.credit?.trim() || null,
        title: detalhe.title?.trim() || null,
      });
      recado.ok('Imagem atualizada.');
      setDetalhe(null);
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
        titulo="Biblioteca de mídia"
        descricao={dadosCarregados ? `${meta.total.toLocaleString('pt-BR')} imagem${meta.total === 1 ? '' : 's'}` : 'Aguardando dados do painel'}
        acoes={
          <Botao variante="primario" onClick={() => setEnviando(true)}>
            + Enviar imagem
          </Botao>
        }
      />

      <div className="pn-filtros">
        <Entrada
          className="pn-busca"
          aria-label="Buscar imagens por descrição ou arquivo"
          placeholder="Buscar por descrição ou arquivo…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      <div className="pn-bloco">
        {erroLista && (
          <div className="pn-erro-lista">
            <Aviso tipo="erro">{erroLista} {dadosCarregados ? 'Os resultados anteriores permanecem abaixo.' : 'Nenhuma imagem foi carregada.'}</Aviso>
            <Botao variante="neutro" onClick={() => void carregar()}>Tentar novamente</Botao>
          </div>
        )}
        {carregando ? (
          <Carregando />
        ) : erroLista && !dadosCarregados ? null : itens.length === 0 ? (
          <Vazio
            titulo={termo ? 'Nada encontrado' : 'Biblioteca vazia'}
            descricao={
              termo
                ? 'Tente outro termo de busca.'
                : 'Envie imagens para usar nas publicações, vídeos e anúncios.'
            }
            acao={
              termo ? (
                <Botao variante="neutro" onClick={() => { setBusca(''); setTermo(''); setPagina(1); }}>Limpar busca</Botao>
              ) : (
                <Botao variante="primario" onClick={() => setEnviando(true)}>
                  + Enviar imagem
                </Botao>
              )
            }
          />
        ) : (
          <GradeMidia
            itens={itens}
            aoEscolher={setDetalhe}
            atalhos={{
              aoVer: setVisualizar,
              aoEditar: setDetalhe,
              aoExcluir: pode(usuario, 'EDITOR') ? setExcluir : undefined,
            }}
          />
        )}

        {!erroLista && <Paginacao pagina={meta.page} totalPaginas={meta.totalPages} aoMudar={setPagina} />}
      </div>

      {/* Reaproveita o seletor no modo "enviar": mesma validação e recorte. */}
      <SeletorMidia
        aberto={enviando}
        aoFechar={() => setEnviando(false)}
        aoEscolher={() => {
          recado.ok('Imagem enviada.');
          void carregar();
        }}
      />

      <Modal
        titulo="Detalhes da imagem"
        aberto={detalhe !== null}
        aoFechar={() => { if (!salvando) setDetalhe(null); }}
        largura={640}
        rodape={
          <>
            {pode(usuario, 'EDITOR') && detalhe && (
              <Botao
                variante="perigo"
                disabled={salvando}
                onClick={() => {
                  setExcluir(detalhe);
                  setDetalhe(null);
                }}
                style={{ marginRight: 'auto' }}
              >
                Excluir
              </Botao>
            )}
            {pode(usuario, 'EDITOR') && detalhe && (
              <Botao
                variante="neutro"
                disabled={salvando}
                onClick={() => {
                  setSubstituindo(detalhe);
                  setDetalhe(null);
                }}
              >
                Substituir imagem
              </Botao>
            )}
            <Botao variante="fantasma" disabled={salvando} onClick={() => setDetalhe(null)}>
              Fechar
            </Botao>
            <Botao variante="primario" carregando={salvando} onClick={salvarDetalhe}>
              Salvar
            </Botao>
          </>
        }
      >
        {detalhe && (
          <>
            <Aviso tipo="erro">{erro}</Aviso>

            <div className="pn-detalhe-midia">
              <NextImage
                src={miniatura(detalhe)}
                alt={detalhe.alt ?? ''}
                width={240}
                height={160}
                unoptimized
              />
              <dl className="pn-dados">
                <div>
                  <dt>Arquivo</dt>
                  <dd style={{ wordBreak: 'break-all' }}>{detalhe.originalFilename}</dd>
                </div>
                <div>
                  <dt>Dimensões</dt>
                  <dd>
                    {detalhe.width && detalhe.height
                      ? `${detalhe.width} × ${detalhe.height}`
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt>Tamanho</dt>
                  <dd>{tamanho(detalhe.size)}</dd>
                </div>
                <div>
                  <dt>Enviada em</dt>
                  <dd>{new Date(detalhe.createdAt).toLocaleDateString('pt-BR')}</dd>
                </div>
              </dl>
            </div>

            <Campo
              rotulo="Texto alternativo"
              dica="Descreve a imagem para leitores de tela e buscadores."
            >
              <Entrada
                value={detalhe.alt ?? ''}
                onChange={(e) => setDetalhe({ ...detalhe, alt: e.target.value })}
                maxLength={320}
              />
            </Campo>

            <div className="pn-linha">
              <Campo rotulo="Crédito">
                <Entrada
                  value={detalhe.credit ?? ''}
                  onChange={(e) => setDetalhe({ ...detalhe, credit: e.target.value })}
                  maxLength={160}
                />
              </Campo>
              <Campo rotulo="Título">
                <Entrada
                  value={detalhe.title ?? ''}
                  onChange={(e) => setDetalhe({ ...detalhe, title: e.target.value })}
                  maxLength={255}
                />
              </Campo>
            </div>

            <Campo rotulo="Legenda">
              <Entrada
                value={detalhe.caption ?? ''}
                onChange={(e) => setDetalhe({ ...detalhe, caption: e.target.value })}
                maxLength={500}
              />
            </Campo>
          </>
        )}
      </Modal>

      <Modal
        titulo={visualizar?.alt || visualizar?.originalFilename || 'Imagem'}
        aberto={visualizar !== null}
        aoFechar={() => setVisualizar(null)}
        largura={1000}
        rodape={
          <>
            <Botao variante="fantasma" onClick={() => setVisualizar(null)}>Fechar</Botao>
            <Botao
              variante="primario"
              onClick={() => {
                setDetalhe(visualizar);
                setVisualizar(null);
              }}
            >
              Editar
            </Botao>
          </>
        }
      >
        {visualizar && (
          <figure className="pn-visualizador">
            <NextImage
              src={
                visualizar.variants?.find((v) => v.type === 'LARGE' && v.format === 'webp')?.url ??
                visualizar.variants?.find((v) => v.type === 'MEDIUM' && v.format === 'webp')?.url ??
                visualizar.url
              }
              alt={visualizar.alt ?? ''}
              width={visualizar.width ?? 1200}
              height={visualizar.height ?? 675}
              unoptimized
            />
            <figcaption>
              {visualizar.width && visualizar.height ? `${visualizar.width} × ${visualizar.height} px` : ''}
              {visualizar.credit ? ` · Crédito: ${visualizar.credit}` : ''}
            </figcaption>
          </figure>
        )}
      </Modal>

      <Modal
        titulo="Substituir imagem"
        aberto={substituindo !== null}
        aoFechar={() => { if (!ocupadoSubstituindo) setSubstituindo(null); }}
        largura={880}
      >
        {substituindo && (
          <>
            <Aviso tipo="info">
              O arquivo novo entra no lugar de “{substituindo.alt || substituindo.originalFilename}” em todo o
              site: capas, fotos, miniaturas e anúncios que usam esta imagem passam a mostrar a nova. Texto
              alternativo, crédito e legenda continuam os mesmos. Imagens já inseridas no meio do texto dos
              artigos mantêm a versão anterior.
            </Aviso>
            <Envio
              substituirId={substituindo.id}
              presetInicial={substituindo.preset}
              aoOcupar={setOcupadoSubstituindo}
              aoCancelar={() => setSubstituindo(null)}
              aoEnviar={(m) => {
                setSubstituindo(null);
                recado.ok('Imagem substituída em todos os lugares onde é usada.');
                void carregar();
                setDetalhe(m);
              }}
            />
          </>
        )}
      </Modal>

      <Confirmacao
        aberto={excluir !== null}
        titulo="Excluir imagem"
        mensagem={`"${excluir?.originalFilename ?? 'Esta imagem'}" será removida da biblioteca. Arquivos já usados em publicações continuam preservados; a limpeza definitiva ocorre após 30 dias.`}
        aoConfirmar={async () => {
          if (!excluir) return;
          try {
            await painel.excluirMidia(excluir.id);
            recado.ok('Imagem excluída.');
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

export default function PaginaMidia() {
  return (
    <MolduraPainel>
      <Midia />
    </MolduraPainel>
  );
}
