// ============================================================
// MAKUCHO STUDIO - Cifragem de credenciais
//
// A chave da API de IA e cadastrada pelo usuario no painel e fica
// guardada no banco. Em texto puro, um dump -- backup, log de erro,
// acesso indevido -- entregaria a chave de faturamento do cliente.
//
// AES-256-GCM e nao AES-CBC: o GCM autentica o conteudo. Sem isso,
// alguem com escrita no banco poderia alterar o ciphertext e a
// aplicacao decifraria lixo sem perceber.
// ============================================================

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';

export interface ValorCifrado {
  encryptedKey: string;
  iv: string;
  authTag: string;
}

@Injectable()
export class CryptoService {
  private readonly logger = new Logger(CryptoService.name);
  private readonly chaveMestra: Buffer;

  constructor() {
    // Deriva a chave mestra do segredo JWT, que ja existe e e gerado
    // uma vez por instalacao. O SHA-256 garante os 32 bytes que o
    // AES-256 exige, independentemente do tamanho do segredo.
    //
    // Nao e ideal reaproveitar o segredo: se ele vazar, as chaves de
    // IA vao junto. A alternativa seria uma STUDIO_ENCRYPTION_KEY
    // propria -- vale trocar quando houver mais de um cliente.
    const segredo = process.env.JWT_ACCESS_SECRET;

    if (!segredo || segredo.length < 32) {
      throw new InternalServerErrorException(
        'JWT_ACCESS_SECRET ausente ou curto demais para derivar a chave de cifragem',
      );
    }

    this.chaveMestra = createHash('sha256').update(segredo).digest();
  }

  /**
   * Cifra um segredo.
   *
   * O IV e sorteado a cada chamada: reutiliza-lo no GCM quebra a
   * cifra por completo -- dois textos com o mesmo IV permitem
   * recuperar ambos.
   */
  cifrar(textoClaro: string): ValorCifrado {
    const iv = randomBytes(12); // 96 bits, o tamanho recomendado para GCM
    const cipher = createCipheriv('aes-256-gcm', this.chaveMestra, iv);

    const cifrado = Buffer.concat([cipher.update(textoClaro, 'utf8'), cipher.final()]);

    return {
      encryptedKey: cifrado.toString('base64'),
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
    };
  }

  /**
   * Decifra um segredo.
   *
   * Falha se o conteudo foi alterado: o `final()` do GCM verifica o
   * authTag e lanca. E o comportamento desejado -- melhor recusar a
   * chamada do que enviar lixo ao provedor de IA.
   */
  decifrar(valor: ValorCifrado): string {
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.chaveMestra,
        Buffer.from(valor.iv, 'base64'),
      );
      decipher.setAuthTag(Buffer.from(valor.authTag, 'base64'));

      return Buffer.concat([
        decipher.update(Buffer.from(valor.encryptedKey, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      // O erro nao carrega detalhe: mensagem especifica ajudaria a
      // distinguir "chave errada" de "conteudo adulterado", e isso e
      // informacao para quem ataca.
      this.logger.error('falha ao decifrar credencial');
      throw new InternalServerErrorException(
        'nao foi possivel ler a credencial; cadastre a chave novamente',
      );
    }
  }

  /**
   * Prefixo exibido na interface.
   *
   * O usuario precisa reconhecer QUAL chave esta ativa sem que ela
   * seja revelada. Chaves de provedor costumam ter prefixo
   * identificavel ("sk-..."), entao mostramos o comeco e o fim.
   */
  prefixoVisivel(chave: string): string {
    if (chave.length <= 12) return '•'.repeat(chave.length);
    return `${chave.slice(0, 6)}…${chave.slice(-4)}`;
  }
}
