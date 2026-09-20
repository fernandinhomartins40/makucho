'use client';

import { useCallback, useEffect, useState } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import type { MediaDto } from '@makucho/types';
import { SeletorMidia } from '@/components/painel/seletor-midia';
import { Botao, Campo, Entrada, Modal } from '@/components/painel/ui';

/** Botão da barra; `ativo` reflete a marca sob o cursor. */
function Ferramenta({
  aoClicar,
  ativo,
  titulo,
  children,
  desabilitado,
}: {
  aoClicar: () => void;
  ativo?: boolean;
  titulo: string;
  children: React.ReactNode;
  desabilitado?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      className={`pn-ed-btn ${ativo ? 'pn-ed-ativo' : ''}`}
      title={titulo}
      aria-label={titulo}
      aria-pressed={ativo}
      disabled={desabilitado}
    >
      {children}
    </button>
  );
}

function Barra({ editor }: { editor: Editor }) {
  const [linkAberto, setLinkAberto] = useState(false);
  const [urlLink, setUrlLink] = useState('');
  const [midiaAberta, setMidiaAberta] = useState(false);

  const abrirLink = useCallback(() => {
    setUrlLink(editor.getAttributes('link').href ?? '');
    setLinkAberto(true);
  }, [editor]);

  const aplicarLink = useCallback(() => {
    const url = urlLink.trim();

    if (!url) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      // Sem protocolo o navegador trataria como caminho relativo.
      const completa = /^https?:\/\//i.test(url) ? url : `https://${url}`;
      editor.chain().focus().extendMarkRange('link').setLink({ href: completa }).run();
    }
    setLinkAberto(false);
  }, [editor, urlLink]);

  const inserirImagem = useCallback(
    (m: MediaDto) => {
      const variante =
        m.variants?.find((v) => v.type === 'MEDIUM' && v.format === 'webp') ??
        m.variants?.find((v) => v.type === 'MEDIUM');

      editor
        .chain()
        .focus()
        .setImage({ src: variante?.url ?? m.url, alt: m.alt ?? '' })
        .run();
      setMidiaAberta(false);
    },
    [editor],
  );

  return (
    <>
      <div className="pn-ed-barra" role="toolbar" aria-label="Formatação">
        <Ferramenta
          aoClicar={() => editor.chain().focus().toggleBold().run()}
          ativo={editor.isActive('bold')}
          titulo="Negrito"
        >
          <b>B</b>
        </Ferramenta>
        <Ferramenta
          aoClicar={() => editor.chain().focus().toggleItalic().run()}
          ativo={editor.isActive('italic')}
          titulo="Itálico"
        >
          <i>I</i>
        </Ferramenta>
        <Ferramenta
          aoClicar={() => editor.chain().focus().toggleStrike().run()}
          ativo={editor.isActive('strike')}
          titulo="Riscado"
        >
          <s>S</s>
        </Ferramenta>

        <span className="pn-ed-sep" />

        {([2, 3, 4] as const).map((n) => (
          <Ferramenta
            key={n}
            aoClicar={() => editor.chain().focus().toggleHeading({ level: n }).run()}
            ativo={editor.isActive('heading', { level: n })}
            titulo={`Título ${n}`}
          >
            H{n}
          </Ferramenta>
        ))}

        <span className="pn-ed-sep" />

        <Ferramenta
          aoClicar={() => editor.chain().focus().toggleBulletList().run()}
          ativo={editor.isActive('bulletList')}
          titulo="Lista com marcadores"
        >
          ••
        </Ferramenta>
        <Ferramenta
          aoClicar={() => editor.chain().focus().toggleOrderedList().run()}
          ativo={editor.isActive('orderedList')}
          titulo="Lista numerada"
        >
          1.
        </Ferramenta>
        <Ferramenta
          aoClicar={() => editor.chain().focus().toggleBlockquote().run()}
          ativo={editor.isActive('blockquote')}
          titulo="Citação"
        >
          ❝
        </Ferramenta>
        <Ferramenta
          aoClicar={() => editor.chain().focus().setHorizontalRule().run()}
          titulo="Linha divisória"
        >
          —
        </Ferramenta>

        <span className="pn-ed-sep" />

        <Ferramenta aoClicar={abrirLink} ativo={editor.isActive('link')} titulo="Link">
          🔗
        </Ferramenta>
        <Ferramenta aoClicar={() => setMidiaAberta(true)} titulo="Inserir imagem">
          🖼
        </Ferramenta>

        <span className="pn-ed-sep" />

        <Ferramenta
          aoClicar={() => editor.chain().focus().undo().run()}
          titulo="Desfazer"
          desabilitado={!editor.can().undo()}
        >
          ↶
        </Ferramenta>
        <Ferramenta
          aoClicar={() => editor.chain().focus().redo().run()}
          titulo="Refazer"
          desabilitado={!editor.can().redo()}
        >
          ↷
        </Ferramenta>
      </div>

      <Modal
        titulo="Inserir link"
        aberto={linkAberto}
        aoFechar={() => setLinkAberto(false)}
        largura={420}
        rodape={
          <>
            <Botao variante="fantasma" onClick={() => setLinkAberto(false)}>
              Cancelar
            </Botao>
            <Botao variante="primario" onClick={aplicarLink}>
              Aplicar
            </Botao>
          </>
        }
      >
        <Campo rotulo="Endereço" dica="Deixe vazio para remover o link do texto selecionado.">
          <Entrada
            value={urlLink}
            onChange={(e) => setUrlLink(e.target.value)}
            placeholder="https://exemplo.com.br/pagina"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                aplicarLink();
              }
            }}
          />
        </Campo>
      </Modal>

      <SeletorMidia
        aberto={midiaAberta}
        aoFechar={() => setMidiaAberta(false)}
        aoEscolher={inserirImagem}
      />
    </>
  );
}

export function EditorConteudo({
  valor,
  aoMudar,
}: {
  /** Documento do TipTap vindo da API. */
  valor: unknown;
  aoMudar: (doc: unknown, texto: string) => void;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] } }),
      Link.configure({
        openOnClick: false,
        // O backend sanitiza de novo; isto so evita gravar lixo obvio.
        protocols: ['http', 'https', 'mailto'],
        HTMLAttributes: { rel: 'noopener noreferrer' },
      }),
      Image.configure({ HTMLAttributes: { loading: 'lazy' } }),
      Placeholder.configure({ placeholder: 'Escreva a matéria…' }),
    ],
    content: (valor as never) ?? '',
    // Sem isto o React 18 reclama de hidratacao no App Router.
    immediatelyRender: false,
    editorProps: {
      attributes: { class: 'pn-ed-area artigo-conteudo' },
    },
    onUpdate: ({ editor: ed }) => aoMudar(ed.getJSON(), ed.getText()),
  });

  // Ao trocar de post o conteudo precisa ser recarregado no editor.
  useEffect(() => {
    if (!editor || valor === undefined) return;
    const atual = JSON.stringify(editor.getJSON());
    if (atual !== JSON.stringify(valor)) {
      editor.commands.setContent((valor as never) ?? '', false);
    }
    // Só reagimos à troca de documento, não a cada tecla digitada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, JSON.stringify(valor ?? null)]);

  if (!editor) return <div className="pn-ed pn-ed-vazio">Carregando o editor…</div>;

  const palavras = editor.getText().trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="pn-ed">
      <Barra editor={editor} />
      <EditorContent editor={editor} />
      <footer className="pn-ed-pe">
        {palavras.toLocaleString('pt-BR')} palavra{palavras === 1 ? '' : 's'} · ~
        {Math.max(1, Math.round(palavras / 200))} min de leitura
      </footer>
    </div>
  );
}
