'use client';

import { useEffect, useId, useRef, useState } from 'react';

// ============================================================
// CAMPOS
// ============================================================

interface CampoProps {
  rotulo: string;
  erro?: string;
  dica?: string;
  obrigatorio?: boolean;
  children: React.ReactNode;
}

export function Campo({ rotulo, erro, dica, obrigatorio, children }: CampoProps) {
  return (
    <label className="pn-campo">
      <span className="pn-rotulo">
        {rotulo}
        {obrigatorio && <i aria-hidden="true"> *</i>}
      </span>
      {children}
      {dica && !erro && <small className="pn-dica">{dica}</small>}
      {erro && <small className="pn-erro">{erro}</small>}
    </label>
  );
}

export function Entrada(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`pn-entrada ${props.className ?? ''}`} />;
}

export function AreaTexto(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`pn-entrada pn-area ${props.className ?? ''}`} />;
}

export function Selecao(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`pn-entrada pn-selecao ${props.className ?? ''}`} />;
}

export function Alternador({
  marcado,
  aoMudar,
  rotulo,
  descricao,
}: {
  marcado: boolean;
  aoMudar: (v: boolean) => void;
  rotulo: string;
  descricao?: string;
}) {
  return (
    <label className="pn-alternador">
      <input
        type="checkbox"
        checked={marcado}
        onChange={(e) => aoMudar(e.target.checked)}
        role="switch"
      />
      <span className="pn-alternador-pista" aria-hidden="true" />
      <span>
        <strong>{rotulo}</strong>
        {descricao && <small>{descricao}</small>}
      </span>
    </label>
  );
}

// ============================================================
// BOTOES
// ============================================================

type Variante = 'primario' | 'neutro' | 'perigo' | 'fantasma';

export function Botao({
  variante = 'neutro',
  carregando,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: Variante;
  carregando?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || carregando}
      className={`pn-botao pn-botao-${variante} ${props.className ?? ''}`}
    >
      {carregando && <span className="pn-girando" aria-hidden="true" />}
      {children}
    </button>
  );
}

// ============================================================
// AVISOS
// ============================================================

export function Aviso({
  tipo = 'info',
  children,
}: {
  tipo?: 'info' | 'erro' | 'ok';
  children: React.ReactNode;
}) {
  if (!children) return null;
  return (
    <div className={`pn-aviso pn-aviso-${tipo}`} role={tipo === 'erro' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

export function Etiqueta({ texto, cor }: { texto: string; cor?: string }) {
  return (
    <span className="pn-selo" style={cor ? { background: cor } : undefined}>
      {texto}
    </span>
  );
}

/** Cor por status editorial, para a lista ficar legivel de relance. */
export function SeloStatus({ status }: { status: string }) {
  const mapa: Record<string, { texto: string; cor: string }> = {
    DRAFT: { texto: 'Rascunho', cor: '#94a3b8' },
    REVIEW: { texto: 'Em revisão', cor: '#f59e0b' },
    SCHEDULED: { texto: 'Agendado', cor: '#8b5cf6' },
    PUBLISHED: { texto: 'Publicado', cor: '#16a34a' },
    ARCHIVED: { texto: 'Arquivado', cor: '#64748b' },
    ACTIVE: { texto: 'Ativo', cor: '#16a34a' },
    PAUSED: { texto: 'Pausado', cor: '#f59e0b' },
    EXPIRED: { texto: 'Expirado', cor: '#64748b' },
    CONFIRMED: { texto: 'Confirmado', cor: '#16a34a' },
    PENDING: { texto: 'Pendente', cor: '#f59e0b' },
    UNSUBSCRIBED: { texto: 'Cancelado', cor: '#64748b' },
    SUSPENDED: { texto: 'Suspenso', cor: '#dc2626' },
    BLOCKED: { texto: 'Bloqueado', cor: '#dc2626' },
  };
  const item = mapa[status] ?? { texto: status, cor: '#94a3b8' };
  return <Etiqueta texto={item.texto} cor={item.cor} />;
}

// ============================================================
// MODAL
// ============================================================

export function Modal({
  titulo,
  aberto,
  aoFechar,
  largura = 560,
  children,
  rodape,
}: {
  titulo: string;
  aberto: boolean;
  aoFechar: () => void;
  largura?: number;
  children: React.ReactNode;
  rodape?: React.ReactNode;
}) {
  const tituloId = useId();
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;

    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar();
    };
    document.addEventListener('keydown', aoTeclar);

    // Sem isto a pagina atras rola junto com o modal.
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    caixa.current?.focus();

    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.body.style.overflow = anterior;
    };
  }, [aberto, aoFechar]);

  if (!aberto) return null;

  return (
    <div className="pn-veu" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <div
        ref={caixa}
        className="pn-modal"
        style={{ maxWidth: largura }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        tabIndex={-1}
      >
        <header className="pn-modal-topo">
          <h2 id={tituloId}>{titulo}</h2>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="pn-fechar">
            ×
          </button>
        </header>
        <div className="pn-modal-corpo">{children}</div>
        {rodape && <footer className="pn-modal-rodape">{rodape}</footer>}
      </div>
    </div>
  );
}

/** Confirmacao para acoes destrutivas; nunca excluimos sem passar por aqui. */
export function Confirmacao({
  aberto,
  titulo,
  mensagem,
  rotuloConfirmar = 'Excluir',
  aoConfirmar,
  aoCancelar,
}: {
  aberto: boolean;
  titulo: string;
  mensagem: string;
  rotuloConfirmar?: string;
  aoConfirmar: () => void | Promise<void>;
  aoCancelar: () => void;
}) {
  const [processando, setProcessando] = useState(false);

  return (
    <Modal
      titulo={titulo}
      aberto={aberto}
      aoFechar={aoCancelar}
      largura={420}
      rodape={
        <>
          <Botao variante="fantasma" onClick={aoCancelar}>
            Cancelar
          </Botao>
          <Botao
            variante="perigo"
            carregando={processando}
            onClick={async () => {
              setProcessando(true);
              try {
                await aoConfirmar();
              } finally {
                setProcessando(false);
              }
            }}
          >
            {rotuloConfirmar}
          </Botao>
        </>
      }
    >
      <p style={{ margin: 0, lineHeight: 1.55 }}>{mensagem}</p>
    </Modal>
  );
}

// ============================================================
// LISTAS
// ============================================================

export function Vazio({ titulo, descricao, acao }: { titulo: string; descricao?: string; acao?: React.ReactNode }) {
  return (
    <div className="pn-vazio">
      <strong>{titulo}</strong>
      {descricao && <p>{descricao}</p>}
      {acao}
    </div>
  );
}

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return (
    <div className="pn-carregando" role="status">
      <span className="pn-girando" aria-hidden="true" />
      {texto}
    </div>
  );
}

export function Paginacao({
  pagina,
  totalPaginas,
  aoMudar,
}: {
  pagina: number;
  totalPaginas: number;
  aoMudar: (p: number) => void;
}) {
  if (totalPaginas <= 1) return null;

  return (
    <nav className="pn-paginacao" aria-label="Paginação">
      <Botao variante="fantasma" disabled={pagina <= 1} onClick={() => aoMudar(pagina - 1)}>
        ← Anterior
      </Botao>
      <span>
        Página {pagina} de {totalPaginas}
      </span>
      <Botao
        variante="fantasma"
        disabled={pagina >= totalPaginas}
        onClick={() => aoMudar(pagina + 1)}
      >
        Próxima →
      </Botao>
    </nav>
  );
}

// ============================================================
// AVISOS FLUTUANTES
// ============================================================

export function useRecado() {
  const [recado, setRecado] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  useEffect(() => {
    if (!recado) return;
    const t = setTimeout(() => setRecado(null), 4000);
    return () => clearTimeout(t);
  }, [recado]);

  const elemento = recado ? (
    <div className={`pn-recado pn-recado-${recado.tipo}`} role="status">
      {recado.texto}
    </div>
  ) : null;

  return {
    elemento,
    ok: (texto: string) => setRecado({ tipo: 'ok', texto }),
    erro: (texto: string) => setRecado({ tipo: 'erro', texto }),
  };
}
