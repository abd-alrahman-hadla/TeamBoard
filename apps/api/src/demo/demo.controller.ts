import { Controller, Headers, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CLIENT_ID_HEADER } from '@teamboard/shared';
import { readClientId } from '../access/workspace-role.guard';
import { AccessTokenGuard, type AuthContext } from '../auth/access-token.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ApiErrorResponse } from '../common/api-zod.decorators';
import { DemoService } from './demo.service';

@ApiTags('demo')
@ApiBearerAuth()
@Controller('demo')
@UseGuards(AccessTokenGuard)
export class DemoController {
  constructor(private readonly demo: DemoService) {}

  @Post('reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Restore the public demo board (demo mode only, demo members only)' })
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'Demo mode is off, or you are not a demo member')
  @ApiErrorResponse(HttpStatus.TOO_MANY_REQUESTS, 'Reset less than a minute ago (code: rate_limited)')
  reset(
    @CurrentUser() user: AuthContext,
    @Headers(CLIENT_ID_HEADER) clientId: string | undefined,
  ): Promise<void> {
    return this.demo.reset(user.userId, readClientId(clientId));
  }
}
