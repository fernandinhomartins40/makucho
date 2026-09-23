'use client';

import { useState } from 'react';
import Image from 'next/image';
import { api } from '@/lib/api';
import { Cadeado } from '@/components/icones';

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
  const [consentiu, setConsentiu] = useState(false);
  const [estado, setEstado] = useState<'parado' | 'enviando' | 'ok' | 'erro'>('parado');
  const [mensagem, setMensagem] = useState('');

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    if (estado === 'enviando' || !consentiu) return;

    setEstado('enviando');
    try {
      const r = await api.inscreverNewsletter({ email, consent: consentiu, source: origem });
      setEstado('ok');
      setMensagem(r.message);
      setEmail('');
      setConsentiu(false);
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
  const consentimento = (
    <label className="news-consentimento">
      <input
        type="checkbox"
        name="consentimento"
        checked={consentiu}
        onChange={(evento) => setConsentiu(evento.target.checked)}
        required
      />
      <span>Quero receber os e-mails do MAKUCHO. Posso cancelar a inscrição a qualquer momento.</span>
    </label>
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
            {consentimento}
            {estado === 'erro' && (
              <p role="alert" style={{ marginTop: 8, fontSize: '0.76rem' }}>
                {mensagem}
              </p>
            )}
          </form>
        )}

        <div className="news-marca">
          <Image src="/brand/makucho-logo-horizontal-dark-bg.webp" alt="MAKUCHO" width={1262} height={220} className="marca-imagem" />
          <span>Conhecimento que gera liberdade</span>
        </div>
      </aside>
    );
  }

  return (
    <section className="news-faixa" id="newsletter" aria-labelledby="newsletter-titulo">
      <div className="news-faixa-texto">
        <span className="news-faixa-rotulo">Newsletter MAKUCHO</span>
        <h2 id="newsletter-titulo">{titulo ?? 'Receba a análise que importa'}</h2>
        <p>{descricao ?? 'Conteúdo exclusivo, direto no seu e-mail. Sem ruído, sem complicação.'}</p>
      </div>

      {estado === 'ok' ? (
        <p role="status" className="news-faixa-ok">
          {mensagem}
        </p>
      ) : (
        <form className="news-faixa-form" onSubmit={enviar}>
          <div className="news-faixa-linha">
            {campo}
            <button className="botao-azul" type="submit" disabled={estado === 'enviando'}>
              {estado === 'enviando' ? 'Enviando…' : 'Quero acompanhar'}
            </button>
          </div>
          <label className="news-consentimento">
            <input
              type="checkbox"
              name="consentimento"
              checked={consentiu}
              onChange={(evento) => setConsentiu(evento.target.checked)}
              required
            />
            <Cadeado size={13} />
            <span>Quero receber os e-mails do MAKUCHO. Sem spam. Você pode cancelar quando quiser.</span>
          </label>
          {estado === 'erro' && (
            <p role="alert" className="news-faixa-erro">
              {mensagem}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
