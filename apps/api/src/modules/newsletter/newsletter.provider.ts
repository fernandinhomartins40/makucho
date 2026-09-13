/**
 * Contrato do provedor de newsletter (secao 29).
 *
 * A lista de inscritos vive no nosso banco; o provedor externo e apenas o
 * meio de envio. Isso mantem a base sob nosso controle e permite trocar de
 * fornecedor — ou nao ter nenhum — sem perder contato nem reescrever nada.
 */
export interface InscritoNewsletter {
  email: string;
  name?: string | null;
}

export interface NewsletterProvider {
  /** Nome curto, usado em logs e na tela de configurações. */
  readonly nome: string;

  /** Envia o inscrito para a lista do provedor. */
  inscrever(inscrito: InscritoNewsletter): Promise<void>;

  /** Remove da lista do provedor. */
  desinscrever(email: string): Promise<void>;
}

export const NEWSLETTER_PROVIDER = Symbol('NEWSLETTER_PROVIDER');
