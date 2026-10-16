'use client';

// ============================================================
// Liga o diagnóstico remoto (lib/diagnostico.ts) e, quando ligado, mostra
// o código num selo pequeno no canto -- é o que a pessoa passa para o
// suporte achar os registros. Tocar no selo o recolhe (o registro segue).
// ============================================================

import { useEffect, useState } from 'react';
import { codigoDoDiagnostico, diagnosticoLigado, iniciarDiagnostico } from '../../lib/diagnostico';

let iniciado = false;

export function Diagnostico() {
  const [codigo, setCodigo] = useState<string | null>(null);
  const [recolhido, setRecolhido] = useState(false);
  useEffect(() => {
    if (!iniciado) {
      iniciado = true;
      iniciarDiagnostico();
    }
    if (diagnosticoLigado()) setCodigo(codigoDoDiagnostico());
  }, []);
  if (!codigo) return null;
  return (
    <button type="button" className="diagnostico" data-recolhido={recolhido || undefined} onClick={() => setRecolhido((r) => !r)} aria-label={`Diagnóstico ligado, código ${codigo}`}>
      {recolhido ? '●' : `Diagnóstico ligado · ${codigo}`}
    </button>
  );
}
