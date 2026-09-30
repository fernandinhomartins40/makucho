'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { UserRole } from '@makucho/types';
import { pode } from '@/lib/painel';
import { useSessao } from '@/components/painel/sessao';
import { Carregando } from '@/components/painel/ui';

/**
 * O painel organizado por TAREFA, não por tabela do banco: seis seções.
 * Cada seção junta as telas de um mesmo assunto em abas (Conteúdo =
 * matérias, vídeos e imagens; Configurações = site, radar, newsletter,
 * equipe e histórico). Os endereços antigos continuam os mesmos -- só o
 * caminho até eles ficou curto.
 */
interface Aba {
  href: string;
  rotulo: string;
  /** Papel mínimo; o backend valida de novo em cada rota. */
  minimo: UserRole;
}

interface Secao {
  id: string;
  rotulo: string;
  icone: React.ReactNode;
  abas: Aba[];
}

const I = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

export const SECOES: Secao[] = [
  { id: 'inicio', rotulo: 'Início', icone: <I d="M3 12h7V3H3zM14 21h7v-9h-7zM14 9h7V3h-7zM3 21h7v-6H3z" />, abas: [{ href: '/painel', rotulo: 'Início', minimo: 'AUTHOR' }] },
  {
    id: 'conteudo',
    rotulo: 'Conteúdo',
    icone: <I d="M4 4h11l5 5v11H4zM15 4v5h5M8 13h8M8 17h5" />,
    abas: [
      { href: '/painel/publicacoes', rotulo: 'Matérias', minimo: 'AUTHOR' },
      { href: '/painel/videos', rotulo: 'Vídeos', minimo: 'AUTHOR' },
      { href: '/painel/midia', rotulo: 'Imagens', minimo: 'AUTHOR' },
    ],
  },
  { id: 'home', rotulo: 'Página inicial', icone: <I d="M3 10l9-7 9 7v10H3zM9 20v-7h6v7" />, abas: [{ href: '/painel/home', rotulo: 'Página inicial', minimo: 'EDITOR' }] },
  {
    id: 'organizacao',
    rotulo: 'Organização',
    icone: <I d="M3 3h8l10 10-8 8L3 11zM7.5 7.5h.01" />,
    abas: [
      { href: '/painel/categorias', rotulo: 'Editorias', minimo: 'EDITOR' },
      { href: '/painel/tags', rotulo: 'Assuntos', minimo: 'AUTHOR' },
      { href: '/painel/autores', rotulo: 'Assinaturas', minimo: 'EDITOR' },
    ],
  },
  { id: 'anuncios', rotulo: 'Anúncios', icone: <I d="M3 8h18v9H3zM7 21h10M12 17v4" />, abas: [{ href: '/painel/anuncios', rotulo: 'Anúncios', minimo: 'ADMIN' }] },
  {
    id: 'configuracoes',
    rotulo: 'Configurações',
    icone: <I d="M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2 2 2 0 11-4 0 1.7 1.7 0 00-2.9-1.2l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.7 1.7 0 004 15a2 2 0 110-4 1.7 1.7 0 001.2-2.9l-.1-.1a2 2 0 112.8-2.8l.1.1A1.7 1.7 0 0011 4a2 2 0 114 0 1.7 1.7 0 002.9 1.2l.1-.1a2 2 0 112.8 2.8l-.1.1A1.7 1.7 0 0020 11a2 2 0 110 4z" />,
    abas: [
      { href: '/painel/configuracoes', rotulo: 'Site e redes', minimo: 'ADMIN' },
      { href: '/painel/mercado', rotulo: 'Radar do mercado', minimo: 'EDITOR' },
      { href: '/painel/newsletter', rotulo: 'Newsletter', minimo: 'EDITOR' },
      { href: '/painel/usuarios', rotulo: 'Equipe', minimo: 'ADMIN' },
      { href: '/painel/auditoria', rotulo: 'Histórico', minimo: 'ADMIN' },
    ],
  },
];

/** A aba de um caminho (a mais específica). */
function abaDoCaminho(caminho: string): { secao: Secao; aba: Aba } | null {
  let achada: { secao: Secao; aba: Aba } | null = null;
  for (const secao of SECOES) {
    for (const aba of secao.abas) {
      const bate = aba.href === '/painel' ? caminho === '/painel' : caminho === aba.href || caminho.startsWith(`${aba.href}/`);
      if (bate && (!achada || aba.href.length > achada.aba.href.length)) achada = { secao, aba };
    }
  }
  return achada;
}

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

  // Só as seções (e abas) que o papel da pessoa alcança.
  const secoes = SECOES.map((sc) => ({ ...sc, abas: sc.abas.filter((a) => pode(usuario, a.minimo)) })).filter((sc) => sc.abas.length > 0);
  const aqui = abaDoCaminho(caminho);
  const secaoAtual = aqui ? secoes.find((sc) => sc.id === aqui.secao.id) : undefined;

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
          <div className="pn-nav-grupo">
            {secoes.map((sc) => {
              const ativo = secaoAtual?.id === sc.id;
              return (
                <Link key={sc.id} href={sc.abas[0]!.href} className={ativo ? 'pn-nav-ativo' : ''} aria-current={ativo ? 'page' : undefined}>
                  {sc.icone}
                  {sc.rotulo}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="pn-lateral-pe">
          <Link href="/painel/senha" className="pn-conta" aria-current={caminho === '/painel/senha' ? 'page' : undefined}>
            <span className="pn-avatar" aria-hidden="true">{usuario.name.charAt(0).toUpperCase()}</span>
            <span className="pn-conta-texto">
              <strong>{usuario.name}</strong>
              <small>{rotuloPapel(usuario.role)} · Minha conta</small>
            </span>
          </Link>
          <button type="button" className="pn-sair" onClick={() => void sair()}>
            <I d="M15 12H3M11 8l-4 4 4 4M15 4h4a2 2 0 012 2v12a2 2 0 01-2 2h-4" />
            Sair
          </button>
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

          <nav className="pn-trilha" aria-label="Você está em">
            <Link href="/painel">Painel</Link>
            {secaoAtual && secaoAtual.id !== 'inicio' && (
              <>
                <span aria-hidden="true">/</span>
                {secaoAtual.abas.length > 1 && aqui ? (
                  <>
                    <Link href={secaoAtual.abas[0]!.href}>{secaoAtual.rotulo}</Link>
                    <span aria-hidden="true">/</span>
                    <span aria-current="page">{aqui.aba.rotulo}</span>
                  </>
                ) : (
                  <span aria-current="page">{secaoAtual.rotulo}</span>
                )}
              </>
            )}
            {caminho === '/painel/senha' && (
              <>
                <span aria-hidden="true">/</span>
                <span aria-current="page">Minha conta</span>
              </>
            )}
          </nav>

          <div className="pn-topo-acoes">
            <Link href="/" target="_blank" rel="noopener noreferrer" className="pn-botao pn-botao-fantasma pn-topo-site">
              <I d="M18 13v6H5V6h6M15 3h6v6M10 14L21 3" />
              <span>Ver o site</span>
            </Link>
          </div>
        </header>

        <main className="pn-principal">
          {/* As telas de uma mesma seção, em abas: uma seção, um assunto. */}
          {secaoAtual && secaoAtual.abas.length > 1 && (
            <nav className="pn-secao-abas" aria-label={secaoAtual.rotulo}>
              {secaoAtual.abas.map((a) => {
                const ativa = aqui?.aba.href === a.href;
                return (
                  <Link key={a.href} href={a.href} className={ativa ? 'pn-secao-aba-ativa' : ''} aria-current={ativa ? 'page' : undefined}>
                    {a.rotulo}
                  </Link>
                );
              })}
            </nav>
          )}
          {children}
        </main>
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
  fixo = false,
}: {
  titulo: string;
  descricao?: string;
  acoes?: React.ReactNode;
  /** Formularios longos: o cabecalho (e o botao de salvar) acompanha a rolagem. */
  fixo?: boolean;
}) {
  return (
    <header className={`pn-titulo${fixo ? ' pn-titulo-fixo' : ''}`}>
      <div>
        <h1>{titulo}</h1>
        {descricao && <p>{descricao}</p>}
      </div>
      {acoes && <div className="pn-titulo-acoes">{acoes}</div>}
    </header>
  );
}
