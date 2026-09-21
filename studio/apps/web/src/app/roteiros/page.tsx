'use client';

// ============================================================
// Script Studio (plano, secao 11.2).
//
// O roteiro reduz a necessidade de "salvar" um video mal
// estruturado na edicao. Por enquanto lista o que existe e abre o
// teleprompter; a criacao assistida por IA entra na Fase 5.
// ============================================================

import Link from 'next/link';

export default function RoteirosPage() {
  return (
    <main className="conteudo">
      <h1>Roteiros</h1>
      <p className="subtitulo">
        Planeje antes de gravar. Um roteiro com hook, problema e CTA rende um
        vídeo melhor do que tentar consertar tudo na edição.
      </p>

      <div className="vazio">
        <div className="vazio-icone">✎</div>
        <p style={{ fontSize: 14, marginBottom: 6 }}>Nenhum roteiro ainda</p>
        <p style={{ fontSize: 12, marginBottom: 20 }}>
          A geração assistida entra junto com a análise da IA.
        </p>
        <Link href="/teleprompter" className="botao">
          Ver o teleprompter
        </Link>
      </div>
    </main>
  );
}
