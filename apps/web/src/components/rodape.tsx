import Link from 'next/link';
import type { CategoryDto, SiteSettings, SocialProfileDto } from '@makucho/types';

/** Rodapé montado a partir das configurações do CMS (seção 27). */
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
  const slogan = settings['site.tagline'] as string | undefined;
  const copyright = (settings['footer.copyright'] as string) ?? `${nome}. Todos os direitos reservados.`;
  const email = settings['site.email'] as string | undefined;

  return (
    <footer className="rodape">
      <div className="container">
        <div className="rodape-grade">
          <div>
            <h3>{nome}</h3>
            {slogan && <p style={{ maxWidth: '42ch' }}>{slogan}</p>}
            {email && (
              <p style={{ marginTop: 10 }}>
                <a href={`mailto:${email}`}>{email}</a>
              </p>
            )}
          </div>

          <div>
            <h3>Editorias</h3>
            <ul>
              {categorias.slice(0, 6).map((c) => (
                <li key={c.id}>
                  <Link href={`/categoria/${c.slug}`}>{c.name}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3>Siga o {nome}</h3>
            <ul>
              {socials.map((s) => (
                <li key={s.id}>
                  {/* noopener em link externo: sem ele a pagina aberta
                      pode manipular a nossa via window.opener. */}
                  <a href={s.url} target="_blank" rel="noopener noreferrer">
                    {s.label}
                    {s.followerLabel && (
                      <span style={{ opacity: 0.6 }}> · {s.followerLabel}</span>
                    )}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="rodape-base">
          © {new Date().getFullYear()} {copyright}
        </div>
      </div>
    </footer>
  );
}
