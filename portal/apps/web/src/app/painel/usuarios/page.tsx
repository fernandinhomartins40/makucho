'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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

function gerarSenhaTemporaria(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  const aleatorio = btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_');
  return `A7a-${aleatorio}`;
}

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
  const [dadosCarregados, setDadosCarregados] = useState(false);
  const [erroLista, setErroLista] = useState<string | null>(null);
  const [erroPapeis, setErroPapeis] = useState<string | null>(null);
  const requisicaoAtual = useRef(0);
  const [pagina, setPagina] = useState(1);

  const [form, setForm] = useState<Formulario | null>(null);
  const [excluir, setExcluir] = useState<Linha | null>(null);
  const [resetar, setResetar] = useState<Linha | null>(null);
  const [senhaTemp, setSenhaTemp] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const carregarPapeis = useCallback(async () => {
    setErroPapeis(null);
    try {
      setPapeis(await painel.papeisDisponiveis());
    } catch (e) {
      setErroPapeis(e instanceof ErroApi ? e.message : 'Não foi possível carregar as permissões.');
    }
  }, []);

  useEffect(() => { void carregarPapeis(); }, [carregarPapeis]);

  const carregar = useCallback(async () => {
    const requisicao = ++requisicaoAtual.current;
    setCarregando(true);
    setErroLista(null);
    try {
      const r = await painel.usuarios({ page: pagina, perPage: 20 });
      if (requisicao !== requisicaoAtual.current) return;
      setItens(r.data);
      setMeta({ page: r.meta.page, totalPages: r.meta.totalPages, total: r.meta.total });
      setDadosCarregados(true);
    } catch (e) {
      if (requisicao !== requisicaoAtual.current) return;
      setErroLista(e instanceof ErroApi ? e.message : 'Não foi possível carregar os usuários.');
    } finally {
      if (requisicao === requisicaoAtual.current) setCarregando(false);
    }
  }, [pagina]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function abrir(u?: Linha) {
    setErro('');
    setForm(
      u
        ? { id: u.id, name: u.name, email: u.email, password: '', role: u.role, status: u.status }
        : { name: '', email: '', password: '', role: papeis.includes('AUTHOR') ? 'AUTHOR' : papeis.at(-1) ?? 'AUTHOR', status: 'ACTIVE' },
    );
  }

  async function salvar() {
    if (!form || salvando) return;
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
    if (!form.id && !papeis.includes(form.role)) {
      setErro('Aguarde o carregamento dos papéis disponíveis.');
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
          <Botao variante="primario" disabled={papeis.length === 0} onClick={() => abrir()}>
            + Novo usuário
          </Botao>
        }
      />

      <div className="pn-bloco">
        {erroPapeis && <div className="pn-erro-lista"><Aviso tipo="erro">{erroPapeis}</Aviso><Botao variante="neutro" onClick={() => void carregarPapeis()}>Tentar novamente</Botao></div>}
        {erroLista && <div className="pn-erro-lista"><Aviso tipo="erro">{erroLista} {dadosCarregados ? 'A lista anterior permanece abaixo.' : 'Nenhum usuário foi carregado.'}</Aviso><Botao variante="neutro" onClick={() => void carregar()}>Tentar novamente</Botao></div>}
        {carregando ? (
          <Carregando />
        ) : erroLista && !dadosCarregados ? null : itens.length === 0 ? (
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
                      {u.id === eu?.id || papeis.includes(u.role) ? (
                        <button type="button" className="pn-link" onClick={() => abrir(u)}>{u.name}</button>
                      ) : u.name}
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
                        {(u.id === eu?.id || papeis.includes(u.role)) && (
                          <Botao variante="fantasma" onClick={() => abrir(u)}>Editar</Botao>
                        )}
                        {u.id !== eu?.id && papeis.includes(u.role) && (
                          <Botao variante="fantasma" onClick={() => setResetar(u)}>Resetar senha</Botao>
                        )}
                        {u.id !== eu?.id && papeis.includes(u.role) && (
                          <Botao variante="perigo-suave" onClick={() => setExcluir(u)}>
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

        {!erroLista && <Paginacao pagina={meta.page} totalPaginas={meta.totalPages} aoMudar={setPagina} />}
      </div>

      <Modal
        titulo={form?.id ? 'Editar usuário' : 'Novo usuário'}
        aberto={form !== null}
        aoFechar={() => { if (!salvando) setForm(null); }}
        largura={480}
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
                disabled={form.id === eu?.id}
              >
                {(form.id === eu?.id ? [form.role] : papeis).map((p) => (
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
                  disabled={form.id === eu?.id}
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
            const novaSenha = gerarSenhaTemporaria();
            await painel.resetarSenha(resetar.id, novaSenha);
            setResetar(null);
            setSenhaTemp(novaSenha);
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
