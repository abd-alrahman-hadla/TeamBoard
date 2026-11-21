import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';

/** Public demo support: the in-app reset (POST /demo/reset), active only with DEMO_MODE=true. */
@Module({
  imports: [AuthModule],
  controllers: [DemoController],
  providers: [DemoService],
})
export class DemoModule {}
