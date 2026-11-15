import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AUTH_COOKIES } from '@teamboard/shared';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { ZodValidationPipe } from './common/zod-validation.pipe';
import type { Env } from './config/env';

export const DOCS_PATH = 'docs';

function setupSwagger(app: NestExpressApplication): void {
  const config = new DocumentBuilder()
    .setTitle('TeamBoard API')
    .setDescription(
      'Real-time collaborative Kanban. Access tokens are Bearer JWTs; refresh uses the tb_rt cookie.',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .addCookieAuth(AUTH_COOKIES.refreshToken)
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(DOCS_PATH, app, document, { jsonDocumentUrl: `${DOCS_PATH}-json` });
}

/** Everything main.ts and the integration tests must share, so tests exercise the real HTTP stack. */
export function configureApp(app: NestExpressApplication, env: Env): void {
  app.useLogger(app.get(Logger));
  app.disable('x-powered-by');
  app.use(helmet());
  app.enableCors({
    origin: new URL(env.WEB_ORIGIN).origin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 600,
  });
  app.use(cookieParser());
  app.useGlobalPipes(new ZodValidationPipe());
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();
  if (env.SWAGGER_ENABLED) setupSwagger(app);
}
