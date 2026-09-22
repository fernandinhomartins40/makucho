'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ErroApi, painel, pode } from '@/lib/painel';
import { useSessao } from '@/components/painel/sessao';
import { MolduraPainel, TituloPagina } from '@/components/painel/moldura-painel';
import {
  Aviso,
  Botao,
  Carregando,
  Paginacao,
  SeloStatus,
  Selecao,
  Vazio,
} from '@/components/painel/ui';

interface Inscrito {
  id: string;
  email: string;
  name: string | null;
  status: string;
  createdAt: string;
}

function Newsletter() {
  const { usuario } = useSessao();

  const [itens, setItens] = useState<Inscrito[]>([]);
  const [stats, setStats] = useState<{
    total: number;
    confirmed: number;
    pending: number;
    unsubscribed: number;
  } | null>(null);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1, total: 0 });
  const [carregando, setCarregando] = useState(true);
  const [dadosCarregados, setDadosCarregados] = useState(false);
  const [erroLista, setErroLista] = useState<string | null>(null);
  const [erroStats, setErroStats] = useState<string | null>(null);
  const requisicaoAtual = useRef(0);
  const [pagina, setPagina] = useState(1);
  const [status, setStatus] = useState('');

  const admin = pode(usuario, 'ADMIN');

  const carregarStats = useCallback(async () => {
    setErroStats(null);
    try {
      setStats(await painel.estatisticasNewsletter());
    } catch (erro) {
      setErroStats(erro instanceof ErroApi ? erro.message : 'Não foi possível carregar as métricas.');
    }
  }, []);

  useEffect(() => { void carregarStats(); }, [carregarStats]);

  const carregar = useCallback(async () => {
    const requisicao = ++requisicaoAtual.current;
    // A lista completa é só para ADMIN; o editor vê apenas os números.
    if (!admin) {
      setCarregando(false);
      return;
    }

    setCarregando(true);
    setErroLista(null);
    try {
      const r = await painel.inscritos({
        page: pagina,
        perPage: 30,
        status: status || undefined,
      });
      if (requisicao !== requisicaoAtual.current) return;
      setItens(r.data);
      setMeta({ page: r.meta.page, totalPages: r.meta.totalPages, total: r.meta.total });
      setDadosCarregados(true);
    } catch (e) {
      if (requisicao !== requisicaoAtual.current) return;
      setErroLista(e instanceof ErroApi ? e.message : 'Não foi possível carregar os inscritos.');
    } finally {
      if (requisicao === requisicaoAtual.current) setCarregando(false);
    }
  }, [pagina, status, admin]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <>
      <TituloPagina
        titulo="Newsletter"
        descricao="Quem pediu para receber as publicações por e-mail."
        acoes={
          admin && (
            // Download direto pelo navegador: a API devolve o CSV com o
            // cookie de sessão junto.
            <a href="/api/newsletter/export" download className="pn-botao pn-botao-neutro">Exportar CSV</a>
          )
        }
      />

      {erroStats && <div className="pn-erro-lista"><Aviso tipo="erro">{erroStats}</Aviso><Botao variante="neutro" onClick={() => void carregarStats()}>Tentar novamente</Botao></div>}

      {stats && (
        <div className="pn-cartoes">
          <div className="pn-cartao">
            <strong>{stats.confirmed.toLocaleString('pt-BR')}</strong>
            <span>Confirmados</span>
          </div>
          <div className="pn-cartao">
            <strong>{stats.pending.toLocaleString('pt-BR')}</strong>
            <span>Pendentes</span>
          </div>
          <div className="pn-cartao">
            <strong>{stats.unsubscribed.toLocaleString('pt-BR')}</strong>
            <span>Cancelados</span>
          </div>
          <div className="pn-cartao">
            <strong>{stats.total.toLocaleString('pt-BR')}</strong>
            <span>Total</span>
          </div>
        </div>
      )}

      {!admin ? (
        <div className="pn-bloco">
          <Vazio
            titulo="Lista restrita"
            descricao="Somente administradores podem ver os endereços dos inscritos."
          />
        </div>
      ) : (
        <>
          <div className="pn-filtros">
            <Selecao
              aria-label="Filtrar inscritos por status"
              value={status}
              onChange={(e) => {
                setPagina(1);
                setStatus(e.target.value);
              }}
            >
              <option value="">Todos</option>
              <option value="CONFIRMED">Confirmados</option>
              <option value="PENDING">Pendentes</option>
              <option value="UNSUBSCRIBED">Cancelados</option>
            </Selecao>
          </div>

          <div className="pn-bloco">
            {erroLista && (
              <div className="pn-erro-lista">
                <Aviso tipo="erro">{erroLista} {dadosCarregados ? 'A lista anterior permanece abaixo.' : 'Nenhum inscrito foi carregado.'}</Aviso>
                <Botao variante="neutro" onClick={() => void carregar()}>Tentar novamente</Botao>
              </div>
            )}
            {carregando ? (
              <Carregando />
            ) : erroLista && !dadosCarregados ? null : itens.length === 0 ? (
              <Vazio
                titulo="Nenhum inscrito"
                descricao="O formulário da home alimenta esta lista."
              />
            ) : (
              <div className="pn-tabela-area">
                <table className="pn-tabela">
                  <thead>
                    <tr>
                      <th>E-mail</th>
                      <th>Nome</th>
                      <th>Status</th>
                      <th>Inscrição</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((i) => (
                      <tr key={i.id}>
                        <td>{i.email}</td>
                        <td style={{ color: 'var(--pn-suave)' }}>{i.name ?? '—'}</td>
                        <td>
                          <SeloStatus status={i.status} />
                        </td>
                        <td style={{ color: 'var(--pn-suave)', whiteSpace: 'nowrap' }}>
                          {new Date(i.createdAt).toLocaleDateString('pt-BR')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {!erroLista && <Paginacao pagina={meta.page} totalPaginas={meta.totalPages} aoMudar={setPagina} />}
          </div>
        </>
      )}

    </>
  );
}

export default function PaginaNewsletter() {
  return (
    <MolduraPainel>
      <Newsletter />
    </MolduraPainel>
  );
}
