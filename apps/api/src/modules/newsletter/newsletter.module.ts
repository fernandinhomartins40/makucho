import { Module } from '@nestjs/common';
import { NewsletterController } from './newsletter.controller';
import { NewsletterService } from './newsletter.service';
import { LocalNewsletterProvider } from './local-newsletter.provider';
import { NEWSLETTER_PROVIDER } from './newsletter.provider';

/**
 * Para enviar por Resend, Brevo ou Mailchimp, escreva uma classe que
 * implemente NewsletterProvider e aponte o token para ela.
 */
@Module({
  controllers: [NewsletterController],
  providers: [
    NewsletterService,
    LocalNewsletterProvider,
    { provide: NEWSLETTER_PROVIDER, useExisting: LocalNewsletterProvider },
  ],
  exports: [NewsletterService],
})
export class NewsletterModule {}
