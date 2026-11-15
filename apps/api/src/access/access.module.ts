import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WorkspaceResolver } from './workspace-resolver.service';
import { WorkspaceRoleGuard } from './workspace-role.guard';

/** Global so any controller can use @RequireRole (which needs AccessTokenGuard's TokenService too). */
@Global()
@Module({
  imports: [AuthModule],
  providers: [WorkspaceResolver, WorkspaceRoleGuard],
  exports: [AuthModule, WorkspaceResolver, WorkspaceRoleGuard],
})
export class AccessModule {}
