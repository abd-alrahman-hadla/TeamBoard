import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { type Member, memberSchema } from '@teamboard/shared';
import { z } from 'zod';
import type { AccessContext } from '../access/access.types';
import { CurrentAccess } from '../access/current-access.decorator';
import { RequireRole } from '../access/require-role.decorator';
import { ApiZodBody, ApiZodResponse } from '../common/api-zod.decorators';
import { ParseIdPipe } from '../common/parse-id.pipe';
import { MembersService } from './members.service';
import { UpdateMemberRoleDto } from './workspaces.dto';

@ApiTags('members')
@Controller('workspaces/:workspaceId/members')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  @RequireRole('member.read')
  @ApiOperation({ summary: 'Workspace members' })
  @ApiZodResponse(HttpStatus.OK, z.array(memberSchema))
  list(@CurrentAccess() access: AccessContext): Promise<Member[]> {
    return this.members.list(access);
  }

  @Patch(':userId')
  @RequireRole('member.manage')
  @ApiOperation({
    summary: "Change a member's role",
    description:
      'Owner: anyone but the owner. Admin: members and viewers only. Nobody can grant OWNER (use transfer).',
  })
  @ApiZodBody(UpdateMemberRoleDto.schema)
  @ApiZodResponse(HttpStatus.OK, memberSchema)
  changeRole(
    @CurrentAccess() access: AccessContext,
    @Param('userId', ParseIdPipe) userId: string,
    @Body() body: UpdateMemberRoleDto,
  ): Promise<Member> {
    return this.members.changeRole(access, userId, body.role);
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireRole('member.manage')
  @ApiOperation({ summary: 'Remove a member (unassigns them from all cards)' })
  remove(
    @CurrentAccess() access: AccessContext,
    @Param('userId', ParseIdPipe) userId: string,
  ): Promise<void> {
    return this.members.remove(access, userId);
  }
}
