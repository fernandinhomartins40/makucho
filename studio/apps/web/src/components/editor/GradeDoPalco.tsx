'use client';

// ============================================================
// As zonas seguras no palco: a grade do layout do instante (a da
// animação que está passando, ou a da tela cheia sem animação). Área
// útil em verde, faixa da legenda em amarelo, reservas em vermelho --
// a mesma grade que a IA recebe e que a conferência usa.
// ============================================================

import { gradeDaComposicao, QUADRO_DA_GRADE, type EditPlanV1, type Retangulo } from '@makucho/studio-contracts';

const pct = (r: Retangulo) => ({
  left: `${(r.x / QUADRO_DA_GRADE.w) * 100}%`,
  top: `${(r.y / QUADRO_DA_GRADE.h) * 100}%`,
  width: `${(r.w / QUADRO_DA_GRADE.w) * 100}%`,
  height: `${(r.h / QUADRO_DA_GRADE.h) * 100}%`,
});

export function GradeDoPalco({ plan, ms }: { plan: EditPlanV1; ms: number }) {
  let comp: Parameters<typeof gradeDaComposicao>[0] = { layout: 'tela_cheia' };
  let comAnimacao = false;
  for (const c of plan.mediaLayers ?? []) {
    if (ms < c.timelineStartMs || ms >= c.timelineStartMs + c.durationMs) continue;
    const x = c.kind === 'html' ? c.composicao : c.kind === 'cena' ? c.cena : undefined;
    if (x) {
      comp = x;
      comAnimacao = true;
    }
  }
  const g = gradeDaComposicao(comp);
  return (
    <div className="palco__grade" aria-hidden data-com-animacao={comAnimacao || undefined}>
      {g.reservadas
        .filter((r) => r.nome !== 'legenda do vídeo')
        .map((r) => (
          <span key={r.nome} className="palco__grade-reservada" style={pct(r.r)}>
            <i>{r.nome}</i>
          </span>
        ))}
      <span className="palco__grade-legenda" style={pct(g.legenda)}>
        <i>legenda</i>
      </span>
      {comAnimacao && (
        <span className="palco__grade-util" style={pct(g.util)}>
          <i>área útil</i>
        </span>
      )}
      {comAnimacao && g.utilExtra && <span className="palco__grade-util palco__grade-util--extra" style={pct(g.utilExtra)} />}
    </div>
  );
}
