import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type Comment,
  commentSchema,
  createCommentInputSchema,
  updateCommentInputSchema,
} from '@teamboard/shared';
import { z } from 'zod';
import type { AccessContext } from '../access/access.types';
import { CurrentAccess } from '../access/current-access.decorator';
import { RequireRole } from '../access/require-role.decorator';
import { ApiZodBody, ApiZodResponse } from '../common/api-zod.decorators';
import { ParseIdPipe } from '../common/parse-id.pipe';
import { createZodDto } from '../common/zod-dto';
import { CommentsService } from './comments.service';

class CreateCommentDto extends createZodDto(createCommentInputSchema) {}
class UpdateCommentDto extends createZodDto(updateCommentInputSchema) {}

@ApiTags('comments')
@Controller()
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get('cards/:cardId/comments')
  @RequireRole('comment.read')
  @ApiOperation({ summary: 'Comments on a card, oldest first' })
  @ApiZodResponse(HttpStatus.OK, z.array(commentSchema))
  list(
    @CurrentAccess() access: AccessContext,
    @Param('cardId', ParseIdPipe) cardId: string,
  ): Promise<Comment[]> {
    return this.comments.list(access, cardId);
  }

  @Post('cards/:cardId/comments')
  @RequireRole('comment.create')
  @ApiOperation({ summary: 'Comment on a card' })
  @ApiZodBody(CreateCommentDto.schema)
  @ApiZodResponse(HttpStatus.CREATED, commentSchema)
  create(
    @CurrentAccess() access: AccessContext,
    @Param('cardId', ParseIdPipe) cardId: string,
    @Body() body: CreateCommentDto,
  ): Promise<Comment> {
    return this.comments.create(access, cardId, body);
  }

  @Patch('comments/:commentId')
  @RequireRole('comment.update')
  @ApiOperation({ summary: 'Edit your comment' })
  @ApiZodBody(UpdateCommentDto.schema)
  @ApiZodResponse(HttpStatus.OK, commentSchema)
  update(
    @CurrentAccess() access: AccessContext,
    @Param('commentId', ParseIdPipe) commentId: string,
    @Body() body: UpdateCommentDto,
  ): Promise<Comment> {
    return this.comments.update(access, commentId, body);
  }

  @Delete('comments/:commentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireRole('comment.delete')
  @ApiOperation({ summary: 'Delete a comment (author, or admin+)' })
  delete(
    @CurrentAccess() access: AccessContext,
    @Param('commentId', ParseIdPipe) commentId: string,
  ): Promise<void> {
    return this.comments.delete(access, commentId);
  }
}
