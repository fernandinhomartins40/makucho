'use client';

// ============================================================
// Entrar — a tela que faltava.
//
// A API tinha login, refresh, logout e /me desde a Fase 1. O front
// nunca teve tela: toda tela chamava a API autenticada, recebia 401,
// e mostrava "sua sessão expirou" — sem nenhum caminho para entrar.
//
// UMA TELA, DOIS MODOS
//
// A mesma rota serve login e primeiro acesso, decidido por uma
// consulta ao servidor. Duas telas separadas obrigariam quem chega a
// adivinhar qual usar, e a resposta depende de um estado do banco
// que só o servidor conhece.
//
// OS TRÊS RECURSOS QUE A PRIMEIRA VERSÃO NÃO TINHA
//
//   ver senha        digitar 19 caracteres às cegas e errar é o
//                    caminho mais curto para desistir;
//   manter conectado sem isso os cookies morrem ao fechar o
//                    navegador — certo no computador compartilhado,
//                    irritante no próprio. Quem decide é a pessoa;
//   lembrar e-mail   guardado no navegador, nunca a senha: senha em
//                    localStorage é senha exposta a qualquer script
//                    da página.
// ============================================================

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { auth } from '../../lib/api';
import { IconeAviso, IconeCheck, IconeOlho, IconeOlhoFechado } from '../../components/icones';

/** Onde o e-mail lembrado fica. Só o e-mail — nunca a senha. */
const CHAVE_EMAIL = 'makucho.studio.email';

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

  // `null` enquanto o servidor não respondeu: mostrar o login e
  // trocar para cadastro meio segundo depois faria a tela saltar na
  // frente de quem já está digitando.
  const [precisaDeSetup, setPrecisaDeSetup] = useState<boolean | null>(null);

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [nome, setNome] = useState('');
  const [workspace, setWorkspace] = useState('MAKUCHO');

  const [verSenha, setVerSenha] = useState(false);
  const [manterConectado, setManterConectado] = useState(true);
  const [lembrarEmail, setLembrarEmail] = useState(false);

  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // De onde a pessoa veio, para voltar depois de entrar. Sem isso,
  // quem clicou num link para o editor cairia no painel e teria de
  // navegar de novo — com o trabalho ainda na cabeça.
  const destino = parametros.get('de') || '/';

  useEffect(() => {
    let ativo = true;

    void auth
      .precisaDeSetup()
      .then((r) => ativo && setPrecisaDeSetup(r.precisaDeSetup))
      // Se a consulta falhar, o login é a suposição segura: funciona
      // para quem já tem conta, e o cadastro recusaria com 409 de
      // qualquer forma.
      .catch(() => ativo && setPrecisaDeSetup(false));

    // O e-mail lembrado. Em try/catch porque `localStorage` lança em
    // janela privativa e com cookies bloqueados — e a tela precisa
    // funcionar nesses dois casos.
    try {
      const salvo = localStorage.getItem(CHAVE_EMAIL);
      if (salvo && ativo) {
        setEmail(salvo);
        setLembrarEmail(true);
      }
    } catch {
      // Sem e-mail lembrado; a tela funciona igual.
    }

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
        await auth.entrar(email, senha, manterConectado);
      }

      // Só grava depois de entrar: guardar um e-mail que nem sequer
      // funcionou faria a próxima visita começar com o dado errado
      // já preenchido.
      try {
        if (lembrarEmail) localStorage.setItem(CHAVE_EMAIL, email);
        else localStorage.removeItem(CHAVE_EMAIL);
      } catch {
        // Não impede o login.
      }

      // `replace` e não `push`: o botão voltar não pode trazer de
      // volta a tela de login de quem já entrou.
      router.replace(destino);
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
        background: 'var(--bg-canvas)',
      }}
    >
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 'var(--e5)' }}>
          {/* A mesma marca tipográfica da sidebar: quem chega aqui
              reconhece o produto antes de entrar nele. */}
          <span
            aria-hidden
            style={{
              display: 'inline-grid',
              placeItems: 'center',
              width: 44,
              height: 44,
              borderRadius: 12,
              marginBottom: 'var(--e3)',
              // O MESMO gradiente da sigla na sidebar.
              background: 'linear-gradient(135deg, var(--primary), var(--accent))',
              color: '#fff',
              fontSize: 22,
              fontWeight: 800,
            }}
          >
            M
          </span>

          <h1 style={{ fontSize: 22, marginBottom: 'var(--e2)' }}>MAKUCHO Studio</h1>

          {/* Um espaco nao separavel enquanto carrega: sem ele a
              linha teria altura zero, e o formulario saltaria para
              baixo quando o texto chegasse. */}
          <p className="texto-secundario" style={{ fontSize: 14 }}>
            {precisaDeSetup === null
              ? '\u00a0'
              : cadastrando
                ? 'Crie a conta de quem vai administrar este Studio.'
                : 'Entre para continuar.'}
          </p>
        </div>

        {precisaDeSetup !== null && (
          <form onSubmit={enviar} className="cartao" style={{ display: 'grid', gap: 'var(--e4)' }}>
            {cadastrando && (
              <p
                className="linha"
                style={{ gap: 'var(--e2)', fontSize: 13, alignItems: 'start' }}
              >
                <IconeCheck size={14} color="var(--success)" />
                <span className="texto-secundario">
                  Este Studio ainda não tem ninguém. Quem criar a conta agora vira o
                  administrador.
                </span>
              </p>
            )}

            <label className="campo">
              <span className="campo__rotulo">E-mail</span>
              <input
                className="campo__entrada"
                type="email"
                required
                autoFocus
                autoComplete="email"
                placeholder="voce@exemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={enviando}
              />
            </label>

            <label className="campo">
              <span className="campo__rotulo">Senha</span>

              {/* O botão de ver fica DENTRO do campo, e o input ganha
                  espaço à direita para o texto não passar por baixo
                  dele. */}
              <span style={{ position: 'relative', display: 'block' }}>
                <input
                  className="campo__entrada"
                  type={verSenha ? 'text' : 'password'}
                  required
                  // No cadastro o navegador precisa saber que é senha
                  // nova, senão oferece preencher com uma antiga.
                  autoComplete={cadastrando ? 'new-password' : 'current-password'}
                  minLength={cadastrando ? 12 : 1}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  disabled={enviando}
                  style={{ paddingRight: 44 }}
                />
                <button
                  type="button"
                  onClick={() => setVerSenha((v) => !v)}
                  // `aria-label` porque o botão é só um ícone, e
                  // `title` para quem usa o mouse.
                  aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'}
                  title={verSenha ? 'Ocultar senha' : 'Mostrar senha'}
                  style={{
                    position: 'absolute',
                    right: 4,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    display: 'grid',
                    placeItems: 'center',
                    width: 36,
                    height: 36,
                    border: 0,
                    borderRadius: 8,
                    background: 'none',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  {verSenha ? <IconeOlhoFechado size={18} /> : <IconeOlho size={18} />}
                </button>
              </span>

              {cadastrando && (
                <span className="campo__ajuda">
                  Ao menos 12 caracteres. Esta senha dá acesso a todo o material do
                  cliente.
                </span>
              )}
            </label>

            {cadastrando && (
              <>
                <label className="campo">
                  <span className="campo__rotulo">Seu nome</span>
                  <input
                    className="campo__entrada"
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
                    className="campo__entrada"
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

            {/* As duas escolhas só no login: no cadastro a pessoa
                acabou de decidir entrar, e perguntar se quer
                continuar conectada seria ruído. */}
            {!cadastrando && (
              <div style={{ display: 'grid', gap: 'var(--e2)' }}>
                <label
                  className="linha"
                  style={{ gap: 'var(--e2)', fontSize: 13, cursor: 'pointer' }}
                >
                  <input
                    type="checkbox"
                    checked={manterConectado}
                    onChange={(e) => setManterConectado(e.target.checked)}
                    disabled={enviando}
                    style={{ width: 16, height: 16, accentColor: 'var(--accent)' }}
                  />
                  Manter conectado
                </label>

                <label
                  className="linha"
                  style={{ gap: 'var(--e2)', fontSize: 13, cursor: 'pointer' }}
                >
                  <input
                    type="checkbox"
                    checked={lembrarEmail}
                    onChange={(e) => setLembrarEmail(e.target.checked)}
                    disabled={enviando}
                    style={{ width: 16, height: 16, accentColor: 'var(--accent)' }}
                  />
                  Lembrar meu e-mail
                </label>
              </div>
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

            {!cadastrando && (
              <p
                className="texto-secundario"
                style={{ fontSize: 12, textAlign: 'center', lineHeight: 1.5 }}
              >
                {manterConectado
                  ? 'Você seguirá conectado neste navegador.'
                  : 'A sessão termina quando você fechar o navegador.'}
              </p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
