import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type Card,
  cardSchema,
  createCardInputSchema,
  moveCardInputSchema,
  updateCardInputSchema,
} from '@teamboard/shared';
import type { AccessContext } from '../access/access.types';
import { CurrentAccess } from '../access/current-access.decorator';
import { RequireRole } from '../access/require-role.decorator';
import { ApiErrorResponse, ApiZodBody, ApiZodResponse } from '../common/api-zod.decorators';
import { ParseIdPipe } from '../common/parse-id.pipe';
import { createZodDto } from '../common/zod-dto';
import { CardsService } from './cards.service';

class CreateCardDto extends createZodDto(createCardInputSchema) {}
class UpdateCardDto extends createZodDto(updateCardInputSchema) {}
class MoveCardDto extends createZodDto(moveCardInputSchema) {}

@ApiTags('cards')
@Controller()
export class CardsController {
  constructor(private readonly cards: CardsService) {}

  @Post('columns/:columnId/cards')
  @RequireRole('card.create')
  @ApiOperation({ summary: 'Add a card (after `afterId`; null = first; omitted = last)' })
  @ApiZodBody(CreateCardDto.schema)
  @ApiZodResponse(HttpStatus.CREATED, cardSchema)
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    'Validation failed, or an assignee is not a member (invalid_assignee)',
  )
  create(
    @CurrentAccess() access: AccessContext,
    @Param('columnId', ParseIdPipe) columnId: string,
    @Body() body: CreateCardDto,
  ): Promise<Card> {
    return this.cards.create(access, columnId, body);
  }

  @Get('cards/:cardId')
  @RequireRole('card.read')
  @ApiOperation({ summary: 'One card' })
  @ApiZodResponse(HttpStatus.OK, cardSchema)
  get(@CurrentAccess() access: AccessContext, @Param('cardId', ParseIdPipe) cardId: string): Promise<Card> {
    return this.cards.get(access, cardId);
  }

  @Patch('cards/:cardId')
  @RequireRole('card.update')
  @ApiOperation({ summary: 'Edit a card' })
  @ApiZodBody(UpdateCardDto.schema)
  @ApiZodResponse(HttpStatus.OK, cardSchema)
  update(
    @CurrentAccess() access: AccessContext,
    @Param('cardId', ParseIdPipe) cardId: string,
    @Body() body: UpdateCardDto,
  ): Promise<Card> {
    return this.cards.update(access, cardId, body);
  }

  @Post('cards/:cardId/move')
  @HttpCode(HttpStatus.OK)
  @RequireRole('card.move')
  @ApiOperation({
    summary: 'Move a card to a column on the same board, after `afterId` (null = first). Updates one row.',
  })
  @ApiZodBody(MoveCardDto.schema)
  @ApiZodResponse(HttpStatus.OK, cardSchema)
  move(
    @CurrentAccess() access: AccessContext,
    @Param('cardId', ParseIdPipe) cardId: string,
    @Body() body: MoveCardDto,
  ): Promise<Card> {
    return this.cards.move(access, cardId, body);
  }

  @Delete('cards/:cardId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireRole('card.delete')
  @ApiOperation({ summary: 'Delete a card' })
  delete(
    @CurrentAccess() access: AccessContext,
    @Param('cardId', ParseIdPipe) cardId: string,
  ): Promise<void> {
    return this.cards.delete(access, cardId);
  }
}
