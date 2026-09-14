'use client';

import { useCallback, useEffect, useState } from 'react';
import { ErroApi, painel, type RegistroAuditoria } from '@/lib/painel';
import { MolduraPainel, TituloPagina } from '@/components/painel/moldura-painel';
import {
  Carregando,
  Etiqueta,
  Paginacao,
  Selecao,
  Vazio,
  useRecado,
} from '@/components/painel/ui';

const ACOES: Record<string, { rotulo: string; cor: string }> = {
  create: { rotulo: 'criou', cor: '#16a34a' },
  update: { rotulo: 'alterou', cor: '#1a5fd4' },
  delete: { rotulo: 'excluiu', cor: '#dc2626' },
  login: { rotulo: 'entrou', cor: '#64748b' },
  logout: { rotulo: 'saiu', cor: '#94a3b8' },
  publish: { rotulo: 'publicou', cor: '#16a34a' },
  restore: { rotulo: 'restaurou', cor: '#8b5cf6' },
};

const RECURSOS: Record<string, string> = {
  post: 'publicação',
  media: 'imagem',
  category: 'categoria',
  tag: 'tag',
  author: 'autor',
  video: 'vídeo',
  ad: 'anúncio',
  user: 'usuário',
  setting: 'configuração',
  homepage: 'home',
  auth: 'sessão',
};

function Auditoria() {
  const recado = useRecado();
  const [itens, setItens] = useState<RegistroAuditoria[]>([]);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1, total: 0 });
  const [carregando, setCarregando] = useState(true);
  const [pagina, setPagina] = useState(1);
  const [acao, setAcao] = useState('');
  const [recurso, setRecurso] = useState('');

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await painel.auditoria({
        page: pagina,
        perPage: 40,
        action: acao || undefined,
        resource: recurso || undefined,
      });
      setItens(r.data);
      setMeta({ page: r.meta.page, totalPages: r.meta.totalPages, total: r.meta.total });
    } catch (e) {
      recado.erro(e instanceof ErroApi ? e.message : 'Não foi possível carregar.');
    } finally {
      setCarregando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        {carregando ? (
          <Carregando />
        ) : itens.length === 0 ? (
          <Vazio
            titulo="Nada registrado"
            descricao="As ações do painel aparecem aqui conforme acontecem."
          />
        ) : (
          <div className="pn-tabela-area">
            <table className="pn-tabela">
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

        <Paginacao pagina={meta.page} totalPaginas={meta.totalPages} aoMudar={setPagina} />
      </div>

      {recado.elemento}
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
