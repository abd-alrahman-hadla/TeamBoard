import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { BoardsController } from './boards.controller';
import { BoardsService } from './boards.service';
import { CardsController } from './cards.controller';
import { CardsService } from './cards.service';
import { ColumnsController } from './columns.controller';
import { ColumnsService } from './columns.service';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';

/** Boards and everything on them: columns, cards, comments. */
@Module({
  imports: [WorkspacesModule],
  controllers: [BoardsController, ColumnsController, CardsController, CommentsController],
  providers: [BoardsService, ColumnsService, CardsService, CommentsService],
})
export class BoardsModule {}
