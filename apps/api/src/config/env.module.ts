import { type DynamicModule, Module } from '@nestjs/common';
import { APP_CONFIG, parseEnv, type RawEnv } from './env';

@Module({})
export class EnvModule {
  /** `overrides` win over process.env. Tests use them to pick the test DB, TTLs and limits. */
  static forRoot(overrides: RawEnv = {}): DynamicModule {
    return {
      module: EnvModule,
      global: true,
      providers: [{ provide: APP_CONFIG, useFactory: () => parseEnv({ ...process.env, ...overrides }) }],
      exports: [APP_CONFIG],
    };
  }
}
