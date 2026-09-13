'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

/**
 * Inscricao na newsletter (secao 29).
 *
 * Este e um dos poucos componentes de cliente do portal: precisa de
 * estado para o retorno do envio. O resto das paginas e renderizado no
 * servidor e nao manda JavaScript ao leitor.
 */
export function Newsletter({
  titulo = 'Receba as análises do MAKUCHO',
  descricao = 'Um resumo diário do que move a economia, direto no seu e-mail.',
  origem = 'homepage',
}: {
  titulo?: string;
  descricao?: string;
  origem?: string;
}) {
  const [email, setEmail] = useState('');
  const [estado, setEstado] = useState<'parado' | 'enviando' | 'ok' | 'erro'>('parado');
  const [mensagem, setMensagem] = useState('');

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    if (estado === 'enviando') return;

    setEstado('enviando');
    try {
      const r = await api.inscreverNewsletter({
        email,
        consent: true,
        source: origem,
      });
      setEstado('ok');
      setMensagem(r.message);
      setEmail('');
    } catch (erro) {
      setEstado('erro');
      setMensagem(
        erro instanceof Error ? erro.message : 'Não foi possível concluir a inscrição.',
      );
    }
  }

  return (
    <section className="newsletter">
      <h2>{titulo}</h2>
      <p>{descricao}</p>

      {estado === 'ok' ? (
        <p role="status" style={{ fontWeight: 600 }}>
          {mensagem}
        </p>
      ) : (
        <form className="newsletter-form" onSubmit={enviar}>
          <label htmlFor="newsletter-email" className="so-leitor-de-tela">
            Seu e-mail
          </label>
          <input
            id="newsletter-email"
            type="email"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com.br"
            required
            autoComplete="email"
          />
          <button className="botao" type="submit" disabled={estado === 'enviando'}>
            {estado === 'enviando' ? 'Enviando…' : 'Quero receber'}
          </button>

          {estado === 'erro' && (
            <p role="alert" style={{ flexBasis: '100%', fontSize: '0.85rem' }}>
              {mensagem}
            </p>
          )}
        </form>
      )}

      <p style={{ marginTop: 14, fontSize: '0.78rem', opacity: 0.7 }}>
        Ao assinar você concorda em receber nossos e-mails. Pode cancelar quando quiser.
      </p>
    </section>
  );
}
