import { type DynamicModule, Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AccessModule } from './access/access.module';
import { ActivityModule } from './activity/activity.module';
import { AuthModule } from './auth/auth.module';
import { THROTTLE } from './auth/throttle';
import { APP_CONFIG, type Env, type RawEnv } from './config/env';
import { EnvModule } from './config/env.module';
import { BoardsModule } from './boards/boards.module';
import { HealthModule } from './health/health.module';
import { InvitationsModule } from './invitations/invitations.module';
import { loggerOptions } from './logging/logger.options';
import { MailModule } from './mail/mail.module';
import { PrismaModule } from './prisma/prisma.module';
import { WorkspacesModule } from './workspaces/workspaces.module';

const ONE_MINUTE_MS = 60_000;

@Module({})
export class AppModule {
  /** `envOverrides` win over process.env (used by tests). */
  static forRoot(envOverrides: RawEnv = {}): DynamicModule {
    return {
      module: AppModule,
      imports: [
        EnvModule.forRoot(envOverrides),
        LoggerModule.forRootAsync({ inject: [APP_CONFIG], useFactory: (env: Env) => loggerOptions(env) }),
        // In-memory storage is per instance. Phase 7 (multiple instances) needs a Redis-backed store.
        ThrottlerModule.forRootAsync({
          inject: [APP_CONFIG],
          useFactory: (env: Env) => ({
            errorMessage: 'Too many requests, please slow down',
            throttlers: [
              { name: THROTTLE.auth, ttl: ONE_MINUTE_MS, limit: env.AUTH_RATE_LIMIT },
              { name: THROTTLE.refresh, ttl: ONE_MINUTE_MS, limit: env.AUTH_RATE_LIMIT * 6 },
            ],
          }),
        }),
        PrismaModule,
        MailModule,
        AuthModule,
        AccessModule,
        ActivityModule,
        HealthModule,
        WorkspacesModule,
        InvitationsModule,
        BoardsModule,
      ],
    };
  }
}
