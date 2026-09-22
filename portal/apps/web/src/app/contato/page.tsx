import type { Metadata } from 'next';
import { api } from '@/lib/api';
import { Moldura } from '@/components/moldura';

export const metadata: Metadata = {
  title: 'Contato',
  description: 'Entre em contato com a equipe do MAKUCHO.',
};
export const dynamic = 'force-dynamic';
export const revalidate = 3600;

export default async function Contato() {
  const dados = await api.homepage();
  const email = String(dados.settings['site.email'] ?? '').trim();

  return (
    <Moldura>
      <div className="portal-institucional">
        <span className="hub-eyebrow">Contato</span>
        <h1>Converse com o MAKUCHO</h1>
        <p className="portal-institucional-lead">Dúvidas, sugestões e propostas editoriais podem ser enviadas diretamente para nossa equipe.</p>
        {email ? (
          <a className="hub-primary" href={`mailto:${email}`}>Enviar e-mail para {email}</a>
        ) : (
          <p>O canal de contato será informado aqui assim que estiver disponível.</p>
        )}
      </div>
    </Moldura>
  );
}
