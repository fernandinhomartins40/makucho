'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AuthUser, UserRole } from '@makucho/types';
import { ErroApi, painel } from '@/lib/painel';
import { useSessao } from '@/components/painel/sessao';
import { MolduraPainel, TituloPagina, rotuloPapel } from '@/components/painel/moldura-painel';
import {
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

type Linha = AuthUser & { createdAt: string; lastLoginAt: string | null };

interface Formulario {
  id?: string;
  name: string;
  email: string;
  password: string;
  role: UserRole;
  status: string;
}

function Usuarios() {
  const { usuario: eu } = useSessao();
  const recado = useRecado();

  const [itens, setItens] = useState<Linha[]>([]);
  const [papeis, setPapeis] = useState<UserRole[]>([]);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1, total: 0 });
  const [carregando, setCarregando] = useState(true);
  const [pagina, setPagina] = useState(1);

  const [form, setForm] = useState<Formulario | null>(null);
  const [excluir, setExcluir] = useState<Linha | null>(null);
  const [resetar, setResetar] = useState<Linha | null>(null);
  const [senhaTemp, setSenhaTemp] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    painel.papeisDisponiveis().then(setPapeis).catch(() => setPapeis([]));
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await painel.usuarios({ page: pagina, perPage: 20 });
      setItens(r.data);
      setMeta({ page: r.meta.page, totalPages: r.meta.totalPages, total: r.meta.total });
    } catch (e) {
      recado.erro(e instanceof ErroApi ? e.message : 'Não foi possível carregar.');
    } finally {
      setCarregando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagina]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function abrir(u?: Linha) {
    setErro('');
    setForm(
      u
        ? { id: u.id, name: u.name, email: u.email, password: '', role: u.role, status: u.status }
        : { name: '', email: '', password: '', role: papeis[0] ?? 'AUTHOR', status: 'ACTIVE' },
    );
  }

  async function salvar() {
    if (!form) return;
    setErro('');

    if (form.name.trim().length < 2) {
      setErro('Informe o nome.');
      return;
    }
    if (!form.email.trim()) {
      setErro('Informe o e-mail.');
      return;
    }
    if (!form.id && form.password.length < 12) {
      setErro('A senha inicial precisa ter ao menos 12 caracteres.');
      return;
    }

    setSalvando(true);
    try {
      if (form.id) {
        await painel.atualizarUsuario(form.id, {
          name: form.name.trim(),
          email: form.email.trim(),
          role: form.role,
          status: form.status,
        });
      } else {
        await painel.criarUsuario({
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          role: form.role,
        });
      }

      recado.ok(form.id ? 'Usuário atualizado.' : 'Usuário criado.');
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
        titulo="Usuários"
        descricao="Quem tem acesso ao painel e com qual permissão."
        acoes={
          <Botao variante="primario" onClick={() => abrir()}>
            + Novo usuário
          </Botao>
        }
      />

      <div className="pn-bloco">
        {carregando ? (
          <Carregando />
        ) : itens.length === 0 ? (
          <Vazio titulo="Nenhum usuário" />
        ) : (
          <div className="pn-tabela-area">
            <table className="pn-tabela">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>E-mail</th>
                  <th>Papel</th>
                  <th>Status</th>
                  <th>Último acesso</th>
                  <th style={{ textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <button type="button" className="pn-link" onClick={() => abrir(u)}>
                        {u.name}
                      </button>
                      {u.id === eu?.id && (
                        <small style={{ color: 'var(--pn-suave)' }}> (você)</small>
                      )}
                    </td>
                    <td style={{ color: 'var(--pn-suave)' }}>{u.email}</td>
                    <td>{rotuloPapel(u.role)}</td>
                    <td>
                      <SeloStatus status={u.status} />
                    </td>
                    <td style={{ color: 'var(--pn-suave)', whiteSpace: 'nowrap' }}>
                      {u.lastLoginAt
                        ? new Date(u.lastLoginAt).toLocaleDateString('pt-BR')
                        : 'nunca'}
                    </td>
                    <td>
                      <div className="pn-acoes">
                        <Botao variante="fantasma" onClick={() => abrir(u)}>
                          Editar
                        </Botao>
                        <Botao variante="fantasma" onClick={() => setResetar(u)}>
                          Resetar senha
                        </Botao>
                        {/* Excluir a propria conta derrubaria a sessao. */}
                        {u.id !== eu?.id && (
                          <Botao variante="fantasma" onClick={() => setExcluir(u)}>
                            Excluir
                          </Botao>
                        )}
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

      <Modal
        titulo={form?.id ? 'Editar usuário' : 'Novo usuário'}
        aberto={form !== null}
        aoFechar={() => setForm(null)}
        largura={480}
        rodape={
          <>
            <Botao variante="fantasma" onClick={() => setForm(null)}>
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

            <Campo rotulo="Nome" obrigatorio>
              <Entrada
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                autoFocus
                maxLength={160}
              />
            </Campo>

            <Campo rotulo="E-mail" obrigatorio>
              <Entrada
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Campo>

            {!form.id && (
              <Campo
                rotulo="Senha inicial"
                obrigatorio
                dica="Ao menos 12 caracteres. O usuário troca no primeiro acesso."
              >
                <Entrada
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  autoComplete="new-password"
                  minLength={12}
                />
              </Campo>
            )}

            <Campo rotulo="Papel" dica="Você só pode atribuir papéis abaixo do seu.">
              <Selecao
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
              >
                {papeis.map((p) => (
                  <option key={p} value={p}>
                    {rotuloPapel(p)}
                  </option>
                ))}
              </Selecao>
            </Campo>

            {form.id && (
              <Campo rotulo="Status">
                <Selecao
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  <option value="ACTIVE">Ativo</option>
                  <option value="SUSPENDED">Suspenso</option>
                </Selecao>
              </Campo>
            )}
          </>
        )}
      </Modal>

      <Confirmacao
        aberto={resetar !== null}
        titulo="Resetar a senha"
        rotuloConfirmar="Resetar"
        mensagem={`Uma senha temporária será gerada para ${resetar?.name}. As sessões ativas dessa pessoa são encerradas.`}
        aoConfirmar={async () => {
          if (!resetar) return;
          try {
            const r = await painel.resetarSenha(resetar.id);
            setResetar(null);
            if (r.temporaryPassword) setSenhaTemp(r.temporaryPassword);
            else recado.ok(r.message);
          } catch (e) {
            recado.erro(e instanceof ErroApi ? e.message : 'Não foi possível resetar.');
          }
        }}
        aoCancelar={() => setResetar(null)}
      />

      <Modal
        titulo="Senha temporária"
        aberto={senhaTemp !== ''}
        aoFechar={() => setSenhaTemp('')}
        largura={420}
        rodape={
          <Botao variante="primario" onClick={() => setSenhaTemp('')}>
            Copiei, fechar
          </Botao>
        }
      >
        <Aviso tipo="info">
          Anote agora: esta senha não será mostrada novamente. Entregue por um canal seguro — a
          pessoa precisará trocá-la no primeiro acesso.
        </Aviso>
        <code className="pn-senha-temp">{senhaTemp}</code>
      </Modal>

      <Confirmacao
        aberto={excluir !== null}
        titulo="Excluir usuário"
        mensagem={`${excluir?.name} perde o acesso ao painel imediatamente.`}
        aoConfirmar={async () => {
          if (!excluir) return;
          try {
            await painel.excluirUsuario(excluir.id);
            recado.ok('Usuário excluído.');
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

export default function PaginaUsuarios() {
  return (
    <MolduraPainel>
      <Usuarios />
    </MolduraPainel>
  );
}
