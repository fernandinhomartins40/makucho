'use client';

// ============================================================
// Ajuda.
//
// Perguntas que vieram do uso real, não uma base de conhecimento
// genérica. A primeira é sobre apagar vídeos porque é a que mais
// assusta: a cota de 10 GB descarta gravações antigas, e quem não
// entende isso perde trabalho sem saber por quê.
// ============================================================

import Link from 'next/link';
import { Topbar } from '../../components/shell/Topbar';
import { IconeAjuda, IconeAvancar } from '../../components/icones';

const PERGUNTAS = [
  {
    titulo: 'Por que um vídeo antigo sumiu?',
    resposta:
      'O espaço de vídeos em edição tem 6 GB. Quando enche, as gravações mais antigas cedem lugar às novas — o aviso aparece em Marca antes de isso acontecer. Materiais do kit de marca ficam nos 4 GB permanentes e nunca são descartados.',
  },
  {
    titulo: 'A IA pode mudar o que eu falei?',
    resposta:
      'Não. Todo trecho do resultado aponta para um pedaço da sua gravação, com o minuto exato de origem visível no editor. A IA escolhe o que entra e o que sai, nunca inventa fala.',
  },
  {
    titulo: 'Como eu discordo de um corte?',
    resposta:
      'Cada trecho no painel da IA traz o motivo da escolha. Você pode desligar, encurtar, reordenar ou dividir qualquer um. A proposta chega pronta, mas não é imposta.',
  },
  {
    titulo: 'Preciso gravar com o roteiro na tela?',
    resposta:
      'Não é obrigatório, mas ajuda. O teleprompter mostra a intenção de cada bloco — hook, problema, autoridade, CTA — e é isso que a IA usa depois para montar o vídeo.',
  },
  {
    titulo: 'Por que o vídeo é vertical?',
    resposta:
      'O formato de saída é 1080 × 1920 (9:16), o de Reels, TikTok e Shorts. As linhas tracejadas no preview marcam a área que sobrevive à interface dessas plataformas.',
  },
];

export default function AjudaPage() {
  return (
    <>
      <Topbar titulo={<strong style={{ fontSize: 15 }}>Ajuda</strong>} />

      <div className="conteudo">
        <h1 style={{ marginBottom: 'var(--e2)' }}>Ajuda</h1>
        <p className="texto-secundario" style={{ fontSize: 15, marginBottom: 'var(--e6)' }}>
          As dúvidas que mais aparecem, respondidas sem rodeio.
        </p>

        <div className="pilha" style={{ maxWidth: 760, marginBottom: 'var(--e6)' }}>
          {PERGUNTAS.map((item) => (
            <details key={item.titulo} className="cartao">
              <summary
                style={{
                  cursor: 'pointer',
                  fontSize: 15,
                  fontWeight: 600,
                  listStyle: 'none',
                }}
              >
                {item.titulo}
              </summary>
              <p
                className="texto-secundario"
                style={{ marginTop: 'var(--e3)', lineHeight: 1.55 }}
              >
                {item.resposta}
              </p>
            </details>
          ))}
        </div>

        <div className="cartao vazio" style={{ maxWidth: 760 }}>
          <div className="vazio__icone">
            <IconeAjuda size={26} />
          </div>
          <div>
            <h3 style={{ marginBottom: 4 }}>Não achou o que procurava?</h3>
            <p className="texto-secundario" style={{ marginBottom: 'var(--e4)' }}>
              Comece um vídeo e veja o fluxo inteiro — costuma responder mais que
              a documentação.
            </p>
            <Link href="/roteiros" className="botao">
              Começar pelo roteiro
              <IconeAvancar size={15} />
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
