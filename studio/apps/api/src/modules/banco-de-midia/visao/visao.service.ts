// ============================================================
// A IA que OLHA as mídias: dá a cada candidata a nota de quanto ela
// combina com a cena que a IA de texto descreveu.
//
// O DeepSeek só lê texto: escolhia pelo título e pelas tags, que nos
// bancos são pobres ("pexels-photo-123"). O CLIP (ViT-B/32, MIT) põe a
// imagem e a frase no mesmo espaço -- a nota é o quanto a miniatura
// "parece" a cena. Roda aqui, sem chave nem custo por imagem.
//
// Os pesos (~150 MB) baixam uma vez do Hugging Face para o volume de
// mídia. Sem eles (rede fora, disco cheio, STUDIO_VISAO=off), `notas`
// devolve null e a ordem por texto de sempre continua valendo.
// ============================================================

import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import sharp from 'sharp';
import { ARQUIVOS_DO_CLIP, CAMINHO_NA_ORIGEM, LADO_DA_IMAGEM, ORIGEM_DO_CLIP, afinidade, cosseno, criarTokenizador, mediaDosTextos, pixelsParaTensor, type TokenizadorClip } from './clip';
import type { PedidoDaVisao, RespostaDaVisao } from './visao.worker';

/** Parada por isso, a thread fecha e devolve a memória. */
const OCIOSA_APOS_MS = 90_000;
/** Miniaturas maiores que isso não são miniaturas. */
const MAX_MINIATURA = 4 * 1024 * 1024;
const AGENTE = 'MakuchoStudio/1.0 (+https://makucho.com.br)';

type Pendente = { ok: (e: Float32Array[]) => void; falha: (e: Error) => void };

@Injectable()
export class VisaoService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger(VisaoService.name);
  private readonly pasta = resolve(process.env.STUDIO_MODELOS_DIR ?? join(process.env.STORAGE_DISK_PATH ?? '/app/storage/media', '.modelos', 'clip'));
  private readonly desligada = process.env.STUDIO_VISAO === 'off' || process.env.AI_PROVIDER === 'falso';
  private pronta: Promise<boolean> | null = null;
  private tokenizador: TokenizadorClip | null = null;
  private worker: Worker | null = null;
  private ociosa: NodeJS.Timeout | null = null;
  private proximo = 1;
  private readonly pendentes = new Map<number, Pendente>();
  /** Um lote por vez: a thread tem um núcleo só. */
  private fila: Promise<unknown> = Promise.resolve();

  onApplicationBootstrap() {
    // Baixa os pesos logo, fora do caminho de quem espera a montagem.
    if (!this.desligada) setTimeout(() => void this.preparar(), 30_000).unref();
  }

  async onModuleDestroy() {
    await this.fechar();
  }

  /**
   * A afinidade (0-100) de cada imagem com a cena, na ordem recebida.
   * `textos`: a cena em inglês e os termos; as miniaturas, por URL.
   * Uma miniatura que não baixa fica com null. Null inteiro: sem visão.
   */
  async notas(textos: readonly string[], miniaturas: readonly string[]): Promise<(number | null)[] | null> {
    if (this.desligada || !textos.length || !miniaturas.length) return null;
    if (!(await this.preparar())) return null;
    try {
      const pixels = await Promise.all(miniaturas.map((u) => this.pixels(u)));
      const validas = pixels.flatMap((p, i) => (p ? [{ p, i }] : []));
      if (!validas.length) return null;
      const [embTextos, embImagens] = await this.emFila(async () => {
        const t = await this.pedir({ tipo: 'textos', ids: textos.map((x) => this.tokenizador!(x)) });
        const lote = new Float32Array(validas.length * validas[0]!.p.length);
        validas.forEach((v, j) => lote.set(v.p, j * v.p.length));
        const im = await this.pedir({ tipo: 'imagens', pixels: lote, n: validas.length });
        return [t, im] as const;
      });
      const cena = mediaDosTextos(embTextos);
      const saida: (number | null)[] = miniaturas.map(() => null);
      validas.forEach((v, j) => (saida[v.i] = afinidade(cosseno(cena, embImagens[j]!))));
      return saida;
    } catch (e) {
      this.log.warn(`visão falhou: ${e instanceof Error ? e.message : e}`);
      return null;
    }
  }

  // ---------- Modelo ----------

  private preparar(): Promise<boolean> {
    if (this.desligada) return Promise.resolve(false);
    this.pronta ??= this.baixar().then(
      () => true,
      (e: unknown) => {
        this.log.warn(`modelo de visão indisponível: ${e instanceof Error ? e.message : e}`);
        this.pronta = null; // tenta de novo na próxima vez
        return false;
      },
    );
    return this.pronta;
  }

  private async baixar() {
    await mkdir(this.pasta, { recursive: true });
    for (const chave of Object.keys(ARQUIVOS_DO_CLIP) as (keyof typeof ARQUIVOS_DO_CLIP)[]) {
      const destino = join(this.pasta, ARQUIVOS_DO_CLIP[chave]);
      if (existsSync(destino) && (await stat(destino)).size > 0) continue;
      this.log.log(`baixando ${ARQUIVOS_DO_CLIP[chave]} do modelo de visão…`);
      const r = await fetch(`${ORIGEM_DO_CLIP}/${CAMINHO_NA_ORIGEM[chave]}`, { signal: AbortSignal.timeout(300_000), redirect: 'follow' });
      if (!r.ok) throw new Error(`${ARQUIVOS_DO_CLIP[chave]}: HTTP ${r.status}`);
      const temp = `${destino}.parcial`;
      await writeFile(temp, Buffer.from(await r.arrayBuffer()));
      await rename(temp, destino);
    }
    this.tokenizador ??= criarTokenizador(JSON.parse(await readFile(join(this.pasta, ARQUIVOS_DO_CLIP.tokenizador), 'utf8')));
  }

  private emFila<T>(f: () => Promise<T>): Promise<T> {
    const r = this.fila.then(f, f);
    this.fila = r.catch(() => undefined);
    return r;
  }

  private pedir(p: Omit<Extract<PedidoDaVisao, { tipo: 'textos' }>, 'id'> | Omit<Extract<PedidoDaVisao, { tipo: 'imagens' }>, 'id'>): Promise<Float32Array[]> {
    const w = this.thread();
    const id = this.proximo++;
    return new Promise((ok, falha) => {
      this.pendentes.set(id, { ok, falha });
      w.postMessage({ ...p, id });
    }).finally(() => this.agendarFechamento()) as Promise<Float32Array[]>;
  }

  private thread(): Worker {
    if (this.ociosa) clearTimeout(this.ociosa);
    if (this.worker) return this.worker;
    // Compilado: .js ao lado; nos testes (tsx), o próprio .ts.
    const arquivo = join(__dirname, `visao.worker${extname(__filename)}`);
    const w = arquivo.endsWith('.ts')
      ? new Worker(`require('tsx/cjs'); require(${JSON.stringify(arquivo)});`, { eval: true, workerData: { pasta: this.pasta } })
      : new Worker(arquivo, { workerData: { pasta: this.pasta } });
    w.on('message', (r: RespostaDaVisao) => {
      const p = this.pendentes.get(r.id);
      if (!p) return;
      this.pendentes.delete(r.id);
      if ('erro' in r) p.falha(new Error(r.erro));
      else p.ok(r.embeds);
    });
    const morreu = (e: Error) => {
      for (const p of this.pendentes.values()) p.falha(e);
      this.pendentes.clear();
      if (this.worker === w) this.worker = null;
    };
    w.on('error', morreu);
    w.on('exit', () => morreu(new Error('a thread de visão fechou')));
    this.worker = w;
    return w;
  }

  private agendarFechamento() {
    if (this.ociosa) clearTimeout(this.ociosa);
    this.ociosa = setTimeout(() => {
      if (!this.pendentes.size) void this.fechar();
    }, OCIOSA_APOS_MS);
    this.ociosa.unref();
  }

  private async fechar() {
    if (this.ociosa) clearTimeout(this.ociosa);
    const w = this.worker;
    this.worker = null;
    await w?.terminate();
  }

  // ---------- Miniatura -> 224x224 ----------

  private async pixels(url: string): Promise<Float32Array | null> {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': AGENTE }, signal: AbortSignal.timeout(10_000), redirect: 'follow' });
      if (!r.ok) return null;
      const buf = Buffer.from(await r.arrayBuffer());
      if (!buf.length || buf.length > MAX_MINIATURA) return null;
      // Ícones transparentes sobre branco: é como o CLIP os viu no treino.
      const rgb = await sharp(buf, { density: 144 })
        .flatten({ background: '#ffffff' })
        .resize(LADO_DA_IMAGEM, LADO_DA_IMAGEM, { fit: 'cover', kernel: 'cubic' })
        .removeAlpha()
        .raw()
        .toBuffer();
      return pixelsParaTensor(rgb);
    } catch {
      return null;
    }
  }
}
