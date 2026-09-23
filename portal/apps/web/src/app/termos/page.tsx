import type { Metadata } from 'next';
import { api } from '@/lib/api';
import { Moldura } from '@/components/moldura';

export const metadata: Metadata = {
  title: 'Termos de Uso',
  description: 'Condições de uso do conteúdo publicado no MAKUCHO.',
  alternates: { canonical: '/termos' },
};

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

/** Texto sujeito a revisão jurídica do responsável pelo portal. */
export default async function Termos() {
  const dados = await api.homepage().catch(() => null);
  const nome = String(dados?.settings['site.name'] ?? 'MAKUCHO');

  return (
    <Moldura>
      <div className="portal-institucional">
        <span className="hub-eyebrow">Institucional</span>
        <h1>Termos de Uso</h1>
        <p className="portal-institucional-lead">
          Ao acessar o {nome}, você concorda com as condições abaixo.
        </p>

        <section>
          <h2>Caráter informativo</h2>
          <p>
            As análises, notícias e vídeos publicados têm finalidade informativa e educacional. Não
            constituem recomendação de investimento nem substituem a orientação de um profissional
            habilitado. Decisões financeiras são de responsabilidade de quem as toma.
          </p>
        </section>

        <section>
          <h2>Direitos sobre o conteúdo</h2>
          <p>
            Textos, imagens, vídeos e a marca {nome} pertencem aos seus autores e ao portal. É permitido
            compartilhar links e citar trechos com crédito e link para a publicação original; a
            reprodução integral depende de autorização.
          </p>
        </section>

        <section>
          <h2>Publicidade</h2>
          <p>
            Espaços publicitários são identificados como tal. O conteúdo editorial é independente dos
            anunciantes.
          </p>
        </section>
      </div>
    </Moldura>
  );
}
