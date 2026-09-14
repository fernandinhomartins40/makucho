'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ErroApi, painel } from '@/lib/painel';
import { useSessao } from '@/components/painel/sessao';
import { Aviso, Botao, Campo, Entrada } from '@/components/painel/ui';
import { LogoM } from '@/components/icones';

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
      <form className="pn-entrar-caixa" onSubmit={enviar}>
        <div className="pn-entrar-marca">
          <LogoM size={44} />
          <strong>MAKUCHO</strong>
          <span>Painel editorial</span>
        </div>

        <Aviso tipo="erro">{erro}</Aviso>

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

        <Link href="/" className="pn-entrar-voltar">
          ← Voltar para o site
        </Link>
      </form>
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
