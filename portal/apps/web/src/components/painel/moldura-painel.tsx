'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { UserRole } from '@makucho/types';
import { pode } from '@/lib/painel';
import { useSessao } from '@/components/painel/sessao';
import { Botao, Carregando } from '@/components/painel/ui';

interface ItemMenu {
  href: string;
  rotulo: string;
  icone: React.ReactNode;
  /** Papel minimo; o backend valida de novo em cada rota. */
  minimo: UserRole;
}

const I = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

const MENU: ItemMenu[] = [
  { href: '/painel', rotulo: 'Visão geral', minimo: 'AUTHOR', icone: <I d="M3 12h7V3H3zM14 21h7v-9h-7zM14 9h7V3h-7zM3 21h7v-6H3z" /> },
  { href: '/painel/publicacoes', rotulo: 'Publicações', minimo: 'AUTHOR', icone: <I d="M4 4h11l5 5v11H4zM15 4v5h5M8 13h8M8 17h5" /> },
  { href: '/painel/midia', rotulo: 'Mídia', minimo: 'AUTHOR', icone: <I d="M3 5h18v14H3zM3 15l5-5 4 4 3-3 6 6" /> },
  { href: '/painel/videos', rotulo: 'Vídeos', minimo: 'AUTHOR', icone: <I d="M3 5h13v14H3zM16 10l5-3v10l-5-3z" /> },
  { href: '/painel/categorias', rotulo: 'Categorias', minimo: 'EDITOR', icone: <I d="M3 6h18M3 12h18M3 18h12" /> },
  { href: '/painel/tags', rotulo: 'Tags', minimo: 'AUTHOR', icone: <I d="M3 3h8l10 10-8 8L3 11zM7.5 7.5h.01" /> },
  { href: '/painel/autores', rotulo: 'Autores', minimo: 'EDITOR', icone: <I d="M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0" /> },
  { href: '/painel/home', rotulo: 'Home', minimo: 'EDITOR', icone: <I d="M3 10l9-7 9 7v10H3zM9 20v-7h6v7" /> },
  { href: '/painel/anuncios', rotulo: 'Anúncios', minimo: 'ADMIN', icone: <I d="M3 8h18v9H3zM7 21h10M12 17v4" /> },
  { href: '/painel/newsletter', rotulo: 'Newsletter', minimo: 'EDITOR', icone: <I d="M3 5h18v14H3zM3 6l9 7 9-7" /> },
  { href: '/painel/usuarios', rotulo: 'Usuários', minimo: 'ADMIN', icone: <I d="M9 11a4 4 0 100-8 4 4 0 000 8zM2 21a7 7 0 0114 0M17 11a4 4 0 100-8M22 21a7 7 0 00-5-6.7" /> },
  { href: '/painel/configuracoes', rotulo: 'Configurações', minimo: 'ADMIN', icone: <I d="M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2 2 2 0 11-4 0 1.7 1.7 0 00-2.9-1.2l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.7 1.7 0 004 15a2 2 0 110-4 1.7 1.7 0 001.2-2.9l-.1-.1a2 2 0 112.8-2.8l.1.1A1.7 1.7 0 0011 4a2 2 0 114 0 1.7 1.7 0 002.9 1.2l.1-.1a2 2 0 112.8 2.8l-.1.1A1.7 1.7 0 0020 11a2 2 0 110 4z" /> },
  { href: '/painel/auditoria', rotulo: 'Auditoria', minimo: 'ADMIN', icone: <I d="M12 8v5l3 2M21 12a9 9 0 11-3-6.7L21 8M21 3v5h-5" /> },
];

export function MolduraPainel({ children }: { children: React.ReactNode }) {
  const { usuario, carregando, sair } = useSessao();
  const caminho = usePathname();
  const router = useRouter();
  const [menuAberto, setMenuAberto] = useState(false);
  const gatilhoMenu = useRef<HTMLButtonElement>(null);

  // A rota /painel/entrar tem moldura propria; aqui so tratamos o resto.
  useEffect(() => {
    if (!carregando && !usuario) {
      router.replace(`/painel/entrar?destino=${encodeURIComponent(caminho)}`);
    }
  }, [carregando, usuario, router, caminho]);

  // Trocar de tela fecha o menu do celular.
  useEffect(() => setMenuAberto(false), [caminho]);

  useEffect(() => {
    if (!menuAberto) return;
    const fecharComEscape = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') {
        setMenuAberto(false);
        gatilhoMenu.current?.focus();
      }
    };
    document.addEventListener('keydown', fecharComEscape);
    return () => document.removeEventListener('keydown', fecharComEscape);
  }, [menuAberto]);

  if (carregando) {
    return (
      <div className="pn-tela-espera">
        <Carregando texto="Verificando a sessão…" />
      </div>
    );
  }

  if (!usuario) return null;

  // Quem precisa trocar a senha nao circula pelo painel antes disso.
  if (usuario.mustChangePassword && caminho !== '/painel/senha') {
    router.replace('/painel/senha');
    return null;
  }

  const itens = MENU.filter((i) => pode(usuario, i.minimo));

  return (
    <div className={`pn ${menuAberto ? 'pn-menu-aberto' : ''}`}>
      <aside className="pn-lateral" id="pn-navegacao">
        <Link href="/painel" className="pn-marca">
          <Image
            src="/brand/makucho-logo-horizontal-dark-bg.webp"
            alt="MAKUCHO"
            width={1262}
            height={220}
            className="pn-logo-horizontal"
          />
          <span className="so-leitor-de-tela">Início do painel</span>
        </Link>

        <nav className="pn-nav" aria-label="Navegação do painel">
          {itens.map((i) => {
            const ativo = i.href === '/painel' ? caminho === '/painel' : caminho.startsWith(i.href);
            return (
              <Link key={i.href} href={i.href} className={ativo ? 'pn-nav-ativo' : ''} aria-current={ativo ? 'page' : undefined}>
                {i.icone}
                {i.rotulo}
              </Link>
            );
          })}
        </nav>

        <div className="pn-lateral-pe">
          <Link href="/" target="_blank" rel="noopener noreferrer" className="pn-ver-site">
            <I d="M18 13v6H5V6h6M15 3h6v6M10 14L21 3" />
            Ver o site
          </Link>
        </div>
      </aside>

      <div className="pn-conteudo">
        <header className="pn-topo">
          <button
            ref={gatilhoMenu}
            type="button"
            className="pn-hamburguer"
            onClick={() => setMenuAberto((v) => !v)}
            aria-label={menuAberto ? 'Fechar o menu' : 'Abrir o menu'}
            aria-expanded={menuAberto}
            aria-controls="pn-navegacao"
          >
            <I d="M3 6h18M3 12h18M3 18h18" />
          </button>

          <div className="pn-usuario">
            <span>
              <strong>{usuario.name}</strong>
              <small>{rotuloPapel(usuario.role)}</small>
            </span>
            <Link href="/painel/senha" className="pn-avatar" title="Minha conta">
              {usuario.name.charAt(0).toUpperCase()}
            </Link>
            <Botao variante="fantasma" onClick={() => void sair()}>
              Sair
            </Botao>
          </div>
        </header>

        <main className="pn-principal">{children}</main>
      </div>

      <button
        type="button"
        className="pn-veu-menu"
        onClick={() => setMenuAberto(false)}
        aria-hidden={!menuAberto}
        tabIndex={-1}
      />
    </div>
  );
}

export function rotuloPapel(papel: UserRole): string {
  return {
    SUPER_ADMIN: 'Super administrador',
    ADMIN: 'Administrador',
    EDITOR: 'Editor',
    AUTHOR: 'Autor',
  }[papel];
}

/** Cabecalho padrao das telas internas. */
export function TituloPagina({
  titulo,
  descricao,
  acoes,
}: {
  titulo: string;
  descricao?: string;
  acoes?: React.ReactNode;
}) {
  return (
    <header className="pn-titulo">
      <div>
        <h1>{titulo}</h1>
        {descricao && <p>{descricao}</p>}
      </div>
      {acoes && <div className="pn-titulo-acoes">{acoes}</div>}
    </header>
  );
}
