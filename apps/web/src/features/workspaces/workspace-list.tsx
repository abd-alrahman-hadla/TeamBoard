'use client';

import type { MyWorkspace } from '@teamboard/shared';
import { useQuery } from '@tanstack/react-query';
import { KanbanSquareIcon } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { listBoards, listMyWorkspaces } from '@/features/boards/board-api';
import { queryKeys } from '@/features/boards/query-keys';

const ROLE_LABEL = { OWNER: 'Owner', ADMIN: 'Admin', MEMBER: 'Member', VIEWER: 'Viewer' } as const;

function WorkspaceBoards({ workspace }: { workspace: MyWorkspace }) {
  const boards = useQuery({
    queryKey: queryKeys.boards(workspace.id),
    queryFn: () => listBoards(workspace.id),
  });
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">
          <h2>{workspace.name}</h2>
        </CardTitle>
        <Badge variant="secondary">{ROLE_LABEL[workspace.role]}</Badge>
      </CardHeader>
      <CardContent>
        {boards.isPending && <Skeleton className="h-9 w-full" />}
        {boards.isError && <p className="text-destructive text-sm">Couldn’t load boards.</p>}
        {boards.data?.length === 0 && <p className="text-muted-foreground text-sm">No boards yet.</p>}
        {boards.data && boards.data.length > 0 && (
          <ul className="grid gap-2 sm:grid-cols-2">
            {boards.data.map((board) => (
              <li key={board.id}>
                <Link
                  href={`/b/${board.id}`}
                  className="hover:bg-muted focus-visible:ring-ring flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium outline-none focus-visible:ring-2"
                >
                  <KanbanSquareIcon className="text-muted-foreground size-4" aria-hidden />
                  {board.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** Your workspaces and their boards. (Creating workspaces and boards in the UI comes with the settings phase.) */
export function WorkspaceList() {
  const workspaces = useQuery({ queryKey: queryKeys.workspaces(), queryFn: listMyWorkspaces });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Workspaces</h1>
      {workspaces.isPending && <Skeleton className="h-32 w-full" />}
      {workspaces.isError && <p className="text-destructive text-sm">Couldn’t load your workspaces.</p>}
      {workspaces.data?.length === 0 && (
        <Card>
          <CardContent className="text-muted-foreground py-8 text-center text-sm">
            You’re not in any workspace yet. Ask a teammate for an invite link.
          </CardContent>
        </Card>
      )}
      <div className="space-y-4">
        {workspaces.data?.map((workspace) => (
          <WorkspaceBoards key={workspace.id} workspace={workspace} />
        ))}
      </div>
    </div>
  );
}
