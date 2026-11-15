import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import {
  AUTH_COOKIES,
  authResponseSchema,
  type AuthResponse,
  type User,
  userSchema,
} from '@teamboard/shared';
import type { Request, Response } from 'express';
import { ApiErrorResponse, ApiZodBody, ApiZodResponse } from '../common/api-zod.decorators';
import { OriginGuard } from '../common/origin.guard';
import { type Env, InjectEnv } from '../config/env';
import { AccessTokenGuard, type AuthContext } from './access-token.guard';
import { clearAuthCookies, setAuthCookies } from './auth-cookies';
import { LoginDto, RegisterDto } from './auth.dto';
import { AuthService, type Session } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import type { ClientMeta } from './refresh-token.service';
import { THROTTLE } from './throttle';

function clientMeta(req: Request): ClientMeta {
  return { userAgent: req.headers['user-agent'], ip: req.ip };
}

function readRefreshCookie(req: Request): string | undefined {
  const cookies: unknown = req.cookies;
  if (typeof cookies !== 'object' || cookies === null) return undefined;
  const value: unknown = (cookies as Record<string, unknown>)[AUTH_COOKIES.refreshToken];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

@ApiTags('auth')
@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @InjectEnv() private readonly env: Env,
  ) {}

  @Post('register')
  @SkipThrottle({ [THROTTLE.refresh]: true })
  @ApiOperation({ summary: 'Create an account and start a session' })
  @ApiZodBody(RegisterDto.schema)
  @ApiZodResponse(HttpStatus.CREATED, authResponseSchema, 'Sets the tb_rt refresh cookie')
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'Validation failed')
  @ApiErrorResponse(HttpStatus.CONFLICT, 'Email already registered (code: email_taken)')
  @ApiErrorResponse(HttpStatus.TOO_MANY_REQUESTS, 'Rate limited')
  async register(
    @Body() body: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.respond(res, await this.auth.register(body, clientMeta(req)));
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @SkipThrottle({ [THROTTLE.refresh]: true })
  @ApiOperation({ summary: 'Sign in with email and password' })
  @ApiZodBody(LoginDto.schema)
  @ApiZodResponse(HttpStatus.OK, authResponseSchema, 'Sets the tb_rt refresh cookie')
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, 'Invalid credentials (code: invalid_credentials)')
  @ApiErrorResponse(HttpStatus.TOO_MANY_REQUESTS, 'Rate limited')
  async login(
    @Body() body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.respond(res, await this.auth.login(body, clientMeta(req)));
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OriginGuard)
  @SkipThrottle({ [THROTTLE.auth]: true })
  @ApiCookieAuth(AUTH_COOKIES.refreshToken)
  @ApiOperation({
    summary: 'Rotate the refresh token and get a new access token',
    description:
      'Every call invalidates the presented refresh token. Presenting an already-rotated token revokes the whole token family.',
  })
  @ApiZodResponse(HttpStatus.OK, authResponseSchema, 'Sets a new tb_rt refresh cookie')
  @ApiErrorResponse(
    HttpStatus.UNAUTHORIZED,
    'Missing, invalid, expired (refresh_token_invalid) or reused (refresh_token_reused)',
  )
  @ApiErrorResponse(HttpStatus.FORBIDDEN, 'Origin is not the web app (forbidden_origin)')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<AuthResponse> {
    try {
      return this.respond(res, await this.auth.refresh(readRefreshCookie(req), clientMeta(req)));
    } catch (error) {
      clearAuthCookies(res, this.env);
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(OriginGuard)
  @SkipThrottle({ [THROTTLE.auth]: true })
  @ApiCookieAuth(AUTH_COOKIES.refreshToken)
  @ApiOperation({ summary: 'Revoke the current token family and clear auth cookies' })
  @ApiErrorResponse(HttpStatus.FORBIDDEN, 'Origin is not the web app (forbidden_origin)')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(readRefreshCookie(req));
    clearAuthCookies(res, this.env);
  }

  @Get('me')
  @UseGuards(AccessTokenGuard)
  @SkipThrottle({ [THROTTLE.auth]: true, [THROTTLE.refresh]: true })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'The signed-in user' })
  @ApiZodResponse(HttpStatus.OK, userSchema)
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, 'Missing or invalid access token')
  me(@CurrentUser() user: AuthContext): Promise<User> {
    return this.auth.me(user.userId);
  }

  private respond(res: Response, session: Session): AuthResponse {
    setAuthCookies(res, this.env, session.refreshToken);
    res.setHeader('Cache-Control', 'no-store');
    return session.body;
  }
}
