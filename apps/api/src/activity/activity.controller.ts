import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { type ActivityPage, activityPageSchema, activityQuerySchema } from '@teamboard/shared';
import type { AccessContext } from '../access/access.types';
import { CurrentAccess } from '../access/current-access.decorator';
import { RequireRole } from '../access/require-role.decorator';
import { ApiZodResponse } from '../common/api-zod.decorators';
import { createZodDto } from '../common/zod-dto';
import { ParseIdPipe } from '../common/parse-id.pipe';
import { ActivityService } from './activity.service';

class ActivityQueryDto extends createZodDto(activityQuerySchema) {}

@ApiTags('activity')
@Controller()
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get('workspaces/:workspaceId/activity')
  @RequireRole('activity.read')
  @ApiOperation({ summary: 'Workspace activity, newest first' })
  @ApiZodResponse(200, activityPageSchema)
  forWorkspace(
    @CurrentAccess() access: AccessContext,
    @Query() query: ActivityQueryDto,
  ): Promise<ActivityPage> {
    return this.activity.list({ workspaceId: access.workspaceId }, query);
  }

  @Get('boards/:boardId/activity')
  @RequireRole('activity.read')
  @ApiOperation({ summary: 'Board activity, newest first' })
  @ApiZodResponse(200, activityPageSchema)
  forBoard(
    @CurrentAccess() access: AccessContext,
    @Param('boardId', ParseIdPipe) boardId: string,
    @Query() query: ActivityQueryDto,
  ): Promise<ActivityPage> {
    return this.activity.list({ workspaceId: access.workspaceId, boardId }, query);
  }
}
