import type { Metadata } from 'next';
import { WorkspacesPlaceholder } from '@/features/workspaces/workspaces-placeholder';

export const metadata: Metadata = { title: 'Workspaces · TeamBoard' };

export default function WorkspacesPage() {
  return <WorkspacesPlaceholder />;
}
