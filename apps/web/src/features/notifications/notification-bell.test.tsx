import type { Notification } from '@teamboard/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EventEmitter } from 'node:events';
import type { ReactNode } from 'react';
import { badgeText, NotificationBell } from './notification-bell';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('sonner', () => ({ toast: vi.fn() }));

const socket = new EventEmitter();
vi.mock('@/lib/socket', () => ({
  connectSocket: () => ({ connected: true, on: socket.on.bind(socket), off: socket.off.bind(socket) }),
}));

const notification = (id: string, over: Partial<Notification> = {}): Notification => ({
  id,
  type: 'ASSIGNED',
  actor: { id: '0195a000-0000-7000-8000-00000000000a', name: 'Ada' },
  workspaceId: '0195a000-0000-7000-8000-000000000002',
  boardId: '0195a000-0000-7000-8000-000000000003',
  cardId: '0195a000-0000-7000-8000-000000000004',
  commentId: null,
  cardTitle: 'Login page',
  boardName: 'Launch',
  excerpt: null,
  readAt: null,
  createdAt: new Date().toISOString(),
  ...over,
});

const server = {
  unread: 1,
  items: [notification('0195a000-0000-7000-8000-0000000000f1')],
  posted: [] as string[],
};
vi.mock('@/lib/api-client', () => ({
  apiJson: (path: string, schema: { parse: (v: unknown) => unknown }) =>
    Promise.resolve(
      schema.parse(
        path.startsWith('/notifications/unread-count')
          ? { count: server.unread }
          : { items: server.items, nextCursor: null },
      ),
    ),
  apiVoid: (path: string) => {
    server.posted.push(path);
    server.unread = 0;
    server.items = server.items.map((n) => ({ ...n, readAt: new Date().toISOString() }));
    return Promise.resolve();
  },
}));

function renderBell() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<NotificationBell />, { wrapper });
}

describe('NotificationBell', () => {
  it('caps the badge at 99+', () => {
    expect(badgeText(7)).toBe('7');
    expect(badgeText(120)).toBe('99+');
  });

  it('shows the unread count, bumps it live, and opens a notification', async () => {
    renderBell();
    await waitFor(() => expect(screen.getByTestId('unread-badge')).toHaveTextContent('1'));

    act(() => {
      socket.emit(
        'notification:new',
        notification('0195a000-0000-7000-8000-0000000000f2', { type: 'MENTIONED' }),
      );
    });
    await waitFor(() => expect(screen.getByTestId('unread-badge')).toHaveTextContent('2'));
    expect(screen.getByRole('button', { name: 'Notifications, 2 unread' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    const item = await screen.findByRole('button', { name: /Ada assigned you to 'Login page'/ });
    await userEvent.click(item);

    expect(server.posted).toEqual(['/notifications/0195a000-0000-7000-8000-0000000000f1/read']);
    expect(push).toHaveBeenCalledWith(
      '/b/0195a000-0000-7000-8000-000000000003?card=0195a000-0000-7000-8000-000000000004',
    );
    await waitFor(() => expect(screen.queryByTestId('unread-badge')).not.toBeInTheDocument());
  });
});
