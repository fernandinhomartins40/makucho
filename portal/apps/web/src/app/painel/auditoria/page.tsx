'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ErroApi, painel, type RegistroAuditoria } from '@/lib/painel';
import { MolduraPainel, TituloPagina } from '@/components/painel/moldura-painel';
import {
  Aviso,
  Botao,
  Carregando,
  Etiqueta,
  Paginacao,
  Selecao,
  Vazio,
} from '@/components/painel/ui';

// Todas as acoes e recursos que a API registra (grep em apps/api: action/resource).
const ACOES: Record<string, { rotulo: string; cor: string }> = {
  create: { rotulo: 'criou', cor: '#16a34a' },
  update: { rotulo: 'alterou', cor: '#1f6bff' },
  delete: { rotulo: 'excluiu', cor: '#dc2626' },
  duplicate: { rotulo: 'duplicou', cor: '#0891b2' },
  reorder: { rotulo: 'reordenou', cor: '#1f6bff' },
  export: { rotulo: 'exportou', cor: '#7c3aed' },
  publish_scheduled: { rotulo: 'publicou (agendado)', cor: '#16a34a' },
  login: { rotulo: 'entrou', cor: '#475569' },
  logout: { rotulo: 'saiu', cor: '#64748b' },
  login_failed: { rotulo: 'falha de login', cor: '#dc2626' },
  password_changed: { rotulo: 'trocou a senha', cor: '#7c3aed' },
  reset_password: { rotulo: 'redefiniu senha', cor: '#7c3aed' },
  password_reset_requested: { rotulo: 'pediu nova senha', cor: '#b45309' },
  password_reset_completed: { rotulo: 'concluiu nova senha', cor: '#7c3aed' },
  refresh_token_reuse: { rotulo: 'sessão suspeita', cor: '#dc2626' },
};

const RECURSOS: Record<string, string> = {
  post: 'publicação',
  media: 'imagem',
  category: 'categoria',
  tag: 'tag',
  author: 'autor',
  video: 'vídeo',
  advertisement: 'anúncio',
  user: 'usuário',
  settings: 'configurações',
  social_profile: 'rede social',
  market_indicator: 'indicador de mercado',
  homepage_section: 'seção da home',
  newsletter: 'newsletter',
  auth: 'sessão',
};

function Auditoria() {
  const [itens, setItens] = useState<RegistroAuditoria[]>([]);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1, total: 0 });
  const [carregando, setCarregando] = useState(true);
  const [dadosCarregados, setDadosCarregados] = useState(false);
  const [erroLista, setErroLista] = useState<string | null>(null);
  const requisicaoAtual = useRef(0);
  const [pagina, setPagina] = useState(1);
  const [acao, setAcao] = useState('');
  const [recurso, setRecurso] = useState('');

  const carregar = useCallback(async () => {
    const requisicao = ++requisicaoAtual.current;
    setCarregando(true);
    setErroLista(null);
    try {
      const r = await painel.auditoria({
        page: pagina,
        perPage: 40,
        action: acao || undefined,
        resource: recurso || undefined,
      });
      if (requisicao !== requisicaoAtual.current) return;
      setItens(r.data);
      setMeta({ page: r.meta.page, totalPages: r.meta.totalPages, total: r.meta.total });
      setDadosCarregados(true);
    } catch (e) {
      if (requisicao !== requisicaoAtual.current) return;
      setErroLista(e instanceof ErroApi ? e.message : 'Não foi possível carregar a auditoria.');
    } finally {
      if (requisicao === requisicaoAtual.current) setCarregando(false);
    }
  }, [pagina, acao, recurso]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <>
      <TituloPagina
        titulo="Auditoria"
        descricao="Registro de quem fez o quê no painel."
      />

      <div className="pn-filtros">
        <Selecao
          aria-label="Filtrar auditoria por ação"
          value={acao}
          onChange={(e) => {
            setPagina(1);
            setAcao(e.target.value);
          }}
        >
          <option value="">Todas as ações</option>
          {Object.entries(ACOES).map(([k, v]) => (
            <option key={k} value={k}>
              {v.rotulo}
            </option>
          ))}
        </Selecao>

        <Selecao
          aria-label="Filtrar auditoria por item"
          value={recurso}
          onChange={(e) => {
            setPagina(1);
            setRecurso(e.target.value);
          }}
        >
          <option value="">Todos os itens</option>
          {Object.entries(RECURSOS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Selecao>
      </div>

      <div className="pn-bloco">
        {erroLista && <div className="pn-erro-lista"><Aviso tipo="erro">{erroLista} {dadosCarregados ? 'Os registros anteriores permanecem abaixo.' : 'Nenhum registro foi carregado.'}</Aviso><Botao variante="neutro" onClick={() => void carregar()}>Tentar novamente</Botao></div>}
        {carregando ? (
          <Carregando />
        ) : erroLista && !dadosCarregados ? null : itens.length === 0 ? (
          <Vazio
            titulo="Nada registrado"
            descricao="As ações do painel aparecem aqui conforme acontecem."
          />
        ) : (
          <div className="pn-tabela-area">
            <table className="pn-tabela pn-tabela-auditoria">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Quem</th>
                  <th>Ação</th>
                  <th>Item</th>
                  <th>Detalhe</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((r) => {
                  const a = ACOES[r.action] ?? { rotulo: r.action, cor: '#94a3b8' };
                  return (
                    <tr key={r.id}>
                      <td style={{ whiteSpace: 'nowrap', color: 'var(--pn-suave)' }}>
                        {new Date(r.createdAt).toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td>{r.user?.name ?? 'sistema'}</td>
                      <td>
                        <Etiqueta texto={a.rotulo} cor={a.cor} />
                      </td>
                      <td style={{ color: 'var(--pn-suave)' }}>
                        {RECURSOS[r.resource] ?? r.resource}
                      </td>
                      <td style={{ color: 'var(--pn-suave)', fontSize: '0.8rem' }}>
                        {r.summary ?? '—'}
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

    </>
  );
}

export default function PaginaAuditoria() {
  return (
    <MolduraPainel>
      <Auditoria />
    </MolduraPainel>
  );
}
