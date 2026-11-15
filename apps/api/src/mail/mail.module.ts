import { Global, Module } from '@nestjs/common';
import { LogMailer, Mailer } from './mailer';

@Global()
@Module({
  providers: [{ provide: Mailer, useClass: LogMailer }],
  exports: [Mailer],
})
export class MailModule {}
