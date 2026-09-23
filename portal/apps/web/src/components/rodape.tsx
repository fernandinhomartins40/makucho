import Link from 'next/link';
import Image from 'next/image';
import type { CategoryDto, SiteSettings, SocialProfileDto } from '@makucho/types';
import { IconeRede } from '@/components/icones';
import { AnuncioSlot } from '@/components/anuncio-home';

/** Rodapé: marca, navegação principal, redes e links legais (seção 27). */
export function Rodape({
  socials,
  settings,
}: {
  categorias: CategoryDto[];
  socials: SocialProfileDto[];
  settings: SiteSettings;
}) {
  const nome = (settings['site.name'] as string) ?? 'MAKUCHO';
  const copyright =
    (settings['footer.copyright'] as string) ?? `${nome}. Todos os direitos reservados.`;

  const navegacao = [
    { rotulo: 'Início', href: '/' },
    { rotulo: 'Análises', href: '/categoria/economia' },
    { rotulo: 'Vídeos', href: '/videos' },
    { rotulo: 'Sobre', href: '/sobre' },
  ];
  const legais = [
    { rotulo: 'Política de Privacidade', href: '/privacidade' },
    { rotulo: 'Termos de Uso', href: '/termos' },
    { rotulo: 'Contato', href: '/contato' },
  ];
  // A ordem da referência: YouTube, Instagram, X e LinkedIn primeiro.
  const ordem = ['youtube', 'instagram', 'twitter', 'x', 'linkedin', 'tiktok'];
  const redes = [...socials].sort(
    (a, b) => ordem.indexOf(a.platform.toLowerCase()) - ordem.indexOf(b.platform.toLowerCase()),
  );

  return (
    <>
    <div className="container"><AnuncioSlot posicao="FOOTER" /></div>
    <footer className="rodape">
      <div className="container">
        <div className="rodape-grade">
          <div className="rodape-marca">
            <Image
              src="/brand/makucho-logo-horizontal-dark-bg.webp"
              alt={nome}
              width={1262}
              height={220}
              className="marca-imagem"
            />
            <p className="rodape-sobre">
              Conteúdo independente sobre economia, finanças e o futuro do dinheiro.
            </p>
          </div>

          <nav className="rodape-nav" aria-label="Rodapé">
            {navegacao.map((n) => (
              <Link key={n.href} href={n.href}>
                {n.rotulo}
              </Link>
            ))}
          </nav>

          {redes.length > 0 && (
            <div className="rodape-redes">
              <span>Siga nas redes</span>
              {redes.slice(0, 4).map((s) => (
                // noopener em link externo: sem ele a pagina aberta pode
                // manipular a nossa via window.opener.
                <a
                  key={s.id}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                >
                  <IconeRede platform={s.platform} size={18} />
                </a>
              ))}
            </div>
          )}
        </div>

        <div className="rodape-base">
          <span>
            © {new Date().getFullYear()} {copyright}
          </span>
          <nav className="rodape-legal" aria-label="Institucional">
            {legais.map((n) => (
              <Link key={n.href} href={n.href}>
                {n.rotulo}
              </Link>
            ))}
          </nav>
          <span className="rodape-base-fim">Economia sem complicação.</span>
        </div>
      </div>
    </footer>
    </>
  );
}
