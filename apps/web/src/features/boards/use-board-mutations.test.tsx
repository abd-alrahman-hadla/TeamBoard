import type { BoardDetail } from '@teamboard/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { cardByTitle, columnByName, makeBoard, titles } from '@/test/board-fixtures';
import { jsonResponse, mockFetch } from '@/test/fetch-mock';
import { queryKeys } from './query-keys';
import { useBoardMutations } from './use-board-mutations';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const forbidden = { statusCode: 403, error: 'Forbidden', code: 'forbidden', message: 'nope' };

function setup(board: BoardDetail) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  queryClient.setQueryData(queryKeys.board(board.id), board);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useBoardMutations(board.id), { wrapper });
  const cached = () => queryClient.getQueryData<BoardDetail>(queryKeys.board(board.id));
  return { result, cached };
}

describe('useBoardMutations', () => {
  const board = makeBoard({ Todo: ['a', 'b'], Done: [] });
  const a = cardByTitle(board, 'a');
  const done = columnByName(board, 'Done');

  it('moves immediately, then keeps the server version', async () => {
    let release: (value: Response) => void = () => undefined;
    mockFetch(
      () => new Promise<Response>((resolve) => (release = resolve)),
      () => jsonResponse(200, board), // reconcile refetch
    );
    const { result, cached } = setup(board);

    await act(() => result.current.moveCard(a.id, done.id, null));
    expect(titles(cached() as BoardDetail)).toEqual({ Todo: ['b'], Done: ['a'] }); // before the server answered

    const serverCard = { ...a, columnId: done.id, position: 'a0', version: 2 };
    act(() => release(jsonResponse(200, serverCard)));
    await waitFor(() => expect(cardByTitle(cached() as BoardDetail, 'a').version).toBe(2));
  });

  it('rolls back and explains with a toast when the server rejects the move', async () => {
    mockFetch(
      () => jsonResponse(403, forbidden),
      () => jsonResponse(200, board),
    );
    const { result, cached } = setup(board);

    await act(() => result.current.moveCard(a.id, done.id, null));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("You don't have permission to do that."));
    expect(titles(cached() as BoardDetail)).toEqual({ Todo: ['a', 'b'], Done: [] });
  });

  it('removes an optimistic new card if creation fails', async () => {
    mockFetch(
      () =>
        jsonResponse(500, {
          statusCode: 500,
          error: 'Internal Server Error',
          code: 'internal_error',
          message: 'x',
        }),
      () => jsonResponse(200, board),
    );
    const { result, cached } = setup(board);
    const placeholder = { ...a, id: 'temp-1', title: 'new', position: 'a5' };

    await act(() =>
      result.current.createCard(done.id, { title: 'new' }, { ...placeholder, columnId: done.id }),
    );
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(titles(cached() as BoardDetail).Done).toEqual([]);
  });
});
