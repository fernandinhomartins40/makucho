// ============================================================
// O relógio da prévia, fora do React.
//
// Enquanto o vídeo toca, a posição muda a cada quadro. Passar isso pelo
// estado do editor re-renderizava a página inteira (timeline, painéis,
// película) várias vezes por segundo, e era isso que travava o vídeo.
// O jeito dos editores na web: quem precisa da posição a cada quadro (o
// cursor da timeline, o tempo, a rolagem) OUVE este relógio e mexe no
// DOM direto -- transform, textContent --, e o React só recebe a posição
// de vez em quando.
// ============================================================

type Ouvinte = (ms: number) => void;

const ouvintes = new Set<Ouvinte>();

/** O Palco publica a posição a cada quadro enquanto toca. */
export function publicarPosicao(ms: number): void {
  ouvintes.forEach((f) => f(ms));
}

/** Ouve a posição ao vivo; devolve a função que para de ouvir. */
export function ouvirPosicao(f: Ouvinte): () => void {
  ouvintes.add(f);
  return () => {
    ouvintes.delete(f);
  };
}
