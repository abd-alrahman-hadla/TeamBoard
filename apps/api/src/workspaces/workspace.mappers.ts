import type { Member, MyWorkspace, Role, Workspace } from '@teamboard/shared';

interface WorkspaceRow {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export function toWorkspaceDto(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toMyWorkspaceDto(row: WorkspaceRow, role: Role): MyWorkspace {
  return { ...toWorkspaceDto(row), role };
}

export function toMemberDto(row: {
  role: Role;
  createdAt: Date;
  user: { id: string; name: string; email: string };
}): Member {
  return {
    userId: row.user.id,
    name: row.user.name,
    email: row.user.email,
    role: row.role,
    joinedAt: row.createdAt.toISOString(),
  };
}
