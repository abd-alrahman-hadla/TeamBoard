import type { Metadata } from 'next';
import { WorkspaceList } from '@/features/workspaces/workspace-list';

export const metadata: Metadata = { title: 'Workspaces · TeamBoard' };

export default function WorkspacesPage() {
  return <WorkspaceList />;
}
