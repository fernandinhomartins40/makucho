'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AD_FORMAT_DEFINITIONS,
  type AdBillingStatus,
  type AdFormat,
  type AdPlacement,
  type AdPricingModel,
  type AdsSummaryDto,
  type AdvertisementDto,
  type MediaDto,
} from '@makucho/types';
import { ErroApi, painel } from '@/lib/painel';
import { MolduraPainel, TituloPagina } from '@/components/painel/moldura-painel';
import { CampoImagem } from '@/components/painel/seletor-midia';
import {
  Alternador,
  AreaTexto,
  Aviso,
  Botao,
  Campo,
  Carregando,
  Confirmacao,
  Entrada,
  Etiqueta,
  Modal,
  Paginacao,
  SeloStatus,
  Selecao,
  Vazio,
  useRecado,
} from '@/components/painel/ui';

/**
 * Gestão de anúncios: formato e posições, veiculação por período,
 * competição por valor e controle de cobrança (sem gateway de pagamento).
 */

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

const MODELOS: Record<AdPricingModel, { rotulo: string; valor: string }> = {
  FIXED: { rotulo: 'Valor fixo pelo período', valor: 'Valor total do período (R$)' },
  CPM: { rotulo: 'Por mil impressões (CPM)', valor: 'Valor por mil impressões (R$)' },
  CPC: { rotulo: 'Por clique (CPC)', valor: 'Valor por clique (R$)' },
};

const COBRANCA: Record<AdBillingStatus, { texto: string; cor: string }> = {
  PENDING: { texto: 'A cobrar', cor: '#b45309' },
  INVOICED: { texto: 'Cobrado', cor: '#1f6bff' },
  PAID: { texto: 'Pago', cor: '#16a34a' },
  OVERDUE: { texto: 'Em atraso', cor: '#dc2626' },
  COURTESY: { texto: 'Cortesia', cor: '#7c3aed' },
};

const brl = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const DIA = 86_400_000;

function SeloCobranca({ status }: { status: AdBillingStatus }) {
  return <Etiqueta texto={COBRANCA[status].texto} cor={COBRANCA[status].cor} />;
}

/** "faltam 5 dias", "vence hoje", "vencido há 3 dias", "sem data de fim". */
function prazo(a: Pick<AdvertisementDto, 'startsAt' | 'endsAt'>): { texto: string; tom: 'ok' | 'alerta' | 'vencido' | 'neutro' } {
  if (!a.endsAt) return { texto: 'Sem data de fim', tom: 'neutro' };
  const agora = Date.now();
  if (a.startsAt && new Date(a.startsAt).getTime() > agora) {
    const d = Math.ceil((new Date(a.startsAt).getTime() - agora) / DIA);
    return { texto: `Começa em ${d} dia${d === 1 ? '' : 's'}`, tom: 'neutro' };
  }
  const dias = Math.ceil((new Date(a.endsAt).getTime() - agora) / DIA);
  if (dias < 0) return { texto: `Vencido há ${-dias} dia${dias === -1 ? '' : 's'}`, tom: 'vencido' };
  if (dias === 0) return { texto: 'Vence hoje', tom: 'alerta' };
  return { texto: `Faltam ${dias} dia${dias === 1 ? '' : 's'}`, tom: dias <= 7 ? 'alerta' : 'ok' };
}

function paraCampoData(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function paraCampoDia(iso: string | null): string {
  return iso ? paraCampoData(iso).slice(0, 10) : '';
}

/** Aceita "1.500,00", "1500,5" e "1500.50". */
function dinheiro(texto: string): number | null {
  const t = texto.trim().replace(/\s|R\$/g, '');
  if (!t) return null;
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) ? n : NaN;
}

interface Formulario {
  id?: string;
  name: string;
  advertiser: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  format: AdFormat | '';
  placements: AdPlacement[];
  device: string;
  media: MediaDto | null;
  mobileMedia: MediaDto | null;
  targetUrl: string;
  alt: string;
  openInNewTab: boolean;
  status: string;
  startsAt: string;
  endsAt: string;
  pricingModel: AdPricingModel;
  price: string;
  impressionGoal: string;
  billingStatus: AdBillingStatus;
  billingDueDate: string;
  billingNotes: string;
  isExclusive: boolean;
  priority: string;
}

function novoFormulario(): Formulario {
  const inicio = new Date();
  inicio.setMinutes(0, 0, 0);
  const fim = new Date(inicio.getTime() + 30 * DIA);
  return {
    name: '', advertiser: '', contactName: '', contactEmail: '', contactPhone: '',
    format: 'LEADERBOARD', placements: [], device: 'ALL',
    media: null, mobileMedia: null, targetUrl: '', alt: '', openInNewTab: true,
    status: 'DRAFT', startsAt: paraCampoData(inicio.toISOString()), endsAt: paraCampoData(fim.toISOString()),
    pricingModel: 'FIXED', price: '', impressionGoal: '', billingStatus: 'PENDING',
    billingDueDate: paraCampoDia(inicio.toISOString()), billingNotes: '',
    isExclusive: false, priority: '0',
  };
}

// ============================================================
// Resumo comercial
// ============================================================

function Resumo({ resumo, aoAbrir, aoRenovar, aoPagar }: {
  resumo: AdsSummaryDto;
  aoAbrir: (id: string) => void;
  aoRenovar: (id: string) => void;
  aoPagar: (id: string) => void;
}) {
  const c = resumo.cobranca;
  const atencao = resumo.vencendo.length + resumo.vencidos.filter((v) => v.billingStatus !== 'PAID').length + c.atrasados.length;
  return (
    <>
      <div className="pn-cartoes pn-ads-cartoes">
        <div className="pn-cartao pn-cartao-ok"><strong>{resumo.ativos}</strong><span>No ar agora</span></div>
        <div className={`pn-cartao ${resumo.vencendo.length ? 'pn-cartao-alerta' : ''}`}><strong>{resumo.vencendo.length}</strong><span>Vencem em 7 dias</span></div>
        <div className="pn-cartao"><strong>{brl(c.aReceber)}</strong><span>A receber</span></div>
        <div className={`pn-cartao ${c.emAtraso ? 'pn-cartao-perigo' : ''}`}><strong>{brl(c.emAtraso)}</strong><span>Em atraso</span></div>
        <div className="pn-cartao"><strong>{brl(c.recebido)}</strong><span>Recebido</span></div>
        <div className="pn-cartao"><strong>{brl(c.contratadoMes)}</strong><span>Contratado no mês</span></div>
      </div>

      {atencao > 0 && (
        <section className="pn-bloco pn-ads-atencao" aria-labelledby="ads-atencao">
          <h2 id="ads-atencao" className="pn-bloco-h2">Precisa de atenção</h2>
          <ul className="pn-ads-alertas">
            {c.atrasados.map((a) => (
              <li key={`atraso-${a.id}`} className="pn-ads-alerta pn-ads-alerta-perigo">
                <div>
                  <strong>{a.advertiser ?? a.name}</strong>
                  <span>Pagamento em atraso desde {new Date(a.billingDueDate).toLocaleDateString('pt-BR')} · {brl(a.valor)}</span>
                </div>
                <div className="pn-acoes">
                  <Botao variante="fantasma" onClick={() => aoAbrir(a.id)}>Ver</Botao>
                  <Botao variante="neutro" onClick={() => aoPagar(a.id)}>Marcar como pago</Botao>
                </div>
              </li>
            ))}
            {resumo.vencendo.map((a) => (
              <li key={`vence-${a.id}`} className="pn-ads-alerta pn-ads-alerta-aviso">
                <div>
                  <strong>{a.advertiser ?? a.name}</strong>
                  <span>{a.name} · {a.dias <= 0 ? 'vence hoje' : `vence em ${a.dias} dia${a.dias === 1 ? '' : 's'}`} ({new Date(a.endsAt).toLocaleDateString('pt-BR')})</span>
                </div>
                <div className="pn-acoes">
                  <Botao variante="fantasma" onClick={() => aoAbrir(a.id)}>Ver</Botao>
                  <Botao variante="neutro" onClick={() => aoRenovar(a.id)}>Renovar</Botao>
                </div>
              </li>
            ))}
            {resumo.vencidos.filter((v) => v.billingStatus !== 'PAID').map((a) => (
              <li key={`vencido-${a.id}`} className="pn-ads-alerta">
                <div>
                  <strong>{a.advertiser ?? a.name}</strong>
                  <span>{a.name} · vencido há {a.dias} dia{a.dias === 1 ? '' : 's'} · <SeloCobranca status={a.billingStatus} /></span>
                </div>
                <div className="pn-acoes">
                  <Botao variante="fantasma" onClick={() => aoAbrir(a.id)}>Ver</Botao>
                  <Botao variante="neutro" onClick={() => aoRenovar(a.id)}>Renovar</Botao>
                  {a.billingStatus !== 'COURTESY' && <Botao variante="fantasma" onClick={() => aoPagar(a.id)}>Marcar como pago</Botao>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="pn-ads-duas">
        <section className="pn-bloco" aria-labelledby="ads-competicao">
          <h2 id="ads-competicao" className="pn-bloco-h2">Competição por posição</h2>
          <p className="pn-dica">Parte das exibições que cada anúncio recebe agora. Quem paga mais por exibição (ou tem prioridade maior) aparece mais; um patrocínio exclusivo ocupa a posição sozinho.</p>
          {resumo.competicao.length === 0 ? (
            <p className="pn-dica">Nenhum anúncio no ar.</p>
          ) : (
            resumo.competicao.map((p) => (
              <div key={p.placement} className="pn-ads-posicao">
                <strong>{POSICOES[p.placement]}</strong>
                {p.anuncios.map((a) => (
                  <div key={a.id} className="pn-ads-barra">
                    <span className="pn-ads-barra-nome">{a.advertiser ?? a.name}{a.exclusivo ? ' · exclusivo' : ''}</span>
                    <span className="pn-ads-barra-trilho" aria-hidden="true"><span style={{ width: `${a.share}%` }} /></span>
                    <span className="pn-ads-barra-valor">{a.share.toLocaleString('pt-BR')}%</span>
                  </div>
                ))}
              </div>
            ))
          )}
        </section>

        <section className="pn-bloco" aria-labelledby="ads-carteira">
          <h2 id="ads-carteira" className="pn-bloco-h2">Carteira por anunciante</h2>
          {resumo.anunciantes.length === 0 ? (
            <p className="pn-dica">Sem anunciantes cadastrados.</p>
          ) : (
            <table className="pn-tabela pn-ads-carteira">
              <thead>
                <tr><th>Anunciante</th><th>Anúncios</th><th>Contratado</th><th>Recebido</th><th>A receber</th></tr>
              </thead>
              <tbody>
                {resumo.anunciantes.map((a) => (
                  <tr key={a.advertiser}>
                    <td>{a.advertiser}</td>
                    <td>{a.anuncios}</td>
                    <td>{brl(a.contratado)}</td>
                    <td>{brl(a.recebido)}</td>
                    <td className={a.aReceber > 0 ? 'pn-desce' : undefined}>{brl(a.aReceber)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </>
  );
}

// ============================================================
// Tela
// ============================================================

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
  const [cobranca, setCobranca] = useState('');
  const [resumo, setResumo] = useState<AdsSummaryDto | null>(null);

  const [form, setForm] = useState<Formulario | null>(null);
  const [excluir, setExcluir] = useState<AdvertisementDto | null>(null);
  const [renovar, setRenovar] = useState<{ anuncio: AdvertisementDto; dias: number; valor: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const carregarResumo = useCallback(async () => {
    try {
      setResumo(await painel.resumoAnuncios());
    } catch {
      setResumo(null);
    }
  }, []);

  const carregar = useCallback(async () => {
    const requisicao = ++requisicaoAtual.current;
    setCarregando(true);
    setErroLista(null);
    try {
      const r = await painel.anuncios({ page: pagina, perPage: 20, status: status || undefined, billingStatus: cobranca || undefined });
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
  }, [pagina, status, cobranca]);

  const atualizarTudo = useCallback(() => {
    void carregar();
    void carregarResumo();
  }, [carregar, carregarResumo]);

  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => { void carregarResumo(); }, [carregarResumo]);

  async function buscar(id: string) {
    return itens.find((a) => a.id === id) ?? (await painel.anuncio(id));
  }

  function abrir(a?: AdvertisementDto) {
    setErro('');
    if (!a) {
      setForm(novoFormulario());
      return;
    }
    setForm({
      id: a.id,
      name: a.name,
      advertiser: a.advertiser ?? '',
      contactName: a.contactName ?? '',
      contactEmail: a.contactEmail ?? '',
      contactPhone: a.contactPhone ?? '',
      format: a.format ?? '',
      placements: a.placements,
      device: a.device,
      media: a.media,
      mobileMedia: a.mobileMedia,
      targetUrl: a.targetUrl,
      alt: a.alt,
      openInNewTab: a.openInNewTab,
      status: a.status,
      startsAt: paraCampoData(a.startsAt),
      endsAt: paraCampoData(a.endsAt),
      pricingModel: a.pricingModel,
      price: a.price === null ? '' : String(a.price).replace('.', ','),
      impressionGoal: a.impressionGoal === null ? '' : String(a.impressionGoal),
      billingStatus: a.billingStatus,
      billingDueDate: paraCampoDia(a.billingDueDate),
      billingNotes: a.billingNotes ?? '',
      isExclusive: a.isExclusive,
      priority: String(a.priority),
    });
  }

  function definirDias(dias: number) {
    if (!form) return;
    const inicio = form.startsAt ? new Date(form.startsAt) : new Date();
    setForm({ ...form, startsAt: paraCampoData(inicio.toISOString()), endsAt: paraCampoData(new Date(inicio.getTime() + dias * DIA).toISOString()) });
  }

  async function salvar() {
    if (!form || salvando) return;
    setErro('');
    const falha = (m: string) => { setErro(m); return; };

    if (form.name.trim().length < 2) return falha('Informe o nome do anúncio.');
    if (!form.targetUrl.trim()) return falha('Informe o endereço de destino.');
    try {
      const destino = new URL(form.targetUrl.trim());
      if (!['http:', 'https:'].includes(destino.protocol)) throw new Error('protocolo');
    } catch {
      return falha('Informe um endereço de destino válido, começando com https:// ou http://.');
    }
    if (!form.alt.trim()) return falha('O texto alternativo é obrigatório: ele descreve o anúncio para leitores de tela.');
    if (form.placements.length === 0) return falha('Escolha ao menos uma posição no site.');
    if (form.status === 'ACTIVE' && !form.media) return falha('Escolha a imagem do anúncio antes de ativá-lo.');
    const prioridade = Number(form.priority);
    if (!Number.isInteger(prioridade) || prioridade < 0 || prioridade > 1000) return falha('A prioridade deve ser um número inteiro entre 0 e 1000.');
    const inicio = form.startsAt ? new Date(form.startsAt) : null;
    const fim = form.endsAt ? new Date(form.endsAt) : null;
    if ((inicio && Number.isNaN(inicio.getTime())) || (fim && Number.isNaN(fim.getTime()))) return falha('Confira as datas de início e fim da veiculação.');
    if (inicio && fim && fim.getTime() <= inicio.getTime()) return falha('A data final deve ser posterior à inicial.');
    const preco = dinheiro(form.price);
    if (Number.isNaN(preco)) return falha('Informe o valor em reais, por exemplo 1.500,00.');
    if (form.pricingModel !== 'FIXED' && form.billingStatus !== 'COURTESY' && !(preco && preco > 0)) return falha('Informe o valor por mil impressões ou por clique.');
    const meta = form.impressionGoal.trim() ? Number(form.impressionGoal) : null;
    if (meta !== null && (!Number.isInteger(meta) || meta < 1)) return falha('A meta de impressões deve ser um número inteiro.');
    if (form.contactEmail.trim() && !/^\S+@\S+\.\S+$/.test(form.contactEmail.trim())) return falha('Confira o e-mail de contato.');

    setSalvando(true);
    try {
      const corpo = {
        name: form.name.trim(),
        advertiser: form.advertiser.trim() || null,
        contactName: form.contactName.trim() || null,
        contactEmail: form.contactEmail.trim() || null,
        contactPhone: form.contactPhone.trim() || null,
        format: form.format || null,
        placements: form.placements,
        device: form.device,
        mediaId: form.media?.id ?? null,
        mobileMediaId: form.mobileMedia?.id ?? null,
        widthPx: form.format ? AD_FORMAT_DEFINITIONS[form.format].width : null,
        heightPx: form.format ? AD_FORMAT_DEFINITIONS[form.format].height : null,
        targetUrl: form.targetUrl.trim(),
        alt: form.alt.trim(),
        openInNewTab: form.openInNewTab,
        status: form.status,
        startsAt: inicio?.toISOString() ?? null,
        endsAt: fim?.toISOString() ?? null,
        pricingModel: form.pricingModel,
        price: preco,
        impressionGoal: form.pricingModel === 'CPM' ? meta : null,
        billingStatus: form.billingStatus,
        billingDueDate: form.billingDueDate ? new Date(`${form.billingDueDate}T12:00:00`).toISOString() : null,
        billingNotes: form.billingNotes.trim() || null,
        isExclusive: form.isExclusive,
        priority: prioridade,
      };
      if (form.id) await painel.atualizarAnuncio(form.id, corpo);
      else await painel.criarAnuncio(corpo);
      recado.ok(form.id ? 'Anúncio atualizado.' : 'Anúncio criado.');
      setForm(null);
      atualizarTudo();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  async function marcarPago(id: string) {
    try {
      await painel.atualizarAnuncio(id, { billingStatus: 'PAID' });
      recado.ok('Pagamento registrado.');
      atualizarTudo();
    } catch (e) {
      recado.erro(e instanceof ErroApi ? e.message : 'Não foi possível registrar o pagamento.');
    }
  }

  async function abrirRenovacao(id: string) {
    try {
      const a = await buscar(id);
      setRenovar({ anuncio: a, dias: 30, valor: a.price === null ? '' : String(a.price).replace('.', ',') });
    } catch {
      recado.erro('Não foi possível abrir o anúncio.');
    }
  }

  /** Novo período a partir do fim do atual (ou de hoje, se já venceu), de volta ao ar e a cobrar. */
  async function confirmarRenovacao() {
    if (!renovar) return;
    const { anuncio, dias } = renovar;
    const preco = dinheiro(renovar.valor);
    if (Number.isNaN(preco)) {
      recado.erro('Informe o valor do novo período em reais.');
      return;
    }
    const fimAtual = anuncio.endsAt ? new Date(anuncio.endsAt).getTime() : 0;
    const inicio = new Date(Math.max(Date.now(), fimAtual));
    const fim = new Date(inicio.getTime() + dias * DIA);
    try {
      await painel.atualizarAnuncio(anuncio.id, {
        startsAt: inicio.toISOString(),
        endsAt: fim.toISOString(),
        status: anuncio.media ? 'ACTIVE' : anuncio.status,
        price: preco,
        billingStatus: anuncio.billingStatus === 'COURTESY' ? 'COURTESY' : 'PENDING',
        billingDueDate: inicio.toISOString(),
        paidAt: null,
      });
      recado.ok(`Renovado até ${fim.toLocaleDateString('pt-BR')}. A cobrança do novo período ficou "A cobrar".`);
      setRenovar(null);
      atualizarTudo();
    } catch (e) {
      recado.erro(e instanceof ErroApi ? e.message : 'Não foi possível renovar.');
    }
  }

  const formato = form?.format ? AD_FORMAT_DEFINITIONS[form.format] : null;
  const posicoesPermitidas = formato ? formato.placements : (Object.keys(POSICOES) as AdPlacement[]);
  const duracao = form?.startsAt && form.endsAt
    ? Math.round((new Date(form.endsAt).getTime() - new Date(form.startsAt).getTime()) / DIA)
    : null;

  return (
    <>
      <TituloPagina
        titulo="Anúncios"
        descricao="Formatos, posições, período no ar, competição por valor e cobrança dos anunciantes."
        acoes={<Botao variante="primario" onClick={() => abrir()}>+ Novo anúncio</Botao>}
      />

      {resumo && (
        <Resumo
          resumo={resumo}
          aoAbrir={(id) => void buscar(id).then(abrir)}
          aoRenovar={(id) => void abrirRenovacao(id)}
          aoPagar={(id) => void marcarPago(id)}
        />
      )}

      <div className="pn-filtros">
        <Selecao aria-label="Filtrar por situação" value={status} onChange={(e) => { setPagina(1); setStatus(e.target.value); }}>
          <option value="">Toda situação</option>
          <option value="ACTIVE">No ar</option>
          <option value="PAUSED">Pausado</option>
          <option value="DRAFT">Rascunho</option>
          <option value="EXPIRED">Vencido</option>
        </Selecao>
        <Selecao aria-label="Filtrar por pagamento" value={cobranca} onChange={(e) => { setPagina(1); setCobranca(e.target.value); }}>
          <option value="">Todo pagamento</option>
          {(Object.keys(COBRANCA) as AdBillingStatus[]).map((k) => <option key={k} value={k}>{COBRANCA[k].texto}</option>)}
        </Selecao>
      </div>

      <div className="pn-bloco">
        {erroLista && (
          <div className="pn-erro-lista">
            <Aviso tipo="erro">{erroLista}</Aviso>
            <Botao variante="neutro" onClick={() => void carregar()}>Tentar novamente</Botao>
          </div>
        )}
        {carregando ? (
          <Carregando />
        ) : erroLista && !dadosCarregados ? null : itens.length === 0 ? (
          <Vazio
            titulo={status || cobranca ? 'Nada com esse filtro' : 'Nenhum anúncio'}
            descricao="Cadastre o anunciante, o formato, as posições, o período e o valor contratado."
            acao={<Botao variante="primario" onClick={() => abrir()}>+ Novo anúncio</Botao>}
          />
        ) : (
          <div className="pn-tabela-area">
            <table className="pn-tabela pn-ads-tabela">
              <thead>
                <tr>
                  <th>Anúncio</th>
                  <th>Período</th>
                  <th>Contrato</th>
                  <th>Pagamento</th>
                  <th>Desempenho</th>
                  <th style={{ textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((a) => {
                  const p = prazo(a);
                  const ctr = a.impressions > 0 ? (a.clicks / a.impressions) * 100 : 0;
                  return (
                    <tr key={a.id}>
                      <td>
                        <button type="button" className="pn-link pn-tabela-titulo" onClick={() => abrir(a)}>{a.name}</button>
                        <small className="pn-tabela-sub">
                          {a.advertiser ?? 'Sem anunciante'}
                          {a.format ? ` · ${AD_FORMAT_DEFINITIONS[a.format].label} ${AD_FORMAT_DEFINITIONS[a.format].width}×${AD_FORMAT_DEFINITIONS[a.format].height}` : ''}
                          {' · '}{a.placements.length === 1 ? POSICOES[a.placements[0] as AdPlacement] : `${a.placements.length} posições`}
                          {a.isExclusive ? ' · exclusivo' : ''}
                        </small>
                      </td>
                      <td>
                        <SeloStatus status={a.status} />
                        <small className={`pn-tabela-sub pn-prazo-${p.tom}`}>{p.texto}</small>
                      </td>
                      <td>
                        {a.billingStatus === 'COURTESY' ? 'Cortesia' : brl(a.price)}
                        <small className="pn-tabela-sub">
                          {a.pricingModel === 'FIXED' ? 'pelo período' : a.pricingModel === 'CPM' ? `por mil${a.impressionGoal ? ` · meta ${a.impressionGoal.toLocaleString('pt-BR')}` : ''}` : 'por clique'}
                        </small>
                      </td>
                      <td>
                        <SeloCobranca status={a.billingStatus} />
                        <small className="pn-tabela-sub">
                          {a.billingStatus === 'PAID' && a.paidAt ? `em ${new Date(a.paidAt).toLocaleDateString('pt-BR')}` : a.amountDue !== null && a.billingStatus !== 'COURTESY' ? `devido ${brl(a.amountDue)}` : ''}
                        </small>
                      </td>
                      <td>
                        {a.impressions.toLocaleString('pt-BR')} exib.
                        <small className="pn-tabela-sub">{a.clicks.toLocaleString('pt-BR')} cliques · CTR {ctr.toFixed(2).replace('.', ',')}%</small>
                      </td>
                      <td>
                        <div className="pn-acoes">
                          <Botao variante="fantasma" onClick={() => abrir(a)}>Editar</Botao>
                          <Botao variante="fantasma" onClick={() => setRenovar({ anuncio: a, dias: 30, valor: a.price === null ? '' : String(a.price).replace('.', ',') })}>Renovar</Botao>
                          {a.billingStatus !== 'PAID' && a.billingStatus !== 'COURTESY' && (
                            <Botao variante="fantasma" onClick={() => void marcarPago(a.id)}>Pago</Botao>
                          )}
                          <Botao variante="perigo-suave" onClick={() => setExcluir(a)}>Excluir</Botao>
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
        largura={760}
        rodape={
          <>
            <Botao variante="fantasma" disabled={salvando} onClick={() => setForm(null)}>Cancelar</Botao>
            <Botao variante="primario" carregando={salvando} onClick={salvar}>Salvar</Botao>
          </>
        }
      >
        {form && (
          <div className="pn-ads-form">
            <Aviso tipo="erro">{erro}</Aviso>

            <fieldset>
              <legend>1. Cliente</legend>
              <div className="pn-linha">
                <Campo rotulo="Nome interno do anúncio" obrigatorio>
                  <Entrada value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus maxLength={160} placeholder="Campanha Primavera — Banco X" />
                </Campo>
                <Campo rotulo="Anunciante (cliente)">
                  <Entrada value={form.advertiser} onChange={(e) => setForm({ ...form, advertiser: e.target.value })} maxLength={160} placeholder="Banco X" />
                </Campo>
              </div>
              <div className="pn-linha">
                <Campo rotulo="Contato">
                  <Entrada value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} maxLength={160} />
                </Campo>
                <Campo rotulo="E-mail">
                  <Entrada type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} maxLength={255} />
                </Campo>
                <Campo rotulo="Telefone">
                  <Entrada type="tel" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} maxLength={40} />
                </Campo>
              </div>
            </fieldset>

            <fieldset>
              <legend>2. Formato e posições</legend>
              <Campo rotulo="Formato" dica={formato ? `${formato.width}×${formato.height} px · ${formato.description}` : 'Sem formato definido: vale em qualquer posição (anúncios antigos).'}>
                <Selecao
                  value={form.format}
                  onChange={(e) => {
                    const novo = e.target.value as AdFormat | '';
                    const permitidas = novo ? AD_FORMAT_DEFINITIONS[novo].placements : null;
                    setForm({ ...form, format: novo, placements: permitidas ? form.placements.filter((p) => permitidas.includes(p)) : form.placements });
                  }}
                >
                  {(Object.keys(AD_FORMAT_DEFINITIONS) as AdFormat[]).map((f) => (
                    <option key={f} value={f}>{AD_FORMAT_DEFINITIONS[f].label} ({AD_FORMAT_DEFINITIONS[f].width}×{AD_FORMAT_DEFINITIONS[f].height})</option>
                  ))}
                  {!form.format && <option value="">Sem formato</option>}
                </Selecao>
              </Campo>
              <Campo rotulo="Onde aparece" obrigatorio dica="Só as posições que comportam o formato escolhido.">
                <div className="pn-posicoes">
                  {posicoesPermitidas.map((p) => {
                    const marcada = form.placements.includes(p);
                    return (
                      <button key={p} type="button" className={`pn-tag ${marcada ? 'pn-tag-on' : ''}`} aria-pressed={marcada}
                        onClick={() => setForm({ ...form, placements: marcada ? form.placements.filter((x) => x !== p) : [...form.placements, p] })}>
                        {POSICOES[p]}
                      </button>
                    );
                  })}
                </div>
              </Campo>
              <Campo rotulo="Aparelho">
                <Selecao value={form.device} onChange={(e) => setForm({ ...form, device: e.target.value })}>
                  <option value="ALL">Computador e celular</option>
                  <option value="DESKTOP">Só computador</option>
                  <option value="MOBILE">Só celular</option>
                </Selecao>
              </Campo>
            </fieldset>

            <fieldset>
              <legend>3. Peça</legend>
              <div className="pn-linha">
                <CampoImagem
                  rotulo={formato ? `Imagem ${formato.width}×${formato.height}` : 'Imagem'}
                  preset={formato ? formato.preset : 'FREEFORM'}
                  midia={form.media}
                  aoMudar={(m) => setForm({ ...form, media: m })}
                  dica="Recortada no tamanho exato do formato."
                />
                <CampoImagem
                  rotulo="Imagem para celular"
                  preset="FREEFORM"
                  midia={form.mobileMedia}
                  aoMudar={(m) => setForm({ ...form, mobileMedia: m })}
                  dica="Opcional (sugestão: 320×100). Sem ela, usa a principal."
                />
              </div>
              <Campo rotulo="Endereço de destino" obrigatorio>
                <Entrada value={form.targetUrl} onChange={(e) => setForm({ ...form, targetUrl: e.target.value })} placeholder="https://anunciante.com.br/campanha" />
              </Campo>
              <Campo rotulo="Texto alternativo" obrigatorio dica="Descreve o anúncio para quem usa leitor de tela.">
                <Entrada value={form.alt} onChange={(e) => setForm({ ...form, alt: e.target.value })} maxLength={320} />
              </Campo>
              <Alternador marcado={form.openInNewTab} aoMudar={(v) => setForm({ ...form, openInNewTab: v })} rotulo="Abrir em nova aba" />
            </fieldset>

            <fieldset>
              <legend>4. Período no ar</legend>
              <div className="pn-linha">
                <Campo rotulo="Situação">
                  <Selecao value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    <option value="DRAFT">Rascunho</option>
                    <option value="ACTIVE">No ar (dentro do período)</option>
                    <option value="PAUSED">Pausado</option>
                    <option value="EXPIRED">Vencido</option>
                  </Selecao>
                </Campo>
                <Campo rotulo="Início">
                  <Entrada type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
                </Campo>
                <Campo rotulo="Fim" dica={duracao !== null && duracao > 0 ? `${duracao} dia${duracao === 1 ? '' : 's'} no ar` : undefined}>
                  <Entrada type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
                </Campo>
              </div>
              <div className="pn-ads-atalhos-dias" role="group" aria-label="Duração rápida">
                <span>Duração:</span>
                {[7, 15, 30, 60, 90].map((d) => (
                  <button key={d} type="button" className={`pn-tag ${duracao === d ? 'pn-tag-on' : ''}`} onClick={() => definirDias(d)}>{d} dias</button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend>5. Contrato e cobrança</legend>
              <div className="pn-linha">
                <Campo rotulo="Como o cliente paga">
                  <Selecao value={form.pricingModel} onChange={(e) => setForm({ ...form, pricingModel: e.target.value as AdPricingModel })}>
                    {(Object.keys(MODELOS) as AdPricingModel[]).map((m) => <option key={m} value={m}>{MODELOS[m].rotulo}</option>)}
                  </Selecao>
                </Campo>
                <Campo rotulo={MODELOS[form.pricingModel].valor}>
                  <Entrada inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="1.500,00" />
                </Campo>
                {form.pricingModel === 'CPM' && (
                  <Campo rotulo="Meta de impressões" dica="Ao atingir, sai do ar.">
                    <Entrada type="number" min={1} value={form.impressionGoal} onChange={(e) => setForm({ ...form, impressionGoal: e.target.value })} placeholder="100000" />
                  </Campo>
                )}
              </div>
              <div className="pn-linha">
                <Campo rotulo="Pagamento">
                  <Selecao value={form.billingStatus} onChange={(e) => setForm({ ...form, billingStatus: e.target.value as AdBillingStatus })}>
                    {(Object.keys(COBRANCA) as AdBillingStatus[]).map((k) => <option key={k} value={k}>{COBRANCA[k].texto}</option>)}
                  </Selecao>
                </Campo>
                <Campo rotulo="Vencimento do pagamento" dica="Passou a data sem pagamento: vira “Em atraso” sozinho.">
                  <Entrada type="date" value={form.billingDueDate} onChange={(e) => setForm({ ...form, billingDueDate: e.target.value })} />
                </Campo>
              </div>
              <Campo rotulo="Observações de cobrança">
                <AreaTexto value={form.billingNotes} onChange={(e) => setForm({ ...form, billingNotes: e.target.value })} maxLength={2000} rows={2} placeholder="Nota fiscal, forma de pagamento, combinado com o cliente…" />
              </Campo>
            </fieldset>

            <fieldset>
              <legend>6. Competição pela posição</legend>
              <p className="pn-dica">
                Quando vários anúncios dividem uma posição, cada exibição é sorteada com chance proporcional
                a quanto o anúncio rende por mil exibições: quem paga mais aparece mais vezes. A prioridade
                soma um bônus (100 = dobra a chance). O patrocínio exclusivo ocupa a posição sozinho.
              </p>
              <div className="pn-linha">
                <Campo rotulo="Bônus de prioridade" dica="0 a 1000. 0 = só o valor decide.">
                  <Entrada type="number" min={0} max={1000} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} />
                </Campo>
                <div className="pn-campo">
                  <span className="pn-rotulo">Patrocínio</span>
                  <Alternador marcado={form.isExclusive} aoMudar={(v) => setForm({ ...form, isExclusive: v })} rotulo="Exclusivo nas posições escolhidas" />
                </div>
              </div>
            </fieldset>
          </div>
        )}
      </Modal>

      <Modal
        titulo="Renovar anúncio"
        aberto={renovar !== null}
        aoFechar={() => setRenovar(null)}
        largura={460}
        rodape={
          <>
            <Botao variante="fantasma" onClick={() => setRenovar(null)}>Cancelar</Botao>
            <Botao variante="primario" onClick={() => void confirmarRenovacao()}>Renovar</Botao>
          </>
        }
      >
        {renovar && (
          <>
            <p className="pn-dica">
              “{renovar.anuncio.name}” ganha um novo período a partir de{' '}
              {new Date(Math.max(Date.now(), renovar.anuncio.endsAt ? new Date(renovar.anuncio.endsAt).getTime() : 0)).toLocaleDateString('pt-BR')},
              volta ao ar e a cobrança do novo período fica “A cobrar”.
            </p>
            <div className="pn-ads-atalhos-dias" role="group" aria-label="Duração">
              {[7, 15, 30, 60, 90].map((d) => (
                <button key={d} type="button" className={`pn-tag ${renovar.dias === d ? 'pn-tag-on' : ''}`} onClick={() => setRenovar({ ...renovar, dias: d })}>{d} dias</button>
              ))}
            </div>
            <Campo rotulo={MODELOS[renovar.anuncio.pricingModel].valor}>
              <Entrada inputMode="decimal" value={renovar.valor} onChange={(e) => setRenovar({ ...renovar, valor: e.target.value })} />
            </Campo>
          </>
        )}
      </Modal>

      <Confirmacao
        aberto={excluir !== null}
        titulo="Excluir anúncio"
        mensagem={`"${excluir?.name}" sai do ar imediatamente e some dos relatórios de cobrança.`}
        aoConfirmar={async () => {
          if (!excluir) return;
          try {
            await painel.excluirAnuncio(excluir.id);
            recado.ok('Anúncio excluído.');
            setExcluir(null);
            atualizarTudo();
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
