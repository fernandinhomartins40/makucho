'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AdPlacement, AdvertisementDto, MediaDto } from '@makucho/types';
import { ErroApi, painel } from '@/lib/painel';
import { MolduraPainel, TituloPagina } from '@/components/painel/moldura-painel';
import { CampoImagem } from '@/components/painel/seletor-midia';
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
  SeloStatus,
  Selecao,
  Vazio,
  useRecado,
} from '@/components/painel/ui';

const POSICOES: Record<AdPlacement, string> = {
  HOME_TOP: 'Home · topo',
  HOME_AFTER_HERO: 'Home · abaixo do destaque',
  HOME_MIDDLE: 'Home · meio',
  SIDEBAR_TOP: 'Lateral · topo',
  SIDEBAR_MIDDLE: 'Lateral · meio',
  ARTICLE_TOP: 'Artigo · topo',
  ARTICLE_MIDDLE: 'Artigo · meio',
  ARTICLE_BOTTOM: 'Artigo · rodapé',
  FOOTER: 'Rodapé do site',
};

interface Formulario {
  id?: string;
  name: string;
  advertiser: string;
  media: MediaDto | null;
  mobileMedia: MediaDto | null;
  targetUrl: string;
  alt: string;
  status: string;
  device: string;
  priority: string;
  placements: AdPlacement[];
  startsAt: string;
  endsAt: string;
  openInNewTab: boolean;
}

const NOVO: Formulario = {
  name: '',
  advertiser: '',
  media: null,
  mobileMedia: null,
  targetUrl: '',
  alt: '',
  status: 'DRAFT',
  device: 'ALL',
  priority: '0',
  placements: [],
  startsAt: '',
  endsAt: '',
  openInNewTab: true,
};

function paraCampoData(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function Anuncios() {
  const recado = useRecado();
  const [itens, setItens] = useState<AdvertisementDto[]>([]);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1, total: 0 });
  const [carregando, setCarregando] = useState(true);
  const [dadosCarregados, setDadosCarregados] = useState(false);
  const [erroLista, setErroLista] = useState<string | null>(null);
  const requisicaoAtual = useRef(0);
  const [pagina, setPagina] = useState(1);
  const [status, setStatus] = useState('');

  const [form, setForm] = useState<Formulario | null>(null);
  const [excluir, setExcluir] = useState<AdvertisementDto | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    const requisicao = ++requisicaoAtual.current;
    setCarregando(true);
    setErroLista(null);
    try {
      const r = await painel.anuncios({
        page: pagina,
        perPage: 20,
        status: status || undefined,
      });
      if (requisicao !== requisicaoAtual.current) return;
      setItens(r.data);
      setMeta({ page: r.meta.page, totalPages: r.meta.totalPages, total: r.meta.total });
      setDadosCarregados(true);
    } catch (e) {
      if (requisicao !== requisicaoAtual.current) return;
      setErroLista(e instanceof ErroApi ? e.message : 'Não foi possível carregar os anúncios.');
    } finally {
      if (requisicao === requisicaoAtual.current) setCarregando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagina, status]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function abrir(a?: AdvertisementDto) {
    setErro('');
    setForm(
      a
        ? {
            id: a.id,
            name: a.name,
            advertiser: a.advertiser ?? '',
            media: a.media,
            mobileMedia: a.mobileMedia,
            targetUrl: a.targetUrl,
            alt: a.alt,
            status: a.status,
            device: a.device,
            priority: String(a.priority),
            placements: a.placements,
            startsAt: paraCampoData(a.startsAt),
            endsAt: paraCampoData(a.endsAt),
            openInNewTab: a.openInNewTab,
          }
        : { ...NOVO },
    );
  }

  async function salvar() {
    if (!form || salvando) return;
    setErro('');

    if (form.name.trim().length < 2) {
      setErro('Informe o nome do anúncio.');
      return;
    }
    if (!form.targetUrl.trim()) {
      setErro('Informe o endereço de destino.');
      return;
    }
    try {
      const destino = new URL(form.targetUrl.trim());
      if (!['http:', 'https:'].includes(destino.protocol)) throw new Error('Protocolo inválido');
    } catch {
      setErro('Informe um endereço de destino válido, começando com https:// ou http://.');
      return;
    }
    if (!form.alt.trim()) {
      setErro('O texto alternativo é obrigatório: ele descreve o anúncio para leitores de tela.');
      return;
    }
    if (form.placements.length === 0) {
      setErro('Escolha ao menos uma posição no site.');
      return;
    }
    if (form.status === 'ACTIVE' && !form.media) {
      setErro('Escolha uma imagem antes de ativar o anúncio.');
      return;
    }
    const prioridade = Number(form.priority);
    if (!Number.isInteger(prioridade) || prioridade < 0 || prioridade > 1000) {
      setErro('A prioridade deve ser um número inteiro entre 0 e 1000.');
      return;
    }
    const inicio = form.startsAt ? new Date(form.startsAt) : null;
    const fim = form.endsAt ? new Date(form.endsAt) : null;
    if ((inicio && Number.isNaN(inicio.getTime())) || (fim && Number.isNaN(fim.getTime()))) {
      setErro('Confira as datas de início e fim da veiculação.');
      return;
    }
    if (inicio && fim && fim.getTime() <= inicio.getTime()) {
      setErro('A data final deve ser posterior à inicial.');
      return;
    }

    setSalvando(true);
    try {
      const corpo = {
        name: form.name.trim(),
        advertiser: form.advertiser.trim() || null,
        mediaId: form.media?.id ?? null,
        mobileMediaId: form.mobileMedia?.id ?? null,
        targetUrl: form.targetUrl.trim(),
        alt: form.alt.trim(),
        status: form.status,
        device: form.device,
        priority: prioridade,
        placements: form.placements,
        openInNewTab: form.openInNewTab,
        startsAt: inicio?.toISOString() ?? null,
        endsAt: fim?.toISOString() ?? null,
      };

      if (form.id) await painel.atualizarAnuncio(form.id, corpo);
      else await painel.criarAnuncio(corpo);

      recado.ok(form.id ? 'Anúncio atualizado.' : 'Anúncio criado.');
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
        titulo="Anúncios"
        descricao={dadosCarregados ? `${meta.total.toLocaleString('pt-BR')} cadastrado${meta.total === 1 ? '' : 's'}` : 'Aguardando dados do painel'}
        acoes={
          <Botao variante="primario" onClick={() => abrir()}>
            + Novo anúncio
          </Botao>
        }
      />

      <div className="pn-filtros">
        <Selecao
          aria-label="Filtrar anúncios por status"
          value={status}
          onChange={(e) => {
            setPagina(1);
            setStatus(e.target.value);
          }}
        >
          <option value="">Todos os status</option>
          <option value="ACTIVE">Ativo</option>
          <option value="PAUSED">Pausado</option>
          <option value="DRAFT">Rascunho</option>
          <option value="EXPIRED">Expirado</option>
        </Selecao>
      </div>

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
            titulo="Nenhum anúncio"
            descricao="Cadastre as peças publicitárias e escolha onde elas aparecem."
            acao={
              <Botao variante="primario" onClick={() => abrir()}>
                + Novo anúncio
              </Botao>
            }
          />
        ) : (
          <div className="pn-tabela-area">
            <table className="pn-tabela">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Anunciante</th>
                  <th>Posições</th>
                  <th>Status</th>
                  <th>Impressões</th>
                  <th>Cliques</th>
                  <th style={{ textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((a) => {
                  const ctr = a.impressions > 0 ? (a.clicks / a.impressions) * 100 : 0;
                  return (
                    <tr key={a.id}>
                      <td>
                        <button type="button" className="pn-link" onClick={() => abrir(a)}>
                          {a.name}
                        </button>
                      </td>
                      <td style={{ color: 'var(--pn-suave)' }}>{a.advertiser ?? '—'}</td>
                      <td style={{ fontSize: '0.78rem', color: 'var(--pn-suave)' }}>
                        {a.placements.length === 1
                          ? POSICOES[a.placements[0] as AdPlacement]
                          : `${a.placements.length} posições`}
                      </td>
                      <td>
                        <SeloStatus status={a.status} />
                      </td>
                      <td>{a.impressions.toLocaleString('pt-BR')}</td>
                      <td>
                        {a.clicks.toLocaleString('pt-BR')}
                        {a.impressions > 0 && (
                          <small style={{ display: 'block', color: 'var(--pn-suave)' }}>
                            {ctr.toFixed(2)}%
                          </small>
                        )}
                      </td>
                      <td>
                        <div className="pn-acoes">
                          <Botao variante="fantasma" onClick={() => abrir(a)}>
                            Editar
                          </Botao>
                          <Botao variante="fantasma" onClick={() => setExcluir(a)}>
                            Excluir
                          </Botao>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!erroLista && <Paginacao pagina={meta.page} totalPaginas={meta.totalPages} aoMudar={setPagina} />}
      </div>

      <Modal
        titulo={form?.id ? 'Editar anúncio' : 'Novo anúncio'}
        aberto={form !== null}
        aoFechar={() => { if (!salvando) setForm(null); }}
        largura={640}
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

            <div className="pn-linha">
              <Campo rotulo="Nome interno" obrigatorio>
                <Entrada
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  autoFocus
                  maxLength={160}
                />
              </Campo>
              <Campo rotulo="Anunciante">
                <Entrada
                  value={form.advertiser}
                  onChange={(e) => setForm({ ...form, advertiser: e.target.value })}
                  maxLength={160}
                />
              </Campo>
            </div>

            <CampoImagem
              rotulo="Imagem"
              midia={form.media}
              aoMudar={(m) => setForm({ ...form, media: m })}
            />

            <CampoImagem
              rotulo="Imagem para celular"
              midia={form.mobileMedia}
              aoMudar={(m) => setForm({ ...form, mobileMedia: m })}
              dica="Opcional. Sem ela, a imagem principal é usada em qualquer tela."
            />

            <Campo rotulo="Endereço de destino" obrigatorio>
              <Entrada
                value={form.targetUrl}
                onChange={(e) => setForm({ ...form, targetUrl: e.target.value })}
                placeholder="https://anunciante.com.br"
              />
            </Campo>

            <Campo
              rotulo="Texto alternativo"
              obrigatorio
              dica="Descreve o anúncio para quem usa leitor de tela."
            >
              <Entrada
                value={form.alt}
                onChange={(e) => setForm({ ...form, alt: e.target.value })}
                maxLength={320}
              />
            </Campo>

            <Campo rotulo="Posições no site" obrigatorio>
              <div className="pn-posicoes">
                {(Object.keys(POSICOES) as AdPlacement[]).map((p) => {
                  const marcada = form.placements.includes(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      className={`pn-tag ${marcada ? 'pn-tag-on' : ''}`}
                      aria-pressed={marcada}
                      onClick={() =>
                        setForm({
                          ...form,
                          placements: marcada
                            ? form.placements.filter((x) => x !== p)
                            : [...form.placements, p],
                        })
                      }
                    >
                      {POSICOES[p]}
                    </button>
                  );
                })}
              </div>
            </Campo>

            <div className="pn-linha">
              <Campo rotulo="Status">
                <Selecao
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  <option value="DRAFT">Rascunho</option>
                  <option value="ACTIVE">Ativo</option>
                  <option value="PAUSED">Pausado</option>
                  <option value="EXPIRED">Expirado</option>
                </Selecao>
              </Campo>

              <Campo rotulo="Aparelho">
                <Selecao
                  value={form.device}
                  onChange={(e) => setForm({ ...form, device: e.target.value })}
                >
                  <option value="ALL">Todos</option>
                  <option value="DESKTOP">Computador</option>
                  <option value="MOBILE">Celular</option>
                </Selecao>
              </Campo>

              <Campo rotulo="Prioridade" dica="Maior aparece primeiro.">
                <Entrada
                  type="number"
                  min={0}
                  max={1000}
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value })}
                />
              </Campo>
            </div>

            <div className="pn-linha">
              <Campo rotulo="Início da veiculação">
                <Entrada
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                />
              </Campo>
              <Campo rotulo="Fim da veiculação">
                <Entrada
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
                />
              </Campo>
            </div>

            <Alternador
              marcado={form.openInNewTab}
              aoMudar={(v) => setForm({ ...form, openInNewTab: v })}
              rotulo="Abrir em nova aba"
            />
          </>
        )}
      </Modal>

      <Confirmacao
        aberto={excluir !== null}
        titulo="Excluir anúncio"
        mensagem={`"${excluir?.name}" sai do ar imediatamente. As métricas são perdidas.`}
        aoConfirmar={async () => {
          if (!excluir) return;
          try {
            await painel.excluirAnuncio(excluir.id);
            recado.ok('Anúncio excluído.');
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

export default function PaginaAnuncios() {
  return (
    <MolduraPainel>
      <Anuncios />
    </MolduraPainel>
  );
}
