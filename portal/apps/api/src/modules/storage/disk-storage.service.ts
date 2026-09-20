import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve, sep } from 'node:path';
import type { ArquivoParaUpload, StorageProvider } from './storage.provider';
import type { AppConfig } from '../../config/configuration';

/**
 * Armazenamento em disco (secao 13).
 *
 * Provedor padrao do MAKUCHO. Um portal editorial guarda algumas milhares
 * de imagens ja otimizadas — volume que um diretorio resolve. Rodar um
 * servidor S3 completo ao lado para isso custaria ~384 MB de RAM em uma
 * VPS compartilhada com outras aplicacoes, sem nada em troca.
 *
 * Os arquivos sao entregues pelo nginx direto do disco, que e mais rapido
 * do que passar por um processo Node ou por uma API de objetos.
 *
 * A interface StorageProvider continua valendo: migrar para S3, R2 ou B2
 * quando o volume justificar e trocar o provider no modulo.
 */
@Injectable()
export class DiskStorageService implements StorageProvider, OnModuleInit {
  private readonly logger = new Logger('Storage');
  private readonly raiz: string;
  private readonly urlPublica: string;

  private readonly ativo: boolean;

  constructor(config: ConfigService<AppConfig, true>) {
    const storage = config.get('storage', { infer: true });
    this.raiz = resolve(storage.diskPath);
    // Sem barra no fim, para montar a URL por concatenacao simples.
    this.urlPublica = storage.publicUrl.replace(/\/+$/, '');
    this.ativo = storage.provider === 'disk';
  }

  async onModuleInit(): Promise<void> {
    // Os dois providers ficam registrados; so o escolhido prepara o
    // destino. Criar o diretorio a toa confundiria quem usa S3.
    if (!this.ativo) return;
    await this.ensureBucket();
  }

  async ensureBucket(): Promise<void> {
    try {
      await mkdir(this.raiz, { recursive: true });
      this.logger.log(`Arquivos em ${this.raiz}`);
    } catch (erro) {
      this.logger.error(
        `Nao foi possivel criar o diretorio de midia: ${
          erro instanceof Error ? erro.message : String(erro)
        }`,
      );
      throw erro;
    }
  }

  async upload(arquivo: ArquivoParaUpload): Promise<{ key: string; url: string }> {
    const caminho = this.caminhoDe(arquivo.key);

    // As chaves sao organizadas por ano/mes; o diretorio pode nao existir.
    await mkdir(dirname(caminho), { recursive: true });
    await writeFile(caminho, arquivo.body);

    return { key: arquivo.key, url: this.getUrl(arquivo.key) };
  }

  async delete(key: string): Promise<void> {
    // force: true nao reclama se o arquivo ja sumiu, o que torna a
    // exclusao idempotente — a faxina diaria pode repetir uma chave.
    await rm(this.caminhoDe(key), { force: true });
  }

  async deleteMany(keys: string[]): Promise<void> {
    await Promise.all(keys.map((key) => this.delete(key)));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.caminhoDe(key));
      return true;
    } catch {
      return false;
    }
  }

  getUrl(key: string): string {
    return `${this.urlPublica}/${key}`;
  }

  /**
   * Em disco todo arquivo e publico: quem tem a URL acessa. Nao ha
   * assinatura a gerar, entao devolvemos a propria URL — o contrato da
   * interface se mantem para quem chama.
   */
  async getSignedUrl(key: string): Promise<string> {
    return this.getUrl(key);
  }

  /**
   * Resolve a chave dentro da raiz.
   *
   * As chaves sao montadas pelo pipeline (ano/mes/checksum-sufixo.ext) e
   * nunca chegam do cliente, mas a checagem fica: uma regressao que
   * deixasse um nome controlavel passar por aqui viraria leitura ou
   * escrita fora do diretorio de midia.
   *
   * Rejeitamos em vez de sanear. Saneando, "a/../../../x.webp" viraria
   * "x.webp" — contido, porem gravado em lugar diferente do que o banco
   * registrou, o que e um bug silencioso.
   */
  private caminhoDe(key: string): string {
    const invalida =
      key.includes('\0') ||
      /(^|[/\\])\.\.([/\\]|$)/.test(key) ||
      // Caminho absoluto: barra inicial ou letra de unidade no Windows.
      /^([a-zA-Z]:|[/\\])/.test(key);

    if (invalida) {
      throw new Error(`Chave de arquivo invalida: ${key}`);
    }

    const caminho = resolve(join(this.raiz, normalize(key)));

    // Rede de seguranca, para o que escapar das regras acima.
    if (caminho !== this.raiz && !caminho.startsWith(this.raiz + sep)) {
      throw new Error(`Chave de arquivo invalida: ${key}`);
    }

    return caminho;
  }
}
