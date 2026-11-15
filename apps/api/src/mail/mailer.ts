import { Injectable, Logger } from '@nestjs/common';

export interface InvitationMessage {
  to: string;
  link: string;
  workspaceName: string;
  inviterName: string | null;
  expiresAt: Date;
}

/** Outgoing mail. Bind a real provider in MailModule when one is added to the stack. */
export abstract class Mailer {
  abstract sendInvitation(message: InvitationMessage): Promise<void>;
}

/**
 * Development mailer: logs the message. The link contains the invite token, so never use this
 * in production. The API also returns the link to the inviter to share by hand.
 */
@Injectable()
export class LogMailer extends Mailer {
  private readonly logger = new Logger('Mailer');

  sendInvitation(message: InvitationMessage): Promise<void> {
    this.logger.log(
      `Invitation to "${message.workspaceName}" for ${message.to} (expires ${message.expiresAt.toISOString()}): ${message.link}`,
    );
    return Promise.resolve();
  }
}
