'use client';

// ============================================================
// Brand Studio (plano, secao 10).
//
// A identidade aplicada a todo video: cores, fontes, logo, trilha.
// As rotas da API ja existem; esta tela consome as cores e o
// armazenamento.
// ============================================================

import { useEffect, useState } from 'react';

interface Armazenamento {
  permanente: { usadoBytes: number; quotaBytes: number; percentual: number; mensagem: string | null };
  edicao: { usadoBytes: number; quotaBytes: number; percentual: number; mensagem: string | null };
}

const gb = (bytes: number) => (bytes / 1024 ** 3).toFixed(1).replace('.', ',');

export default function MarcaPage() {
  const [uso, setUso] = useState<Armazenamento | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    fetch('/api/settings/storage', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then(setUso)
      .catch(() => undefined)
      .finally(() => setCarregando(false));
  }, []);

  return (
    <main className="conteudo">
      <h1>Marca</h1>
      <p className="subtitulo">
        Logo, cores, fontes e trilhas aplicadas a todos os seus vídeos.
      </p>

      <div className="cartao">
        <h2 style={{ fontSize: 14 }}>Armazenamento</h2>

        {carregando && (
          <p style={{ fontSize: 12, color: 'var(--texto-suave)' }}>carregando…</p>
        )}

        {!carregando && !uso && (
          <p style={{ fontSize: 12, color: 'var(--texto-suave)' }}>
            Entre na sua conta para ver o espaço usado.
          </p>
        )}

        {uso && (
          <>
            <div style={{ marginBottom: 14 }}>
              <div className="linha entre" style={{ fontSize: 12, marginBottom: 5 }}>
                <span>Materiais de apoio</span>
                <span style={{ color: 'var(--texto-suave)' }}>
                  {gb(uso.permanente.usadoBytes)} / {gb(uso.permanente.quotaBytes)} GB
                </span>
              </div>
              <div className="barra">
                <div
                  className="barra-preenchida"
                  style={{ width: `${Math.min(100, uso.permanente.percentual)}%` }}
                />
              </div>
            </div>

            <div>
              <div className="linha entre" style={{ fontSize: 12, marginBottom: 5 }}>
                <span>Vídeos em edição</span>
                <span style={{ color: 'var(--texto-suave)' }}>
                  {gb(uso.edicao.usadoBytes)} / {gb(uso.edicao.quotaBytes)} GB
                </span>
              </div>
              <div className="barra">
                <div
                  className="barra-preenchida"
                  style={{
                    width: `${Math.min(100, uso.edicao.percentual)}%`,
                    background:
                      uso.edicao.percentual >= 90 ? 'var(--vermelho)' : undefined,
                  }}
                />
              </div>
            </div>

            {/* O aviso explica que os antigos cedem lugar aos novos --
                antes de qualquer perda acontecer. */}
            {uso.edicao.mensagem && (
              <div className="aviso aviso-atencao" style={{ marginTop: 14, marginBottom: 0 }}>
                {uso.edicao.mensagem}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
