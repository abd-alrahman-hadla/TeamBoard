import type { Metadata } from 'next';
import { BoardView } from '@/features/boards/board-view';

export const metadata: Metadata = { title: 'Board · TeamBoard' };

export default async function BoardPage({ params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params;
  return <BoardView boardId={boardId} />;
}
