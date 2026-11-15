import { Module } from '@nestjs/common';
import { InvitationTokenController, WorkspaceInvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';

@Module({
  controllers: [WorkspaceInvitationsController, InvitationTokenController],
  providers: [InvitationsService],
})
export class InvitationsModule {}
