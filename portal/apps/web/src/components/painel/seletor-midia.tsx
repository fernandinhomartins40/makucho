'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import NextImage from 'next/image';
import Cropper, { type Area } from 'react-easy-crop';
import {
  IMAGE_PRESET_DEFINITIONS,
  IMAGE_PRESETS,
  type ImagePreset,
  type MediaDto,
  type MediaUploadConfigDto,
} from '@makucho/types';
import { ErroApi, painel } from '@/lib/painel';
import { Aviso, Botao, Campo, Carregando, Entrada, Modal, Selecao, Vazio } from '@/components/painel/ui';

/** Miniatura da grade; cai para a URL original se faltar variante. */
export function miniatura(m: MediaDto): string {
  const v =
    m.variants?.find((x) => x.type === 'THUMBNAIL' && x.format === 'webp') ??
    m.variants?.find((x) => x.type === 'THUMBNAIL');
  return v?.url ?? m.url;
}

// ============================================================
// ENVIO COM RECORTE
// ============================================================

function Envio({ aoEnviar, aoCancelar, aoOcupar, presetInicial = 'POST_CARD' }: { aoEnviar: (m: MediaDto) => void; aoCancelar: () => void; aoOcupar: (ocupado: boolean) => void; presetInicial?: ImagePreset }) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<string>('');
  const [preset, setPreset] = useState<ImagePreset>(presetInicial);
  // Proporcao real do arquivo: o formato "livre" recorta mantendo-a.
  const [proporcaoOriginal, setProporcaoOriginal] = useState<number | null>(null);
  const [posicao, setPosicao] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [alt, setAlt] = useState('');
  const [credito, setCredito] = useState('');
  const [legenda, setLegenda] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [configuracao, setConfiguracao] = useState<MediaUploadConfigDto | null>(null);
  const [erroConfiguracao, setErroConfiguracao] = useState(false);

  useEffect(() => {
    let ativo = true;
    painel.configuracaoUploadMidia()
      .then((valor) => { if (ativo) setConfiguracao(valor); })
      .catch(() => { if (ativo) setErroConfiguracao(true); });
    return () => { ativo = false; };
  }, []);

  // A URL de objeto e um recurso do navegador: sem revoke ela vaza.
  useEffect(() => {
    if (!arquivo) return;
    const url = URL.createObjectURL(arquivo);
    setPrevia(url);
    setProporcaoOriginal(null);
    const img = new window.Image();
    img.onload = () => setProporcaoOriginal(img.naturalWidth / img.naturalHeight || 1);
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [arquivo]);

  const definicao = IMAGE_PRESET_DEFINITIONS[preset];
  const livre = preset === 'FREEFORM';

  function escolher(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;

    if (!f.type.startsWith('image/') || (configuracao && !configuracao.allowedMimeTypes.includes(f.type))) {
      setErro('Selecione um arquivo de imagem.');
      return;
    }
    if (configuracao && f.size > configuracao.maxFileSizeBytes) {
      setErro(`A imagem precisa ter no máximo ${configuracao.maxFileSizeBytes / 1024 / 1024} MB.`);
      return;
    }

    setErro('');
    setArquivo(f);
    setZoom(1);
    setPosicao({ x: 0, y: 0 });
    if (!alt) setAlt(f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '));
  }

  async function enviar() {
    if (!arquivo || enviando) return;
    if (!area) {
      setErro('Ajuste o enquadramento da imagem antes de enviar.');
      return;
    }
    setErro('');
    setEnviando(true);
    aoOcupar(true);

    try {
      const form = new FormData();
      form.append('file', arquivo);
      form.append('preset', preset);
      if (alt.trim()) form.append('alt', alt.trim());
      if (credito.trim()) form.append('credit', credito.trim());
      if (legenda.trim()) form.append('caption', legenda.trim());

      // O recorte vai em pixels da imagem original: o Sharp corta no
      // servidor, entao o arquivo final e sempre o mesmo que aparece aqui.
      if (area) {
        form.append(
          'crop',
          JSON.stringify({
            x: Math.round(area.x),
            y: Math.round(area.y),
            width: Math.round(area.width),
            height: Math.round(area.height),
          }),
        );
      }

      aoEnviar(await painel.enviarMidia(form));
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível enviar a imagem.');
    } finally {
      setEnviando(false);
      aoOcupar(false);
    }
  }

  if (!arquivo) {
    return (
      <>
        <Aviso tipo="erro">{erro}</Aviso>
        <label className="pn-solta">
          <input type="file" accept={configuracao?.allowedMimeTypes.join(',') ?? 'image/*'} onChange={escolher} aria-label="Escolher uma imagem para enviar" />
          <strong>Escolher uma imagem</strong>
          <span>{configuracao ? `${configuracao.allowedMimeTypes.map((m) => m.replace('image/', '').toUpperCase()).join(', ')} · até ${configuracao.maxFileSizeBytes / 1024 / 1024} MB` : erroConfiguracao ? 'Limites indisponíveis; o servidor validará o arquivo.' : 'Consultando formatos e limite de tamanho…'}</span>
          <small>
            Os dados de câmera e localização são removidos automaticamente no envio.
          </small>
        </label>
      </>
    );
  }

  return (
    <>
      <Aviso tipo="erro">{erro}</Aviso>

      <Campo rotulo="Formato" dica={definicao.description}>
        <Selecao value={preset} onChange={(e) => setPreset(e.target.value as ImagePreset)}>
          {IMAGE_PRESETS.map((p) => (
            <option key={p} value={p}>
              {IMAGE_PRESET_DEFINITIONS[p].label}
              {p !== 'FREEFORM' &&
                ` (${IMAGE_PRESET_DEFINITIONS[p].width}×${IMAGE_PRESET_DEFINITIONS[p].height})`}
            </option>
          ))}
        </Selecao>
      </Campo>

      {livre && !proporcaoOriginal ? (
        <p className="pn-dica">Lendo a imagem…</p>
      ) : (
        <>
          <div className="pn-recorte">
            <Cropper
              // Trocar o formato recria o cropper com a proporcao nova.
              key={`${preset}-${proporcaoOriginal ?? 0}`}
              image={previa}
              crop={posicao}
              zoom={zoom}
              aspect={livre ? proporcaoOriginal ?? 1 : definicao.aspectRatio}
              onCropChange={setPosicao}
              onZoomChange={setZoom}
              onCropComplete={(_, pixels) => setArea(pixels)}
            />
          </div>
          <label className="pn-zoom">
            Aproximar
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
            />
          </label>
        </>
      )}

      <p className="pn-dica pn-otimizacao">
        No envio, a imagem é recortada como acima, comprimida e convertida para WebP e AVIF em
        vários tamanhos. O arquivo original não é guardado.
      </p>

      <Campo
        rotulo="Texto alternativo"
        dica="Descreve a imagem para leitores de tela e para quando ela não carrega."
      >
        <Entrada value={alt} onChange={(e) => setAlt(e.target.value)} maxLength={320} />
      </Campo>

      <div className="pn-linha">
        <Campo rotulo="Crédito">
          <Entrada value={credito} onChange={(e) => setCredito(e.target.value)} maxLength={160} />
        </Campo>
        <Campo rotulo="Legenda">
          <Entrada value={legenda} onChange={(e) => setLegenda(e.target.value)} maxLength={500} />
        </Campo>
      </div>

      <div className="pn-modal-rodape" style={{ padding: 0, borderTop: 0 }}>
        <Botao variante="fantasma" onClick={aoCancelar} disabled={enviando}>
          Cancelar
        </Botao>
        <Botao variante="neutro" onClick={() => setArquivo(null)} disabled={enviando}>
          Trocar imagem
        </Botao>
        <Botao variante="primario" carregando={enviando} disabled={!area} onClick={enviar}>
          {enviando ? 'Enviando…' : 'Enviar'}
        </Botao>
      </div>
    </>
  );
}

// ============================================================
// GRADE DA BIBLIOTECA
// ============================================================

export function GradeMidia({
  itens,
  selecionado,
  aoEscolher,
}: {
  itens: MediaDto[];
  selecionado?: string | null;
  aoEscolher: (m: MediaDto) => void;
}) {
  return (
    <div className="pn-grade-midia">
      {itens.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => aoEscolher(m)}
          className={`pn-midia-item ${selecionado === m.id ? 'pn-midia-sel' : ''}`}
          title={m.alt ?? m.filename ?? ''}
        >
          <NextImage
            src={miniatura(m)}
            alt={m.alt ?? ''}
            width={160}
            height={110}
            sizes="160px"
            unoptimized
          />
          <span>{m.alt || m.filename || 'sem descrição'}</span>
        </button>
      ))}
    </div>
  );
}

// ============================================================
// MODAL SELETOR
// ============================================================

export function SeletorMidia({
  aberto,
  aoFechar,
  aoEscolher,
  selecionado,
  preset,
}: {
  aberto: boolean;
  aoFechar: () => void;
  aoEscolher: (m: MediaDto) => void;
  selecionado?: string | null;
  /** Formato de recorte sugerido para o campo que abriu o seletor. */
  preset?: ImagePreset;
}) {
  const [aba, setAba] = useState<'biblioteca' | 'enviar'>('biblioteca');
  const [itens, setItens] = useState<MediaDto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [falha, setFalha] = useState<{ mensagem: string; pagina: number; termo: string; acrescentar: boolean } | null>(null);
  const requisicaoAtual = useRef(0);
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(1);
  const [temMais, setTemMais] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);

  const carregar = useCallback(async (p: number, q: string, acrescentar: boolean) => {
    const requisicao = ++requisicaoAtual.current;
    setCarregando(true);
    setFalha(null);
    try {
      const r = await painel.midias({ page: p, perPage: 24, search: q || undefined });
      if (requisicao !== requisicaoAtual.current) return;
      setItens((atuais) => (acrescentar ? [...atuais, ...r.data] : r.data));
      setTemMais(r.meta.hasNextPage);
      setPagina(p);
    } catch (erro) {
      if (requisicao !== requisicaoAtual.current) return;
      setFalha({
        mensagem: erro instanceof ErroApi ? erro.message : 'Não foi possível carregar as imagens.',
        pagina: p,
        termo: q,
        acrescentar,
      });
    } finally {
      if (requisicao === requisicaoAtual.current) setCarregando(false);
    }
  }, []);

  useEffect(() => {
    if (!aberto) return;
    setAba('biblioteca');
    setPagina(1);
    void carregar(1, busca, false);
    // Ao abrir recarregamos do zero; a busca tem efeito proprio abaixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  // Espera o usuario parar de digitar para nao disparar uma busca por tecla.
  useEffect(() => {
    if (!aberto) return;
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      setPagina(1);
      void carregar(1, busca, false);
    }, 350);
    return () => clearTimeout(debounce.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca]);

  return (
    <Modal titulo="Biblioteca de mídia" aberto={aberto} aoFechar={() => { if (!enviando) aoFechar(); }} largura={880}>
      <div className="pn-abas" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={aba === 'biblioteca'}
          className={aba === 'biblioteca' ? 'pn-aba-ativa' : ''}
          onClick={() => setAba('biblioteca')}
          disabled={enviando}
        >
          Biblioteca
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={aba === 'enviar'}
          className={aba === 'enviar' ? 'pn-aba-ativa' : ''}
          onClick={() => setAba('enviar')}
          disabled={enviando}
        >
          Enviar imagem
        </button>
      </div>

      {aba === 'enviar' ? (
        <Envio
          presetInicial={preset}
          aoOcupar={setEnviando}
          aoCancelar={() => setAba('biblioteca')}
          aoEnviar={(m) => {
            aoEscolher(m);
            aoFechar();
          }}
        />
      ) : (
        <>
          <Entrada
            aria-label="Buscar imagens na biblioteca"
            placeholder="Buscar por descrição ou arquivo…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            style={{ marginBottom: 12 }}
          />

          {falha && (
            <div className="pn-erro-lista">
              <Aviso tipo="erro">{falha.mensagem} {itens.length ? 'As imagens anteriores permanecem abaixo.' : 'Nenhuma imagem foi carregada.'}</Aviso>
              <Botao variante="neutro" onClick={() => void carregar(falha.pagina, falha.termo, falha.acrescentar)}>Tentar novamente</Botao>
            </div>
          )}

          {carregando && itens.length === 0 ? (
            <Carregando />
          ) : falha && itens.length === 0 ? null : itens.length === 0 ? (
            <Vazio
              titulo="Nenhuma imagem"
              descricao="Envie a primeira imagem para usar nas publicações."
              acao={
                <Botao variante="primario" onClick={() => setAba('enviar')}>
                  Enviar imagem
                </Botao>
              }
            />
          ) : (
            <>
              <GradeMidia
                itens={itens}
                selecionado={selecionado}
                aoEscolher={(m) => {
                  aoEscolher(m);
                  aoFechar();
                }}
              />
              {temMais && !falha && (
                <div style={{ textAlign: 'center', marginTop: 12 }}>
                  <Botao
                    variante="neutro"
                    carregando={carregando}
                    onClick={() => {
                      const p = pagina + 1;
                      void carregar(p, busca, true);
                    }}
                  >
                    Carregar mais
                  </Botao>
                </div>
              )}
            </>
          )}
        </>
      )}
    </Modal>
  );
}

/** Campo de imagem usado nos formulários: mostra a capa e abre o seletor. */
export function CampoImagem({
  rotulo,
  midia,
  aoMudar,
  dica,
  preset,
}: {
  rotulo: string;
  midia: MediaDto | null;
  aoMudar: (m: MediaDto | null) => void;
  dica?: string;
  /** Formato de recorte deste campo (avatar, capa, banner...). */
  preset?: ImagePreset;
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <div className="pn-campo">
      <span className="pn-rotulo">{rotulo}</span>

      {midia ? (
        <div className="pn-capa">
          <NextImage
            src={miniatura(midia)}
            alt={midia.alt ?? ''}
            width={160}
            height={104}
            sizes="160px"
            unoptimized
          />
          <div>
            <strong>{midia.alt || midia.filename || 'Imagem'}</strong>
            <div className="pn-capa-acoes">
              <Botao variante="neutro" onClick={() => setAberto(true)}>
                Trocar
              </Botao>
              <Botao variante="fantasma" onClick={() => aoMudar(null)}>
                Remover
              </Botao>
            </div>
          </div>
        </div>
      ) : (
        <Botao variante="neutro" onClick={() => setAberto(true)}>
          Escolher imagem
        </Botao>
      )}

      {dica && <small className="pn-dica">{dica}</small>}

      <SeletorMidia
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        aoEscolher={aoMudar}
        selecionado={midia?.id}
        preset={preset}
      />
    </div>
  );
}
