'use client';

// ============================================================
// Barra superior.
//
// Carrega o contexto (onde estou), o estado do documento (salvo,
// processando) e a ação principal da tela.
//
// O guia pede que o estado do sistema esteja sempre visível. Num
// produto que salva sozinho, a diferença entre "salvo" e "salvando"
// é a diferença entre fechar a aba tranquilo e perder trabalho.
// ============================================================

import Link from 'next/link';
import { IconeBusca, IconeSalvo, IconeSalvando, IconeAviso } from '../icones';

export type EstadoDoDocumento = 'salvo' | 'salvando' | 'erro' | 'nenhum';

interface Props {
  titulo?: React.ReactNode;
  /** Caminho acima do título: "Projetos / Atendimento no WhatsApp". */
  trilha?: string[];
  estado?: EstadoDoDocumento;
  /** Estado da tela, quando não é de documento: "Pronto para gravar". */
  selo?: { texto: string; tom: 'sucesso' | 'info' | 'aviso' | 'neutro' };
  busca?: boolean;
  onBuscar?: (termo: string) => void;
  children?: React.ReactNode;
}

export function Topbar({
  titulo,
  trilha,
  estado = 'nenhum',
  selo,
  busca,
  onBuscar,
  children,
}: Props) {
  return (
    <header className="topbar">
      {/* No celular a sidebar some; a marca vem para cá quando a tela
          não tem título próprio. */}
      {!titulo && !trilha && (
        <Link href="/" className="sidebar__logo so-celular topbar__marca" aria-label="MAKUCHO Studio — início">
          <span className="sidebar__sigla" aria-hidden style={{ width: 32, height: 32, fontSize: 17 }}>
            M
          </span>
          <span className="sidebar__nome" style={{ fontSize: 16 }}>
            Studio
          </span>
        </Link>
      )}
      {trilha && trilha.length > 0 && (
        <nav aria-label="Caminho" className="topbar__trilha" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {trilha.map((parte, i) => (
            <span key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {i > 0 && (
                <span aria-hidden style={{ color: 'var(--text-secondary)' }}>
                  /
                </span>
              )}
              <span
                style={{
                  fontSize: 14,
                  color:
                    i === trilha.length - 1 ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontWeight: i === trilha.length - 1 ? 600 : 400,
                }}
              >
                {parte}
              </span>
            </span>
          ))}
        </nav>
      )}

      {titulo && <div style={{ minWidth: 0 }}>{titulo}</div>}

      {estado !== 'nenhum' && <EstadoDeSalvamento estado={estado} />}

      {selo && (
        <span className={`selo selo--${selo.tom}`}>
          <span className="selo__ponto" aria-hidden />
          {selo.texto}
        </span>
      )}

      {busca && (
        <div className="crescer topbar__busca">
          <label style={{ position: 'relative', display: 'block' }}>
            <span
              aria-hidden
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-secondary)',
                pointerEvents: 'none',
                display: 'flex',
              }}
            >
              <IconeBusca size={18} />
            </span>
            <input
              type="search"
              className="campo__entrada"
              placeholder="Buscar projetos, vídeos ou temas…"
              aria-label="Buscar"
              onChange={(e) => onBuscar?.(e.target.value)}
              style={{ paddingLeft: 40, fontSize: 14, minHeight: 40 }}
            />
          </label>
        </div>
      )}

      <div className="linha auto topbar__acoes" style={{ gap: 'var(--e2)' }}>
        {children}
      </div>
    </header>
  );
}

/**
 * Indicador de salvamento automático.
 *
 * Cada estado tem ÍCONE e TEXTO, não só cor: quem não distingue
 * verde de cinza continua sabendo se o trabalho está seguro.
 */
function EstadoDeSalvamento({
  estado,
}: {
  estado: Exclude<EstadoDoDocumento, 'nenhum'>;
}) {
  const mapa = {
    salvo: { texto: 'Salvo', tom: 'sucesso', Icone: IconeSalvo },
    salvando: { texto: 'Salvando…', tom: 'info', Icone: IconeSalvando },
    erro: { texto: 'Falha ao salvar', tom: 'aviso', Icone: IconeAviso },
  } as const;

  const { texto, tom, Icone } = mapa[estado];

  return (
    <span className={`selo selo--${tom}`} role="status" aria-live="polite">
      <Icone size={13} />
      {texto}
    </span>
  );
}
