import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type MyWorkspace, myWorkspaceSchema, type Workspace, workspaceSchema } from '@teamboard/shared';
import { z } from 'zod';
import type { AccessContext } from '../access/access.types';
import { CurrentAccess } from '../access/current-access.decorator';
import { RequireRole } from '../access/require-role.decorator';
import { AccessTokenGuard, type AuthContext } from '../auth/access-token.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ApiZodBody, ApiZodResponse } from '../common/api-zod.decorators';
import { CreateWorkspaceDto, TransferOwnershipDto, UpdateWorkspaceDto } from './workspaces.dto';
import { WorkspacesService } from './workspaces.service';

@ApiTags('workspaces')
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Post()
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a workspace; you become its owner' })
  @ApiZodBody(CreateWorkspaceDto.schema)
  @ApiZodResponse(HttpStatus.CREATED, myWorkspaceSchema)
  create(@CurrentUser() user: AuthContext, @Body() body: CreateWorkspaceDto): Promise<MyWorkspace> {
    return this.workspaces.create(user.userId, body);
  }

  @Get()
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Workspaces you belong to, with your role' })
  @ApiZodResponse(HttpStatus.OK, z.array(myWorkspaceSchema))
  listMine(@CurrentUser() user: AuthContext): Promise<MyWorkspace[]> {
    return this.workspaces.listMine(user.userId);
  }

  @Get(':workspaceId')
  @RequireRole('workspace.read')
  @ApiOperation({ summary: 'One workspace' })
  @ApiZodResponse(HttpStatus.OK, myWorkspaceSchema)
  get(@CurrentAccess() access: AccessContext): Promise<MyWorkspace> {
    return this.workspaces.get(access);
  }

  @Patch(':workspaceId')
  @RequireRole('workspace.update')
  @ApiOperation({ summary: 'Rename the workspace (owner)' })
  @ApiZodBody(UpdateWorkspaceDto.schema)
  @ApiZodResponse(HttpStatus.OK, workspaceSchema)
  update(@CurrentAccess() access: AccessContext, @Body() body: UpdateWorkspaceDto): Promise<Workspace> {
    return this.workspaces.update(access, body);
  }

  @Delete(':workspaceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireRole('workspace.delete')
  @ApiOperation({ summary: 'Delete the workspace and everything in it (owner)' })
  delete(@CurrentAccess() access: AccessContext): Promise<void> {
    return this.workspaces.delete(access);
  }

  @Post(':workspaceId/transfer-ownership')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireRole('workspace.transferOwnership')
  @ApiOperation({ summary: 'Make another member the owner; you become an admin (owner)' })
  @ApiZodBody(TransferOwnershipDto.schema)
  transferOwnership(
    @CurrentAccess() access: AccessContext,
    @Body() body: TransferOwnershipDto,
  ): Promise<void> {
    return this.workspaces.transferOwnership(access, body.userId);
  }

  @Post(':workspaceId/leave')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireRole('workspace.leave')
  @ApiOperation({ summary: 'Leave the workspace (the owner must transfer ownership first)' })
  leave(@CurrentAccess() access: AccessContext): Promise<void> {
    return this.workspaces.leave(access);
  }
}
