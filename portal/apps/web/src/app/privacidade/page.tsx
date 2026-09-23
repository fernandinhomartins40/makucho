import type { Metadata } from 'next';
import { api } from '@/lib/api';
import { Moldura } from '@/components/moldura';

export const metadata: Metadata = {
  title: 'Política de Privacidade',
  description: 'Como o MAKUCHO trata os dados de quem lê o portal e assina a newsletter.',
  alternates: { canonical: '/privacidade' },
};

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

/**
 * Descreve somente o que o sistema faz de fato (schema Prisma: PostView,
 * AdEvent, SearchQuery, NewsletterSubscriber). Texto sujeito a revisão
 * jurídica do responsável pelo portal.
 */
export default async function Privacidade() {
  const dados = await api.homepage().catch(() => null);
  const nome = String(dados?.settings['site.name'] ?? 'MAKUCHO');
  const email = String(dados?.settings['site.email'] ?? '').trim();

  return (
    <Moldura>
      <div className="portal-institucional">
        <span className="hub-eyebrow">Institucional</span>
        <h1>Política de Privacidade</h1>
        <p className="portal-institucional-lead">
          O {nome} coleta o mínimo necessário para funcionar, medir audiência de forma agregada e
          enviar a newsletter a quem pediu.
        </p>

        <section>
          <h2>Leitura do portal</h2>
          <p>
            Para contar leituras, buscas e exibições de anúncios, registramos um identificador de
            sessão gerado a partir de um resumo irreversível (hash) de dados técnicos da conexão,
            renovado a cada dia, além da página de origem e do país de acesso. Não guardamos o
            endereço IP em claro e não usamos esses dados para identificar leitores individualmente.
          </p>
        </section>

        <section>
          <h2>Newsletter</h2>
          <p>
            Ao se inscrever, guardamos o e-mail informado, a data do consentimento e um resumo
            irreversível do IP no momento da inscrição, como prova do consentimento exigida pela LGPD.
            Usamos o e-mail apenas para enviar os conteúdos do {nome}. Você pode cancelar a inscrição
            a qualquer momento pelo link presente em cada e-mail.
          </p>
        </section>

        <section>
          <h2>Seus direitos</h2>
          <p>
            Você pode pedir acesso, correção ou exclusão dos seus dados
            {email ? (
              <>
                {' '}pelo e-mail <a href={`mailto:${email}`}>{email}</a>.
              </>
            ) : (
              <> pela página de contato.</>
            )}
          </p>
        </section>
      </div>
    </Moldura>
  );
}
