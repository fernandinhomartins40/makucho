import { Injectable, Logger } from '@nestjs/common';
import type { InscritoNewsletter, NewsletterProvider } from './newsletter.provider';

/**
 * Provedor padrao: guarda tudo apenas no nosso banco.
 *
 * O portal funciona desde o primeiro dia sem contrato com Resend, Brevo ou
 * Mailchimp. A lista pode ser exportada em CSV pelo painel e importada no
 * provedor escolhido depois, ou uma implementacao real desta interface
 * assume o lugar sem mexer no service.
 */
@Injectable()
export class LocalNewsletterProvider implements NewsletterProvider {
  readonly nome = 'local';
  private readonly logger = new Logger('Newsletter');

  async inscrever(inscrito: InscritoNewsletter): Promise<void> {
    // Nao registramos o e-mail no log: ele e dado pessoal e os logs vao
    // parar em agregadores com outro nivel de acesso.
    this.logger.debug('Inscrição gravada apenas na base local');
    void inscrito;
  }

  async desinscrever(_email: string): Promise<void> {
    this.logger.debug('Cancelamento gravado apenas na base local');
  }
}
