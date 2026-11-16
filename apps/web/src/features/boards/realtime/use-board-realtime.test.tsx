import type { BoardDetail, BoardEvent, JoinBoardAck, Presence } from '@teamboard/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { cardByTitle, columnByName, makeBoard, titles } from '@/test/board-fixtures';
import { queryKeys } from '../query-keys';
import { useBoardRealtime } from './use-board-realtime';

/** Minimal stand-in for a socket.io client: records emits, lets the test fire server events. */
class FakeSocket {
  connected = false;
  emitted: { event: string; payload: unknown }[] = [];
  joinAck: JoinBoardAck = { ok: true };
  private handlers = new Map<string, Set<(payload: never) => void>>();

  on(event: string, handler: (payload: never) => void) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)?.add(handler);
    return this;
  }
  off(event: string, handler: (payload: never) => void) {
    this.handlers.get(event)?.delete(handler);
    return this;
  }
  emit(event: string, payload: unknown, ack?: (result: JoinBoardAck) => void) {
    this.emitted.push({ event, payload });
    if (ack) ack(this.joinAck);
    return this;
  }
  fire(event: string, payload?: unknown) {
    for (const handler of this.handlers.get(event) ?? []) (handler as (p: unknown) => void)(payload);
  }
  connectNow() {
    this.connected = true;
    this.fire('connect');
  }
  dropNow() {
    this.connected = false;
    this.fire('disconnect');
  }
}

const fake = new FakeSocket();
vi.mock('@/lib/socket', () => ({ connectSocket: () => fake }));
vi.mock('@/lib/client-id', () => ({ getClientId: () => 'my-tab' }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { info: vi.fn() } }));

const board = makeBoard({ Todo: ['a', 'b'], Done: [] });

function setup() {
  const queryClient = new QueryClient();
  queryClient.setQueryData(queryKeys.board(board.id), board);
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useBoardRealtime(board.id, board.workspaceId, true), { wrapper });
  const cached = () => queryClient.getQueryData<BoardDetail>(queryKeys.board(board.id)) as BoardDetail;
  const boardInvalidations = () =>
    invalidate.mock.calls.filter(
      ([filters]) => JSON.stringify(filters?.queryKey) === JSON.stringify(['board', board.id]),
    ).length;
  return { hook, cached, boardInvalidations };
}

function moveEvent(originClientId: string | null): BoardEvent {
  const a = cardByTitle(board, 'a');
  return {
    type: 'card.moved',
    boardId: board.id,
    actorId: '0195a000-0000-7000-8000-000000000009',
    originClientId,
    at: '2026-11-16T10:00:00.000Z',
    payload: {
      card: { ...a, columnId: columnByName(board, 'Done').id, version: 2 },
      fromColumnId: a.columnId,
    },
  };
}

describe('useBoardRealtime', () => {
  beforeEach(() => {
    fake.connected = false;
    fake.emitted = [];
    fake.joinAck = { ok: true };
  });

  it('joins the board on connect and refetches it to catch up', () => {
    const { hook, boardInvalidations } = setup();
    expect(hook.result.current.connected).toBeNull();
    act(() => fake.connectNow());
    expect(fake.emitted[0]).toEqual({ event: 'board:join', payload: { boardId: board.id } });
    expect(hook.result.current.connected).toBe(true);
    expect(boardInvalidations()).toBe(1);
  });

  it('applies other tabs’ changes to the cache and skips its own echoes', () => {
    const { cached } = setup();
    act(() => fake.connectNow());

    act(() => fake.fire('board:event', moveEvent('my-tab')));
    expect(titles(cached()).Done).toEqual([]);

    act(() => fake.fire('board:event', moveEvent('someone-else')));
    expect(titles(cached())).toEqual({ Todo: ['b'], Done: ['a'] });
  });

  it('rejoins and refetches after a reconnect, and reports the gap', () => {
    const { hook, boardInvalidations } = setup();
    act(() => fake.connectNow());
    act(() => fake.dropNow());
    expect(hook.result.current.connected).toBe(false);
    act(() => fake.connectNow());
    expect(fake.emitted.filter((e) => e.event === 'board:join')).toHaveLength(2);
    expect(boardInvalidations()).toBe(2);
  });

  it('tracks presence for this board only', () => {
    const { hook } = setup();
    act(() => fake.connectNow());
    const presence: Presence = {
      boardId: board.id,
      viewers: [{ userId: '0195a000-0000-7000-8000-000000000009', name: 'Ada' }],
      editing: {},
    };
    act(() => fake.fire('presence:update', { ...presence, boardId: '0195a000-0000-7000-8000-0000000000ff' }));
    expect(hook.result.current.presence).toBeNull();
    act(() => fake.fire('presence:update', presence));
    expect(hook.result.current.presence).toEqual(presence);
  });

  it('flags lost access (revocation, or a refused join)', () => {
    const { hook } = setup();
    act(() => fake.connectNow());
    act(() => fake.fire('access:revoked', { workspaceId: board.workspaceId }));
    expect(hook.result.current.revoked).toBe(true);

    fake.joinAck = { ok: false, code: 'not_found' };
    const second = setup();
    act(() => fake.connectNow());
    expect(second.hook.result.current.revoked).toBe(true);
  });

  it('announces which card is being edited, and leaves on unmount', () => {
    const { hook } = setup();
    act(() => fake.connectNow());
    act(() => hook.result.current.setEditing('card-1'));
    expect(fake.emitted.at(-1)).toEqual({
      event: 'card:editing',
      payload: { boardId: board.id, cardId: 'card-1' },
    });
    hook.unmount();
    expect(fake.emitted.at(-1)).toEqual({ event: 'board:leave', payload: { boardId: board.id } });
  });
});
