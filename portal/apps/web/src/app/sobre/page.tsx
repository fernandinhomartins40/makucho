import type { Metadata } from 'next';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Moldura } from '@/components/moldura';

export const metadata: Metadata = {
  title: 'Sobre o MAKUCHO',
  description: 'Conheça a proposta editorial do MAKUCHO.',
};
export const dynamic = 'force-dynamic';
export const revalidate = 3600;

export default async function Sobre() {
  const dados = await api.homepage();
  const nome = String(dados.settings['site.name'] ?? 'MAKUCHO');
  const slogan = String(dados.settings['site.tagline'] ?? 'Economia sem complicação');
  const descricao = String(dados.settings['site.description'] ?? 'Análises de economia, mercado e finanças.');

  return (
    <Moldura>
      <div className="portal-institucional">
        <span className="hub-eyebrow">Sobre nós</span>
        <h1>{slogan}</h1>
        <p className="portal-institucional-lead">{descricao}</p>
        <section>
          <h2>Conteúdo para decidir melhor</h2>
          <p>O {nome} reúne análises, vídeos e assuntos de economia em uma leitura acessível. Explore o que acontece no mercado e entenda os efeitos para a sua vida financeira.</p>
        </section>
        <div className="hub-actions">
          <Link href="/" className="hub-primary">Explorar conteúdos</Link>
          <Link href="/contato" className="hub-secondary">Fale com a equipe</Link>
        </div>
      </div>
    </Moldura>
  );
}
