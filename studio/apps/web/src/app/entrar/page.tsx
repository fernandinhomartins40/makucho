'use client';

// ============================================================
// Entrar — a tela que faltava.
//
// A API tinha login, refresh, logout e /me desde a Fase 1. O front
// nunca teve tela: toda tela chamava a API autenticada, recebia 401,
// e mostrava "sua sessão expirou" — sem nenhum caminho para entrar.
// Na prática, o produto estava inacessível.
//
// UMA TELA, DOIS MODOS
//
// A mesma rota serve login e primeiro acesso, decidido por uma
// consulta ao servidor. Duas telas separadas obrigariam quem chega
// a adivinhar qual usar, e a resposta depende de um estado do banco
// que só o servidor conhece.
// ============================================================

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { auth } from '../../lib/api';
import { IconeAviso, IconeCheck } from '../../components/icones';

export default function EntrarPage() {
  return (
    <Suspense fallback={null}>
      <Entrar />
    </Suspense>
  );
}

function Entrar() {
  const router = useRouter();
  const parametros = useSearchParams();

  // `null` enquanto o servidor não respondeu: mostrar o formulário
  // de login e trocar para cadastro meio segundo depois faria a tela
  // saltar na frente de quem está digitando.
  const [precisaDeSetup, setPrecisaDeSetup] = useState<boolean | null>(null);

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [nome, setNome] = useState('');
  const [workspace, setWorkspace] = useState('MAKUCHO');

  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // De onde a pessoa veio, para voltar depois de entrar. Sem isso,
  // quem clicou num link para o editor cairia no painel e teria de
  // navegar de novo.
  const destino = parametros.get('de') || '/';

  useEffect(() => {
    let ativo = true;

    void auth
      .precisaDeSetup()
      .then((r) => ativo && setPrecisaDeSetup(r.precisaDeSetup))
      // Se a consulta falhar, o login é a suposição segura: ele
      // funciona para quem já tem conta, e o cadastro recusaria com
      // 409 de qualquer forma.
      .catch(() => ativo && setPrecisaDeSetup(false));

    return () => {
      ativo = false;
    };
  }, []);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setErro(null);

    try {
      if (precisaDeSetup) {
        await auth.criarPrimeiroAcesso({
          email,
          password: senha,
          name: nome || 'Administrador',
          workspace: workspace || 'MAKUCHO',
        });
      } else {
        await auth.entrar(email, senha);
      }

      // `replace` e não `push`: o botão voltar não pode trazer de
      // volta a tela de login de quem já entrou.
      router.replace(destino);
      // `refresh` para o servidor recarregar com a sessão nova.
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não foi possível entrar.');
      setEnviando(false);
    }
  };

  const cadastrando = precisaDeSetup === true;

  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: 'var(--e5)',
      }}
    >
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 'var(--e5)' }}>
          <h1 style={{ fontSize: 24, marginBottom: 'var(--e2)' }}>MAKUCHO Studio</h1>
          <p className="texto-secundario" style={{ fontSize: 14 }}>
            {precisaDeSetup === null
              ? ' '
              : cadastrando
                ? 'Crie a conta de quem vai administrar este Studio.'
                : 'Entre para continuar.'}
          </p>
        </div>

        {/* O formulário só aparece depois da resposta: trocar de modo
            embaixo de quem está digitando é pior que meio segundo de
            espera. */}
        {precisaDeSetup !== null && (
          <form onSubmit={enviar} className="cartao" style={{ display: 'grid', gap: 'var(--e4)' }}>
            {cadastrando && (
              <p
                className="linha"
                style={{ gap: 'var(--e2)', fontSize: 13, alignItems: 'start' }}
              >
                <IconeCheck size={14} color="var(--success)" />
                <span className="texto-secundario">
                  Este Studio ainda não tem ninguém. Quem criar a conta agora vira
                  o administrador.
                </span>
              </p>
            )}

            <label className="campo">
              <span className="campo__rotulo">E-mail</span>
              <input
                type="email"
                required
                autoFocus
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={enviando}
              />
            </label>

            <label className="campo">
              <span className="campo__rotulo">Senha</span>
              <input
                type="password"
                required
                // No cadastro o navegador precisa saber que é senha
                // nova, senão oferece preencher com uma antiga.
                autoComplete={cadastrando ? 'new-password' : 'current-password'}
                minLength={cadastrando ? 12 : 1}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                disabled={enviando}
              />
              {cadastrando && (
                <span className="campo__ajuda">
                  Ao menos 12 caracteres. Esta senha dá acesso a todo o material
                  do cliente.
                </span>
              )}
            </label>

            {cadastrando && (
              <>
                <label className="campo">
                  <span className="campo__rotulo">Seu nome</span>
                  <input
                    type="text"
                    autoComplete="name"
                    placeholder="Administrador"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    disabled={enviando}
                  />
                </label>

                <label className="campo">
                  <span className="campo__rotulo">Nome do workspace</span>
                  <input
                    type="text"
                    value={workspace}
                    onChange={(e) => setWorkspace(e.target.value)}
                    disabled={enviando}
                  />
                  <span className="campo__ajuda">
                    Aparece nos materiais e organiza os projetos.
                  </span>
                </label>
              </>
            )}

            {erro && (
              <p
                className="linha"
                style={{ gap: 'var(--e2)', fontSize: 13, color: 'var(--danger)' }}
              >
                <IconeAviso size={14} />
                {erro}
              </p>
            )}

            <button type="submit" className="botao botao--largo" disabled={enviando}>
              {enviando
                ? cadastrando
                  ? 'Criando…'
                  : 'Entrando…'
                : cadastrando
                  ? 'Criar conta e entrar'
                  : 'Entrar'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
