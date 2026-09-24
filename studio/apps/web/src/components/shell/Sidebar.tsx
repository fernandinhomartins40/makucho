'use client';

// ============================================================
// Navegação lateral — a mesma em todas as telas.
//
// As referências divergiam entre si: uma trazia 232px com tagline,
// outra 72px empilhada, e cada uma um rodapé diferente. Uma
// navegação que muda de forma entre telas obriga a reaprender onde
// as coisas estão a cada passo, então aqui ela é uma só.
//
// O rodapé ficou com o armazenamento porque é o único que mostra
// estado real: a cota de 10 GB precisa estar à vista ANTES de
// encher, já que vídeos antigos cedem lugar aos novos.
// ============================================================

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { Icon } from '@phosphor-icons/react';
import {
  IconeProjetos,
  IconeRoteiro,
  IconeGravar,
  IconeEditor,
  IconeMarca,
  IconeAjuda,
  IconeConfiguracoes,
  IconeNuvem,
  IconeAvancar,
  IconeSair,
} from '../icones';
import { auth } from '../../lib/api';

interface ItemDeNavegacao {
  href: string;
  rotulo: string;
  /** Tipo da própria biblioteca: aceita size, weight, color e mirrored. */
  Icone: Icon;
}

const ITENS: ItemDeNavegacao[] = [
  { href: '/', rotulo: 'Projetos', Icone: IconeProjetos },
  { href: '/roteiros', rotulo: 'Roteiro', Icone: IconeRoteiro },
  { href: '/gravar', rotulo: 'Gravar', Icone: IconeGravar },
  { href: '/editor', rotulo: 'Editor', Icone: IconeEditor },
  { href: '/marca', rotulo: 'Marca', Icone: IconeMarca },
];

const GB = 1024 ** 3;
const QUOTA_TOTAL_BYTES = 10 * GB;

export function Sidebar() {
  const caminho = usePathname();

  return (
    <aside className="sidebar">
      <div className="sidebar__marca">
        <Link href="/" aria-label="MAKUCHO Studio — início" className="sidebar__logo">
          <Logotipo />
          <span>
            <span className="sidebar__nome">MAKUCHO</span>
            <span className="sidebar__sub">Studio</span>
          </span>
        </Link>
        <p className="sidebar__tagline">Seus vídeos, editados por IA</p>
      </div>

      <nav className="sidebar__nav" aria-label="Navegação principal">
        {ITENS.map(({ href, rotulo, Icone }) => {
          const ativo = href === '/' ? caminho === '/' : caminho.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              className="nav-item"
              aria-current={ativo ? 'page' : undefined}
            >
              <span className="nav-item__icone" aria-hidden>
                <Icone size={20} weight={ativo ? 'fill' : 'regular'} />
              </span>
              <span className="nav-item__rotulo">{rotulo}</span>
            </Link>
          );
        })}
      </nav>

      <div className="sidebar__rodape">
        <Armazenamento />

        <Link
          href="/configuracoes"
          className="nav-item"
          aria-current={caminho.startsWith('/configuracoes') ? 'page' : undefined}
        >
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

        <Sair />
      </div>
    </aside>
  );
}

/**
 * Espaço usado, somando as duas cotas.
 *
 * A sidebar mostra o total; a divisão entre materiais permanentes e
 * vídeos em edição fica em Marca, onde há espaço para explicar que
 * uma cede lugar e a outra não.
 */
function Armazenamento() {
  const [usadoBytes, setUsadoBytes] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/settings/storage', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((uso) => {
        if (!uso) return;
        setUsadoBytes(uso.permanente.usadoBytes + uso.edicao.usadoBytes);
      })
      .catch(() => undefined);
  }, []);

  // Sem dado, o bloco não aparece: uma barra vazia sugeriria disco
  // livre que ninguém verificou.
  if (usadoBytes === null) return null;

  const pct = Math.min(100, (usadoBytes / QUOTA_TOTAL_BYTES) * 100);
  const gb = (b: number) => (b / GB).toFixed(1).replace('.', ',');

  return (
    <div className="sidebar__armazenamento">
      <span className="linha" style={{ gap: 'var(--e2)' }}>
        <IconeNuvem size={17} />
        <strong style={{ fontSize: 13 }}>Armazenamento</strong>
      </span>

      <p style={{ fontSize: 15, fontWeight: 600, margin: 'var(--e2) 0 var(--e1)' }}>
        {gb(usadoBytes)} GB de {QUOTA_TOTAL_BYTES / GB} GB
      </p>

      <div
        className="barra"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Armazenamento: ${Math.round(pct)}% usado`}
      >
        <div
          className="barra__preenchida"
          style={{
            width: `${pct}%`,
            background: pct >= 90 ? 'var(--danger)' : undefined,
          }}
        />
      </div>

      <Link href="/configuracoes" className="sidebar__link">
        Gerenciar armazenamento
        <IconeAvancar size={13} />
      </Link>
    </div>
  );
}

/**
 * Sair.
 *
 * Sem isto nao ha como trocar de conta nem encerrar a sessao num
 * computador compartilhado -- o cookie dura sete dias.
 *
 * `replace` e nao `push`: o botao voltar nao pode trazer de volta uma
 * tela autenticada depois de sair. Ela viria do cache do navegador e
 * pareceria que a sessao continua.
 */
function Sair() {
  const router = useRouter();
  const [saindo, setSaindo] = useState(false);

  const sair = async () => {
    setSaindo(true);
    // O `catch` ignora a falha de proposito: se a chamada nao passar,
    // ir para a tela de entrar continua sendo o certo -- e insistir
    // deixaria a pessoa presa numa tela que ela pediu para deixar.
    await auth.sair().catch(() => undefined);
    router.replace('/entrar');
    router.refresh();
  };

  return (
    <button
      type="button"
      className="nav-item"
      onClick={() => void sair()}
      disabled={saindo}
      style={{ width: '100%', border: 0, background: 'none', cursor: 'pointer' }}
    >
      <span className="nav-item__icone" aria-hidden>
        <IconeSair size={20} />
      </span>
      <span className="nav-item__rotulo">{saindo ? 'Saindo…' : 'Sair'}</span>
    </button>
  );
}

/**
 * Logotipo desenhado em código.
 *
 * O manifesto dos assets é explícito: o logo vem do arquivo oficial
 * da marca, não extraído do mockup. Enquanto ele não chega, esta
 * marca tipográfica ocupa o lugar sem inventar um símbolo.
 */
function Logotipo() {
  return (
    <span className="sidebar__sigla" aria-hidden>
      M
    </span>
  );
}
