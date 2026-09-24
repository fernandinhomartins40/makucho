'use client';

// ============================================================
// Navegação do celular: barra fixa no rodapé, como nos apps nativos.
//
// Abaixo de 900px a sidebar de 232px some (comeria 60% da tela) e a
// navegação desce para onde o polegar alcança. Cinco lugares, o
// padrão de iOS e Android: Projetos, Roteiro, Gravar em destaque no
// centro (a ação que começa tudo), Marca e "Mais" -- que abre uma
// folha com o que é menos frequente: Configurações, Ajuda,
// armazenamento, instalar o app e sair.
// ============================================================

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Icon } from '@phosphor-icons/react';
import {
  IconeProjetos,
  IconeRoteiro,
  IconeGravar,
  IconeMarca,
  IconeMaisOpcoes,
  IconeConfiguracoes,
  IconeAjuda,
  IconeInstalar,
  IconeEditor,
} from '../icones';
import { Folha } from './Folha';
import { Armazenamento, Sair } from './Sidebar';
import { PassoAPasso, useGuiaDeInstalacao } from '../pwa/GuiaDeInstalacao';

const ITENS: Array<{ href: string; rotulo: string; Icone: Icon; destaque?: boolean }> = [
  { href: '/', rotulo: 'Projetos', Icone: IconeProjetos },
  { href: '/roteiros', rotulo: 'Roteiro', Icone: IconeRoteiro },
  { href: '/gravar', rotulo: 'Gravar', Icone: IconeGravar, destaque: true },
  { href: '/marca', rotulo: 'Marca', Icone: IconeMarca },
];

export function BarraInferior() {
  const caminho = usePathname();
  const [mais, setMais] = useState(false);
  const fechar = useCallback(() => setMais(false), []);
  const noMais = ['/configuracoes', '/ajuda', '/editor'].some((r) => caminho.startsWith(r));

  return (
    <>
      <nav className="barra-inferior" aria-label="Navegação principal">
        {ITENS.map(({ href, rotulo, Icone, destaque }) => {
          const ativo = href === '/' ? caminho === '/' : caminho.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`barra-inferior__item${destaque ? ' barra-inferior__item--destaque' : ''}`}
              aria-current={ativo ? 'page' : undefined}
            >
              <span className="barra-inferior__icone" aria-hidden>
                <Icone size={destaque ? 26 : 23} weight={ativo || destaque ? 'fill' : 'regular'} />
              </span>
              <span className="barra-inferior__rotulo">{rotulo}</span>
            </Link>
          );
        })}
        <button
          type="button"
          className="barra-inferior__item"
          aria-current={noMais ? 'page' : undefined}
          aria-expanded={mais}
          onClick={() => setMais(true)}
        >
          <span className="barra-inferior__icone" aria-hidden>
            <IconeMaisOpcoes size={23} weight={noMais ? 'fill' : 'regular'} />
          </span>
          <span className="barra-inferior__rotulo">Mais</span>
        </button>
      </nav>

      <Folha aberta={mais} aoFechar={fechar} titulo="Mais">
        <div className="pilha" style={{ gap: 'var(--e1)' }} onClick={(e) => (e.target as HTMLElement).closest('a') && fechar()}>
          <Link href="/editor" className="nav-item">
            <span className="nav-item__icone" aria-hidden>
              <IconeEditor size={20} />
            </span>
            <span className="nav-item__rotulo">Editor</span>
          </Link>
          <Link href="/configuracoes" className="nav-item">
            <span className="nav-item__icone" aria-hidden>
              <IconeConfiguracoes size={20} />
            </span>
            <span className="nav-item__rotulo">Configurações</span>
          </Link>
          <Link href="/ajuda" className="nav-item">
            <span className="nav-item__icone" aria-hidden>
              <IconeAjuda size={20} />
            </span>
            <span className="nav-item__rotulo">Ajuda</span>
          </Link>
          <InstalarNoMenu />
          <Sair />
        </div>
        <div style={{ marginTop: 'var(--e4)' }}>
          <Armazenamento />
        </div>
      </Folha>
    </>
  );
}

/** "Instalar o app": some quando já está instalado. */
function InstalarNoMenu() {
  const { instalado, podeInstalarNativo, instalar, guia, plataforma } = useGuiaDeInstalacao();
  const [aberto, setAberto] = useState(false);
  if (!plataforma || instalado) return null;

  return (
    <div>
      <button
        type="button"
        className="nav-item"
        onClick={() => (podeInstalarNativo ? void instalar() : setAberto((a) => !a))}
        aria-expanded={podeInstalarNativo ? undefined : aberto}
      >
        <span className="nav-item__icone" aria-hidden>
          <IconeInstalar size={20} />
        </span>
        <span className="nav-item__rotulo">Instalar o app</span>
      </button>
      {aberto && guia && (
        <div style={{ padding: 'var(--e2) var(--e3) var(--e3)' }}>
          <p style={{ fontWeight: 600, marginBottom: 'var(--e2)' }}>{guia.titulo}</p>
          <PassoAPasso guia={guia} />
        </div>
      )}
    </div>
  );
}
