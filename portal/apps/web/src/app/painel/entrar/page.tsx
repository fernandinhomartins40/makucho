'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { ErroApi, painel } from '@/lib/painel';
import { useSessao } from '@/components/painel/sessao';
import { Aviso, Botao, Campo, Entrada } from '@/components/painel/ui';
import { Barras, Cadeado, Lampada, PlayCirculo, Seta } from '@/components/icones';

function FormularioLogin() {
  const router = useRouter();
  const params = useSearchParams();
  const { usuario, recarregar } = useSessao();

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  // Nunca mandamos para fora do proprio site: um "destino" com http://
  // viraria redirecionamento aberto.
  const bruto = params.get('destino') ?? '/painel';
  const destino = bruto.startsWith('/') && !bruto.startsWith('//') ? bruto : '/painel';
  const senhaAlterada = params.get('senha') === 'alterada';

  useEffect(() => {
    if (usuario) router.replace(usuario.mustChangePassword ? '/painel/senha' : destino);
  }, [usuario, router, destino]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setEnviando(true);

    try {
      const { user } = await painel.entrar(email.trim(), senha);
      await recarregar();
      router.replace(user.mustChangePassword ? '/painel/senha' : destino);
    } catch (e) {
      setErro(
        e instanceof ErroApi
          ? e.message
          : 'Não foi possível entrar agora. Tente novamente em instantes.',
      );
      setEnviando(false);
    }
  }

  return (
    <div className="pn-entrar">
      <header className="pn-entrar-topo">
        <div className="pn-entrar-linha">
          <Link href="/" aria-label="MAKUCHO, página inicial">
            <Image
              src="/brand/makucho-logo-horizontal-dark-bg.webp"
              alt=""
              width={1262}
              height={220}
              className="pn-entrar-logo"
              priority
            />
          </Link>
          <Link href="/" className="pn-entrar-voltar">
            <Seta size={16} className="pn-entrar-seta-voltar" /> Voltar para o site
          </Link>
        </div>
      </header>

      <main className="pn-entrar-corpo">
        <section className="pn-entrar-apresentacao" aria-labelledby="entrar-titulo">
          <span className="pn-entrar-rotulo">Painel editorial</span>
          <h1 id="entrar-titulo">Acesse a redação MAKUCHO</h1>
          <p>Publique análises, organize vídeos e acompanhe a home do portal em um só lugar.</p>
          <ul>
            <li>
              <Lampada /> Análises claras e didáticas
            </li>
            <li>
              <PlayCirculo /> Vídeos objetivos e diretos
            </li>
            <li>
              <Barras /> Conteúdo independente
            </li>
          </ul>
        </section>

        <form className="pn-entrar-caixa" onSubmit={enviar}>
          <div className="pn-entrar-marca">
            <h2>Entrar</h2>
            <span>Use o e-mail e a senha da sua conta.</span>
          </div>

          <Aviso tipo="erro">{erro}</Aviso>
          {senhaAlterada && !erro && (
            <Aviso tipo="ok">Senha alterada. Entre com a nova senha.</Aviso>
          )}

          <Campo rotulo="E-mail" obrigatorio>
            <Entrada
              type="email"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              autoFocus
              required
              placeholder="voce@makucho.com.br"
            />
          </Campo>

          <Campo rotulo="Senha" obrigatorio>
            <div className="pn-senha">
              <Entrada
                type={mostrarSenha ? 'text' : 'password'}
                name="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setMostrarSenha((v) => !v)}
                aria-label={mostrarSenha ? 'Ocultar a senha' : 'Mostrar a senha'}
              >
                {mostrarSenha ? 'ocultar' : 'mostrar'}
              </button>
            </div>
          </Campo>

          <Botao type="submit" variante="primario" carregando={enviando} className="pn-largo">
            {enviando ? 'Entrando…' : 'Entrar'}
          </Botao>

          <p className="pn-entrar-seguro">
            <Cadeado size={13} /> Acesso restrito à equipe editorial.
          </p>
        </form>
      </main>

      <footer className="pn-entrar-base">
        <span>© {new Date().getFullYear()} MAKUCHO. Todos os direitos reservados.</span>
        <span className="pn-entrar-slogan">Economia sem complicação.</span>
      </footer>
    </div>
  );
}

export default function PaginaEntrar() {
  // useSearchParams exige Suspense no App Router.
  return (
    <Suspense fallback={<div className="pn-tela-espera" />}>
      <FormularioLogin />
    </Suspense>
  );
}
