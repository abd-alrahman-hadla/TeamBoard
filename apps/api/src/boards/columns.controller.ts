import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type Column,
  columnSchema,
  createColumnInputSchema,
  moveColumnInputSchema,
  updateColumnInputSchema,
} from '@teamboard/shared';
import type { AccessContext } from '../access/access.types';
import { CurrentAccess } from '../access/current-access.decorator';
import { RequireRole } from '../access/require-role.decorator';
import { ApiZodBody, ApiZodResponse } from '../common/api-zod.decorators';
import { ParseIdPipe } from '../common/parse-id.pipe';
import { createZodDto } from '../common/zod-dto';
import { ColumnsService } from './columns.service';

class CreateColumnDto extends createZodDto(createColumnInputSchema) {}
class UpdateColumnDto extends createZodDto(updateColumnInputSchema) {}
class MoveColumnDto extends createZodDto(moveColumnInputSchema) {}

@ApiTags('columns')
@Controller()
export class ColumnsController {
  constructor(private readonly columns: ColumnsService) {}

  @Post('boards/:boardId/columns')
  @RequireRole('column.create')
  @ApiOperation({ summary: 'Add a column (after `afterId`; null = first; omitted = last)' })
  @ApiZodBody(CreateColumnDto.schema)
  @ApiZodResponse(HttpStatus.CREATED, columnSchema)
  create(
    @CurrentAccess() access: AccessContext,
    @Param('boardId', ParseIdPipe) boardId: string,
    @Body() body: CreateColumnDto,
  ): Promise<Column> {
    return this.columns.create(access, boardId, body);
  }

  @Patch('columns/:columnId')
  @RequireRole('column.update')
  @ApiOperation({ summary: 'Rename a column' })
  @ApiZodBody(UpdateColumnDto.schema)
  @ApiZodResponse(HttpStatus.OK, columnSchema)
  update(
    @CurrentAccess() access: AccessContext,
    @Param('columnId', ParseIdPipe) columnId: string,
    @Body() body: UpdateColumnDto,
  ): Promise<Column> {
    return this.columns.update(access, columnId, body);
  }

  @Post('columns/:columnId/move')
  @HttpCode(HttpStatus.OK)
  @RequireRole('column.move')
  @ApiOperation({ summary: 'Reorder a column (after `afterId`; null = first). Updates one row.' })
  @ApiZodBody(MoveColumnDto.schema)
  @ApiZodResponse(HttpStatus.OK, columnSchema)
  move(
    @CurrentAccess() access: AccessContext,
    @Param('columnId', ParseIdPipe) columnId: string,
    @Body() body: MoveColumnDto,
  ): Promise<Column> {
    return this.columns.move(access, columnId, body);
  }

  @Delete('columns/:columnId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireRole('column.delete')
  @ApiOperation({ summary: 'Delete a column and its cards' })
  delete(
    @CurrentAccess() access: AccessContext,
    @Param('columnId', ParseIdPipe) columnId: string,
  ): Promise<void> {
    return this.columns.delete(access, columnId);
  }
}
