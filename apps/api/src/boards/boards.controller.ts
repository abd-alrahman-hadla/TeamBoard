import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type Board,
  type BoardDetail,
  boardDetailSchema,
  boardSchema,
  createBoardInputSchema,
  updateBoardInputSchema,
} from '@teamboard/shared';
import { z } from 'zod';
import type { AccessContext } from '../access/access.types';
import { CurrentAccess } from '../access/current-access.decorator';
import { RequireRole } from '../access/require-role.decorator';
import { ApiZodBody, ApiZodResponse } from '../common/api-zod.decorators';
import { ParseIdPipe } from '../common/parse-id.pipe';
import { createZodDto } from '../common/zod-dto';
import { BoardsService } from './boards.service';

class CreateBoardDto extends createZodDto(createBoardInputSchema) {}
class UpdateBoardDto extends createZodDto(updateBoardInputSchema) {}

@ApiTags('boards')
@Controller()
export class BoardsController {
  constructor(private readonly boards: BoardsService) {}

  @Post('workspaces/:workspaceId/boards')
  @RequireRole('board.create')
  @ApiOperation({ summary: 'Create a board' })
  @ApiZodBody(CreateBoardDto.schema)
  @ApiZodResponse(HttpStatus.CREATED, boardSchema)
  create(@CurrentAccess() access: AccessContext, @Body() body: CreateBoardDto): Promise<Board> {
    return this.boards.create(access, body);
  }

  @Get('workspaces/:workspaceId/boards')
  @RequireRole('board.read')
  @ApiOperation({ summary: 'Boards in a workspace' })
  @ApiZodResponse(HttpStatus.OK, z.array(boardSchema))
  list(@CurrentAccess() access: AccessContext): Promise<Board[]> {
    return this.boards.list(access);
  }

  @Get('boards/:boardId')
  @RequireRole('board.read')
  @ApiOperation({ summary: 'A board with its ordered columns and cards' })
  @ApiZodResponse(HttpStatus.OK, boardDetailSchema)
  detail(
    @CurrentAccess() access: AccessContext,
    @Param('boardId', ParseIdPipe) boardId: string,
  ): Promise<BoardDetail> {
    return this.boards.detail(access, boardId);
  }

  @Patch('boards/:boardId')
  @RequireRole('board.update')
  @ApiOperation({ summary: 'Rename or describe a board' })
  @ApiZodBody(UpdateBoardDto.schema)
  @ApiZodResponse(HttpStatus.OK, boardSchema)
  update(
    @CurrentAccess() access: AccessContext,
    @Param('boardId', ParseIdPipe) boardId: string,
    @Body() body: UpdateBoardDto,
  ): Promise<Board> {
    return this.boards.update(access, boardId, body);
  }

  @Delete('boards/:boardId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireRole('board.delete')
  @ApiOperation({ summary: 'Delete a board and everything on it' })
  delete(
    @CurrentAccess() access: AccessContext,
    @Param('boardId', ParseIdPipe) boardId: string,
  ): Promise<void> {
    return this.boards.delete(access, boardId);
  }
}
