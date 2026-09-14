'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import NextImage from 'next/image';
import type { MediaDto } from '@makucho/types';
import { ErroApi, painel, pode } from '@/lib/painel';
import { useSessao } from '@/components/painel/sessao';
import { MolduraPainel, TituloPagina } from '@/components/painel/moldura-painel';
import { GradeMidia, SeletorMidia, miniatura } from '@/components/painel/seletor-midia';
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
  const [pagina, setPagina] = useState(1);
  const [busca, setBusca] = useState('');
  const [termo, setTermo] = useState('');
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);

  const [enviando, setEnviando] = useState(false);
  const [detalhe, setDetalhe] = useState<MediaDto | null>(null);
  const [excluir, setExcluir] = useState<MediaDto | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await painel.midias({ page: pagina, perPage: 36, search: termo || undefined });
      setItens(r.data);
      setMeta({ page: r.meta.page, totalPages: r.meta.totalPages, total: r.meta.total });
    } catch (e) {
      recado.erro(e instanceof ErroApi ? e.message : 'Não foi possível carregar a biblioteca.');
    } finally {
      setCarregando(false);
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
    if (!detalhe) return;
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
        descricao={`${meta.total.toLocaleString('pt-BR')} imagem${meta.total === 1 ? '' : 's'}`}
        acoes={
          <Botao variante="primario" onClick={() => setEnviando(true)}>
            + Enviar imagem
          </Botao>
        }
      />

      <div className="pn-filtros">
        <Entrada
          className="pn-busca"
          placeholder="Buscar por descrição ou arquivo…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      <div className="pn-bloco">
        {carregando ? (
          <Carregando />
        ) : itens.length === 0 ? (
          <Vazio
            titulo={termo ? 'Nada encontrado' : 'Biblioteca vazia'}
            descricao={
              termo
                ? 'Tente outro termo de busca.'
                : 'Envie imagens para usar nas publicações, vídeos e anúncios.'
            }
            acao={
              !termo && (
                <Botao variante="primario" onClick={() => setEnviando(true)}>
                  + Enviar imagem
                </Botao>
              )
            }
          />
        ) : (
          <GradeMidia itens={itens} aoEscolher={setDetalhe} />
        )}

        <Paginacao pagina={meta.page} totalPaginas={meta.totalPages} aoMudar={setPagina} />
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
        aoFechar={() => setDetalhe(null)}
        largura={640}
        rodape={
          <>
            {pode(usuario, 'EDITOR') && detalhe && (
              <Botao
                variante="perigo"
                onClick={() => {
                  setExcluir(detalhe);
                  setDetalhe(null);
                }}
                style={{ marginRight: 'auto' }}
              >
                Excluir
              </Botao>
            )}
            <Botao variante="fantasma" onClick={() => setDetalhe(null)}>
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

      <Confirmacao
        aberto={excluir !== null}
        titulo="Excluir imagem"
        mensagem="A imagem e todas as suas variantes serão apagadas do servidor. Publicações que a usam ficarão sem capa."
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
