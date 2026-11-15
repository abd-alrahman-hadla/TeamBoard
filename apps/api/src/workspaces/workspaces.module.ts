import { Module } from '@nestjs/common';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';
import { WorkspacesController } from './workspaces.controller';
import { WorkspacesService } from './workspaces.service';

@Module({
  controllers: [WorkspacesController, MembersController],
  providers: [WorkspacesService, MembersService],
  exports: [MembersService],
})
export class WorkspacesModule {}
