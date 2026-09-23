"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { CategoryDto } from "@makucho/types";
import { Lupa } from "@/components/icones";

/**
 * Cabeçalho do portal (seção 20): marca, navegação principal, busca e
 * as chamadas "Entrar" e "Acompanhe". No mobile, tudo vai para o menu.
 */

const NAVEGACAO = [
  { rotulo: "Início", href: "/" },
  { rotulo: "Análises", href: "/categoria/economia" },
  { rotulo: "Vídeos", href: "/videos" },
  { rotulo: "Sobre", href: "/sobre" },
];

export function Cabecalho({
  categorias,
  nomeDoSite = "MAKUCHO",
}: {
  categorias: CategoryDto[];
  nomeDoSite?: string;
}) {
  const [menuAberto, setMenuAberto] = useState(false);
  const botaoMenu = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLElement>(null);
  const rota = usePathname();
  const doMenu = categorias.filter((c) => c.showInMenu).slice(0, 6);

  useEffect(() => {
    if (!menuAberto) return;

    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") {
        setMenuAberto(false);
        botaoMenu.current?.focus();
      }
    };

    document.addEventListener("keydown", aoTeclar);
    menu.current?.querySelector<HTMLAnchorElement>("a")?.focus();
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [menuAberto]);

  const ativo = (href: string) =>
    href === "/" ? rota === "/" : rota.startsWith(href);

  return (
      <header className="topo">
        <div className="container topo-linha">
          <Link
            href="/"
            className="marca"
            aria-label={`${nomeDoSite}, página inicial`}
          >
            <Image
              src="/brand/makucho-logo-horizontal-dark-bg.webp"
              alt=""
              width={1262}
              height={220}
              className="marca-imagem"
              priority
            />
          </Link>

          <nav className="topo-nav" aria-label="Principal">
            {NAVEGACAO.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={ativo(item.href) ? "ativo" : undefined}
                aria-current={ativo(item.href) ? "page" : undefined}
              >
                {item.rotulo}
              </Link>
            ))}
          </nav>

          <div className="topo-direita">
            <Link href="/busca" className="topo-busca" aria-label="Buscar no portal">
              <Lupa size={20} />
            </Link>
            <Link href="/painel/entrar" className="botao-entrar" rel="nofollow">
              Entrar
            </Link>
            <Link href="/#newsletter" className="botao-inscrever">
              Acompanhe
            </Link>
          </div>

          <button
            ref={botaoMenu}
            type="button"
            className="menu-gatilho"
            aria-expanded={menuAberto}
            aria-controls="menu-editorias"
            onClick={() => setMenuAberto((aberto) => !aberto)}
          >
            <span aria-hidden="true">☰</span>
            <span className="so-leitor-de-tela">
              {menuAberto ? "Fechar" : "Abrir"} menu
            </span>
          </button>

          <nav
            ref={menu}
            id="menu-editorias"
            className={`menu ${menuAberto ? "menu-aberto" : ""}`}
            aria-label="Menu"
          >
            <form className="menu-busca" action="/busca" role="search">
              <label htmlFor="menu-busca-input">Buscar no portal</label>
              <div>
                <EntradaBusca id="menu-busca-input" />
                <button type="submit" aria-label="Buscar"><Lupa size={18} /></button>
              </div>
            </form>
            {NAVEGACAO.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={ativo(item.href) ? "ativo" : undefined}
                onClick={() => setMenuAberto(false)}
              >
                {item.rotulo}
              </Link>
            ))}
            {doMenu.map((c) => (
              <Link
                key={c.id}
                href={`/categoria/${c.slug}`}
                onClick={() => setMenuAberto(false)}
              >
                {c.name}
              </Link>
            ))}
            <Link href="/painel/entrar" rel="nofollow" onClick={() => setMenuAberto(false)}>
              Entrar
            </Link>
            <Link href="/#newsletter" onClick={() => setMenuAberto(false)}>
              Acompanhe
            </Link>
          </nav>
        </div>
      </header>
  );
}

function EntradaBusca({ id }: { id: string }) {
  return <input id={id} type="search" name="q" minLength={2} required placeholder="Assunto ou palavra-chave" />;
}
