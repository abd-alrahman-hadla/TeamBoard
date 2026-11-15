import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import {
  type CreatedInvitation,
  createdInvitationSchema,
  createInvitationInputSchema,
  type Invitation,
  type InvitationPreview,
  invitationPreviewSchema,
  invitationSchema,
  type MyWorkspace,
  myWorkspaceSchema,
} from '@teamboard/shared';
import { z } from 'zod';
import type { AccessContext } from '../access/access.types';
import { CurrentAccess } from '../access/current-access.decorator';
import { RequireRole } from '../access/require-role.decorator';
import { AccessTokenGuard, type AuthContext } from '../auth/access-token.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { THROTTLE } from '../auth/throttle';
import { ApiErrorResponse, ApiZodBody, ApiZodResponse } from '../common/api-zod.decorators';
import { ParseIdPipe } from '../common/parse-id.pipe';
import { createZodDto } from '../common/zod-dto';
import { InvitationsService } from './invitations.service';

class CreateInvitationDto extends createZodDto(createInvitationInputSchema) {}

@ApiTags('invitations')
@Controller('workspaces/:workspaceId/invitations')
export class WorkspaceInvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Post()
  @RequireRole('invitation.create')
  @ApiOperation({
    summary: 'Invite someone by email',
    description:
      'Returns the accept link (valid 48h). A new invite to the same email replaces the previous link.',
  })
  @ApiZodBody(CreateInvitationDto.schema)
  @ApiZodResponse(HttpStatus.CREATED, createdInvitationSchema)
  @ApiErrorResponse(HttpStatus.CONFLICT, 'Already a member (already_member)')
  create(
    @CurrentAccess() access: AccessContext,
    @Body() body: CreateInvitationDto,
  ): Promise<CreatedInvitation> {
    return this.invitations.create(access, body);
  }

  @Get()
  @RequireRole('invitation.read')
  @ApiOperation({ summary: 'Pending invitations' })
  @ApiZodResponse(HttpStatus.OK, z.array(invitationSchema))
  list(@CurrentAccess() access: AccessContext): Promise<Invitation[]> {
    return this.invitations.list(access);
  }

  @Delete(':invitationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireRole('invitation.revoke')
  @ApiOperation({ summary: 'Revoke a pending invitation' })
  revoke(
    @CurrentAccess() access: AccessContext,
    @Param('invitationId', ParseIdPipe) invitationId: string,
  ): Promise<void> {
    return this.invitations.revoke(access, invitationId);
  }
}

/** Token routes: the token in the link is the credential for the preview. */
@ApiTags('invitations')
@Controller('invitations/:token')
@UseGuards(ThrottlerGuard)
@SkipThrottle({ [THROTTLE.auth]: true })
export class InvitationTokenController {
  constructor(private readonly invitations: InvitationsService) {}

  @Get()
  @ApiOperation({ summary: 'Preview an invitation (no sign-in needed)' })
  @ApiZodResponse(HttpStatus.OK, invitationPreviewSchema)
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'Unknown, revoked or used (invitation_invalid)')
  @ApiErrorResponse(HttpStatus.GONE, 'Expired (invitation_expired)')
  preview(@Param('token') token: string): Promise<InvitationPreview> {
    return this.invitations.preview(token);
  }

  @Post('accept')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Accept an invitation sent to your email' })
  @ApiZodResponse(HttpStatus.OK, myWorkspaceSchema)
  @ApiErrorResponse(HttpStatus.FORBIDDEN, 'Signed in with a different email (invitation_email_mismatch)')
  @ApiErrorResponse(HttpStatus.CONFLICT, 'Already a member (already_member)')
  accept(@Param('token') token: string, @CurrentUser() user: AuthContext): Promise<MyWorkspace> {
    return this.invitations.accept(token, user.userId);
  }
}
