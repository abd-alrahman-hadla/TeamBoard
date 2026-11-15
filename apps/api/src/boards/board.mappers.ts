import type { Board, BoardDetail, Card, Column, Comment } from '@teamboard/shared';

interface BoardRow {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

interface ColumnRow {
  id: string;
  boardId: string;
  name: string;
  position: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

interface CardRow {
  id: string;
  boardId: string;
  columnId: string;
  title: string;
  description: string | null;
  labels: string[];
  dueDate: Date | null;
  assigneeIds: string[];
  position: string;
  version: number;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface CommentRow {
  id: string;
  cardId: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  author: { id: string; name: string } | null;
}

export function toBoardDto(row: BoardRow): Board {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    description: row.description,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toColumnDto(row: ColumnRow): Column {
  return {
    id: row.id,
    boardId: row.boardId,
    name: row.name,
    position: row.position,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toCardDto(row: CardRow): Card {
  return {
    id: row.id,
    boardId: row.boardId,
    columnId: row.columnId,
    title: row.title,
    description: row.description,
    labels: row.labels,
    dueDate: row.dueDate?.toISOString() ?? null,
    assigneeIds: row.assigneeIds,
    position: row.position,
    version: row.version,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toBoardDetailDto(
  row: BoardRow & { columns: (ColumnRow & { cards: CardRow[] })[] },
): BoardDetail {
  return {
    ...toBoardDto(row),
    columns: row.columns.map((column) => ({ ...toColumnDto(column), cards: column.cards.map(toCardDto) })),
  };
}

export function toCommentDto(row: CommentRow): Comment {
  return {
    id: row.id,
    cardId: row.cardId,
    author: row.author,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
