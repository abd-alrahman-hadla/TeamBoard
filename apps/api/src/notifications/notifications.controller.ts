import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type NotificationPage,
  notificationPageSchema,
  notificationQuerySchema,
  unreadCountSchema,
} from '@teamboard/shared';
import { AccessTokenGuard, type AuthContext } from '../auth/access-token.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ApiZodResponse } from '../common/api-zod.decorators';
import { ParseIdPipe } from '../common/parse-id.pipe';
import { createZodDto } from '../common/zod-dto';
import { NotificationsService } from './notifications.service';

class NotificationQueryDto extends createZodDto(notificationQuerySchema) {}

/** Your own notifications only: every query is filtered by the signed-in user. */
@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(AccessTokenGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Your notifications, newest first' })
  @ApiZodResponse(HttpStatus.OK, notificationPageSchema)
  list(@CurrentUser() user: AuthContext, @Query() query: NotificationQueryDto): Promise<NotificationPage> {
    return this.notifications.list(user.userId, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'How many of your notifications are unread' })
  @ApiZodResponse(HttpStatus.OK, unreadCountSchema)
  unreadCount(@CurrentUser() user: AuthContext): Promise<{ count: number }> {
    return this.notifications.unreadCount(user.userId);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Mark all your notifications read' })
  markAllRead(@CurrentUser() user: AuthContext): Promise<void> {
    return this.notifications.markAllRead(user.userId);
  }

  @Post(':notificationId/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Mark one of your notifications read' })
  markRead(
    @CurrentUser() user: AuthContext,
    @Param('notificationId', ParseIdPipe) notificationId: string,
  ): Promise<void> {
    return this.notifications.markRead(user.userId, notificationId);
  }
}
