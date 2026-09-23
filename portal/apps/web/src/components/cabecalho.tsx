"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type {
  CategoryDto,
  MarketIndicatorDto,
  SocialProfileDto,
} from "@makucho/types";
import {
  IconeIndicador,
  Lupa,
  TriEmAlta,
  TriEmBaixa,
} from "@/components/icones";

/**
 * Cabecalho e ticker (secoes 19 e 20).
 *
 * Componente de servidor: nao envia JavaScript ao navegador. O unico
 * elemento interativo e a busca, que funciona por GET nativo — sem JS,
 * continua funcionando.
 */

function formatarValor(valor: number, unidade: string | null): string {
  const casas = Math.abs(valor) >= 1000 ? 2 : 2;
  const numero = valor.toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });

  if (unidade === "R$" || unidade === "US$") return `${unidade} ${numero}`;
  if (unidade === "a.a." || unidade === "%") return `${numero}%`;
  return numero;
}

function Ticker({ indicadores }: { indicadores: MarketIndicatorDto[] }) {
  if (indicadores.length === 0) return null;

  const hoje = new Date().toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="ticker">
      <div className="container ticker-linha">
        {indicadores.map((i) => {
          const variacao = i.changePercent ?? 0;
          const classe =
            variacao > 0 ? "sobe" : variacao < 0 ? "desce" : "neutro";

          return (
            <div key={i.id} className="ticker-item">
              <span className="ticker-icone">
                <IconeIndicador symbol={i.symbol} icon={i.icon} />
              </span>
              <span className="ticker-dados">
                <span className="ticker-nome">
                  {i.label}
                  {i.unit && i.unit !== "pts" ? ` (${i.unit})` : ""}
                </span>
                <span className="ticker-valor-linha">
                  <span className="ticker-valor">
                    {formatarValor(i.value, i.unit)}
                  </span>
                  <span className={`ticker-var ${classe}`}>
                    {variacao > 0 && <TriEmAlta />}
                    {variacao < 0 && <TriEmBaixa />}
                    {variacao === 0
                      ? "— 0,00%"
                      : `${Math.abs(variacao).toFixed(2).replace(".", ",")}%`}
                  </span>
                </span>
              </span>
            </div>
          );
        })}

        <div className="ticker-item ticker-data">
          <span className="ticker-icone">
            <IconeIndicador symbol="IPCA" icon={null} />
          </span>
          <span className="ticker-dados">
            <span className="ticker-nome">Mercado hoje</span>
            <span
              className="ticker-valor"
              style={{ fontSize: "0.74rem", fontWeight: 500 }}
            >
              {hoje}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

const NAVEGACAO = [
  { rotulo: "Início", href: "/" },
  { rotulo: "Análises", href: "/categoria/economia" },
  { rotulo: "Vídeos", href: "/videos" },
  { rotulo: "Sobre", href: "/sobre" },
];

export function Cabecalho({
  categorias,
  indicadores,
  nomeDoSite = "MAKUCHO",
}: {
  categorias: CategoryDto[];
  indicadores: MarketIndicatorDto[];
  socials?: SocialProfileDto[];
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
    <>
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

      <Ticker indicadores={indicadores} />
    </>
  );
}

function EntradaBusca({ id }: { id: string }) {
  return <input id={id} type="search" name="q" minLength={2} required placeholder="Assunto ou palavra-chave" />;
}
