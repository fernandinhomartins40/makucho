'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { LogoM } from '@/components/icones';

/**
 * Inscricao na newsletter (secao 29).
 *
 * Um dos poucos componentes de cliente do portal: precisa de estado
 * para o retorno do envio. O resto das paginas e renderizado no
 * servidor e nao manda JavaScript ao leitor.
 *
 * Duas apresentacoes, como no layout: o bloco azul da coluna do hero
 * (variante "lateral") e a faixa de largura total antes do rodape.
 */
export function Newsletter({
  variante = 'faixa',
  titulo,
  descricao,
  origem = 'homepage',
}: {
  variante?: 'lateral' | 'faixa';
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
      const r = await api.inscreverNewsletter({ email, consent: true, source: origem });
      setEstado('ok');
      setMensagem(r.message);
      setEmail('');
    } catch (erro) {
      setEstado('erro');
      setMensagem(erro instanceof Error ? erro.message : 'Não foi possível concluir a inscrição.');
    }
  }

  const campo = (
    <>
      <label htmlFor={`news-${variante}`} className="so-leitor-de-tela">
        Seu e-mail
      </label>
      <input
        id={`news-${variante}`}
        className={variante === 'lateral' ? 'news-campo' : undefined}
        type="email"
        name="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Seu melhor e-mail"
        required
        autoComplete="email"
      />
    </>
  );

  if (variante === 'lateral') {
    return (
      <aside className="news-lateral">
        <h2>{titulo ?? 'Economia sem complicação'}</h2>
        <p>{descricao ?? 'Análises, insights e conteúdos exclusivos no seu e-mail.'}</p>

        {estado === 'ok' ? (
          <p role="status" style={{ fontWeight: 600, fontSize: '0.85rem' }}>
            {mensagem}
          </p>
        ) : (
          <form onSubmit={enviar}>
            {campo}
            <button className="botao-azul" type="submit" disabled={estado === 'enviando'}>
              {estado === 'enviando' ? 'Enviando…' : 'Quero receber'}
            </button>
            {estado === 'erro' && (
              <p role="alert" style={{ marginTop: 8, fontSize: '0.76rem' }}>
                {mensagem}
              </p>
            )}
          </form>
        )}

        <div className="news-marca">
          <LogoM size={46} />
          <strong>MAKUCHO</strong>
          <span>Conhecimento que gera liberdade</span>
        </div>
      </aside>
    );
  }

  return (
    <section className="news-faixa" id="newsletter">
      <div className="news-faixa-marca">
        <LogoM size={44} />
        <div>
          <h2>{titulo ?? 'Economia sem complicação, direto no seu e-mail.'}</h2>
          <p>
            {descricao ??
              'Receba análises, conteúdos exclusivos, novidades e os principais destaques da semana.'}
          </p>
        </div>
      </div>

      {estado === 'ok' ? (
        <p role="status" style={{ fontWeight: 600, flex: '1 1 380px' }}>
          {mensagem}
        </p>
      ) : (
        <form className="news-faixa-form" onSubmit={enviar}>
          {campo}
          <button className="botao-azul" type="submit" disabled={estado === 'enviando'}>
            {estado === 'enviando' ? 'Enviando…' : 'Quero receber'}
          </button>
          {estado === 'erro' && (
            <p role="alert" style={{ flexBasis: '100%', fontSize: '0.78rem' }}>
              {mensagem}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
