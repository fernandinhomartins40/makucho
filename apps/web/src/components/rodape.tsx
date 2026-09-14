import Link from 'next/link';
import type { CategoryDto, SiteSettings, SocialProfileDto } from '@makucho/types';
import { IconeRede, LogoM } from '@/components/icones';

/** Rodapé em quatro colunas, montado a partir do CMS (seção 27). */
export function Rodape({
  categorias,
  socials,
  settings,
}: {
  categorias: CategoryDto[];
  socials: SocialProfileDto[];
  settings: SiteSettings;
}) {
  const nome = (settings['site.name'] as string) ?? 'MAKUCHO';
  const sobre =
    (settings['site.description'] as string) ??
    'Conteúdo sobre economia, finanças, mercado e negócios para quem quer ir além. Informação que gera liberdade.';
  const copyright =
    (settings['footer.copyright'] as string) ?? `${nome}. Todos os direitos reservados.`;

  const navegacao = [
    { rotulo: 'Início', href: '/' },
    { rotulo: 'Anuncie', href: '/#publicidade' },
    { rotulo: 'Sobre', href: '/sobre' },
    { rotulo: 'Política de Privacidade', href: '/privacidade' },
    { rotulo: 'Contato', href: '/contato' },
    { rotulo: 'Termos de Uso', href: '/termos' },
  ];

  return (
    <footer className="rodape">
      <div className="container">
        <div className="rodape-grade">
          <div>
            <div className="rodape-marca">
              <LogoM size={34} />
              {nome}
            </div>
            <p className="rodape-sobre">{sobre}</p>
          </div>

          <div>
            <h3>Navegação</h3>
            <div className="rodape-colunas">
              {navegacao.map((n) => (
                <Link key={n.href + n.rotulo} href={n.href}>
                  {n.rotulo}
                </Link>
              ))}
            </div>
          </div>

          <div>
            <h3>Categorias</h3>
            <div className="rodape-colunas">
              {categorias.slice(0, 6).map((c) => (
                <Link key={c.id} href={`/categoria/${c.slug}`}>
                  {c.name}
                </Link>
              ))}
            </div>
          </div>

          <div>
            <h3>Siga nas redes</h3>
            <div className="rodape-redes">
              {socials.map((s) => (
                // noopener em link externo: sem ele a pagina aberta pode
                // manipular a nossa via window.opener.
                <a
                  key={s.id}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                >
                  <IconeRede platform={s.platform} size={16} />
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="rodape-base">
          <span>
            © {new Date().getFullYear()} {copyright}
          </span>
          <span>Feito para quem acredita em um futuro melhor.</span>
        </div>
      </div>
    </footer>
  );
}
