// ============================================================
// Página não encontrada.
//
// A padrão do Next aparece em inglês, com tipografia clara sobre
// fundo branco — fora do produto inteiro. Quem cai aqui já errou o
// caminho; não precisa também achar que mudou de aplicação.
// ============================================================

import Link from 'next/link';

export default function NaoEncontrada() {
  return (
    <div
      className="conteudo"
      style={{ display: 'grid', placeItems: 'center', alignContent: 'center' }}
    >
      <div style={{ maxWidth: 420, textAlign: 'center' }}>
        <p
          className="rotulo-secao"
          style={{ fontSize: 13, marginBottom: 'var(--e3)' }}
        >
          Erro 404
        </p>

        <h1 style={{ marginBottom: 'var(--e3)' }}>Esta página não existe</h1>

        <p
          className="texto-secundario"
          style={{ fontSize: 15, marginBottom: 'var(--e5)', lineHeight: 1.55 }}
        >
          O endereço pode ter mudado, ou o projeto que você procurava foi
          removido.
        </p>

        <Link href="/" className="botao">
          Voltar para Projetos
        </Link>
      </div>
    </div>
  );
}
