'use client';

// ============================================================
// Kit de marca (plano, seção 10).
//
// A identidade aplicada a todo vídeo: cores, fontes, logo, trilha.
// Junto vem o armazenamento, porque é aqui que ele importa: os
// materiais de apoio ocupam a cota permanente.
//
// O aviso de espaço aparece ANTES de qualquer perda: quem grava um
// vídeo novo precisa saber que os antigos cedem lugar, não descobrir
// depois que um sumiu.
// ============================================================

import { useEffect, useState } from 'react';
import { Topbar } from '../../components/shell/Topbar';
import { IconeAviso, IconeEnviar, IconeAudio } from '../../components/icones';

interface UsoDeCota {
  usadoBytes: number;
  quotaBytes: number;
  percentual: number;
  mensagem: string | null;
}

interface Armazenamento {
  permanente: UsoDeCota;
  edicao: UsoDeCota;
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
    <>
      <Topbar titulo={<strong style={{ fontSize: 15 }}>Marca</strong>} />

      <div className="conteudo">
        <h1 style={{ marginBottom: 'var(--e2)' }}>Kit de marca</h1>
        <p className="texto-secundario" style={{ fontSize: 15, marginBottom: 'var(--e6)' }}>
          Logo, cores, fontes e trilhas aplicadas a todos os seus vídeos.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: 'var(--e5)',
            alignItems: 'start',
          }}
        >
          {/* ---------- Identidade ---------- */}
          <section className="cartao">
            <h2 style={{ marginBottom: 'var(--e4)' }}>Identidade</h2>

            <div className="campo">
              <span className="campo__rotulo">Cores</span>
              <div className="linha" style={{ gap: 'var(--e2)' }}>
                {['#2f66ff', '#41c8ff', '#f7faff'].map((cor) => (
                  <span
                    key={cor}
                    title={cor}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 'var(--r-controle)',
                      background: cor,
                      border: '1px solid var(--border)',
                    }}
                  />
                ))}
              </div>
              <p className="campo__ajuda">
                Usadas em legendas, chamadas e elementos gráficos.
              </p>
            </div>

            <div className="campo">
              <span className="campo__rotulo">Logo</span>
              <button type="button" className="botao botao--secundario botao--largo">
                <IconeEnviar size={16} />
                Enviar arquivo
              </button>
              <p className="campo__ajuda">PNG com fundo transparente, a partir de 512px.</p>
            </div>

            <div className="campo">
              <span className="campo__rotulo">Trilha padrão</span>
              <button type="button" className="botao botao--secundario botao--largo">
                <IconeAudio size={16} />
                Escolher trilha
              </button>
              <p className="campo__ajuda">
                O volume se ajusta à sua voz automaticamente.
              </p>
            </div>
          </section>

          {/* ---------- Armazenamento ---------- */}
          <section className="cartao">
            <h2 style={{ marginBottom: 'var(--e4)' }}>Armazenamento</h2>

            {carregando && (
              <>
                <div className="esqueleto" style={{ height: 14, marginBottom: 'var(--e3)' }} />
                <div className="esqueleto" style={{ height: 14, width: '70%' }} />
              </>
            )}

            {!carregando && !uso && (
              <p className="texto-secundario">
                Entre na sua conta para ver o espaço usado.
              </p>
            )}

            {uso && (
              <>
                <BarraDeCota
                  rotulo="Materiais de apoio"
                  descricao="Logo, trilhas e imagens — guardados enquanto você quiser."
                  cota={uso.permanente}
                />
                <BarraDeCota
                  rotulo="Vídeos em edição"
                  descricao="Gravações e cortes dos projetos abertos."
                  cota={uso.edicao}
                />

                {uso.edicao.mensagem && (
                  <div className="aviso aviso--atencao" style={{ marginTop: 'var(--e4)' }}>
                    <IconeAviso size={16} />
                    <span>{uso.edicao.mensagem}</span>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

function BarraDeCota({
  rotulo,
  descricao,
  cota,
}: {
  rotulo: string;
  descricao: string;
  cota: UsoDeCota;
}) {
  // Cheio demais muda de cor E ganha texto: a seção 13 não aceita
  // estado transmitido só por cor.
  const apertado = cota.percentual >= 90;

  return (
    <div style={{ marginBottom: 'var(--e5)' }}>
      <div className="linha entre" style={{ fontSize: 13, marginBottom: 'var(--e1)' }}>
        <span>{rotulo}</span>
        <span
          className="texto-secundario"
          style={{
            fontVariantNumeric: 'tabular-nums',
            color: apertado ? 'var(--danger)' : undefined,
          }}
        >
          {gb(cota.usadoBytes)} / {gb(cota.quotaBytes)} GB
        </span>
      </div>

      <div
        className="barra"
        role="progressbar"
        aria-valuenow={Math.round(cota.percentual)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${rotulo}: ${Math.round(cota.percentual)}% usado`}
      >
        <div
          className="barra__preenchida"
          style={{
            width: `${Math.min(100, cota.percentual)}%`,
            background: apertado ? 'var(--danger)' : undefined,
          }}
        />
      </div>

      <p className="campo__ajuda">{descricao}</p>
    </div>
  );
}
