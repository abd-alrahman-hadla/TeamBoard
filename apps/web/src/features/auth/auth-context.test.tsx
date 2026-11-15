import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { tokenStore } from '@/lib/auth/token-store';
import { authBody, jsonResponse, mockFetch } from '@/test/fetch-mock';
import { AuthProvider, useAuth } from './auth-context';

function Probe() {
  const { state, login, logout } = useAuth();
  return (
    <div>
      <p data-testid="status">{state.status}</p>
      <p data-testid="user">{state.user?.name ?? '-'}</p>
      <button type="button" onClick={() => void login({ email: 'ada@example.com', password: 'x' })}>
        login
      </button>
      <button type="button" onClick={() => void logout()}>
        logout
      </button>
    </div>
  );
}

function renderWithProviders(ui: ReactNode) {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>{ui}</AuthProvider>
    </QueryClientProvider>,
  );
}

const rejected = { statusCode: 401, error: 'Unauthorized', code: 'refresh_token_invalid', message: 'x' };

describe('AuthProvider', () => {
  afterEach(() => {
    tokenStore.clear();
    vi.useRealTimers();
  });

  it('signs in silently from the refresh cookie on mount', async () => {
    mockFetch(() => jsonResponse(200, authBody('token-1')));
    renderWithProviders(<Probe />);
    expect(screen.getByTestId('status')).toHaveTextContent('loading');
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(screen.getByTestId('user')).toHaveTextContent('Ada');
    expect(tokenStore.get()?.value).toBe('token-1');
  });

  it('is unauthenticated when there is no valid refresh cookie', async () => {
    mockFetch(() => jsonResponse(401, rejected));
    renderWithProviders(<Probe />);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));
  });

  it('logs in and out', async () => {
    const calls = mockFetch(
      () => jsonResponse(401, rejected),
      () => jsonResponse(200, authBody('token-1')),
      () => new Response(null, { status: 204 }),
    );
    renderWithProviders(<Probe />);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));

    await userEvent.click(screen.getByRole('button', { name: 'login' }));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));

    await userEvent.click(screen.getByRole('button', { name: 'logout' }));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));
    expect(tokenStore.get()).toBeNull();
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'POST http://api.test/auth/refresh',
      'POST http://api.test/auth/login',
      'POST http://api.test/auth/logout',
    ]);
  });

  it('refreshes proactively at 75% of the token lifetime', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const calls = mockFetch(
      () => jsonResponse(200, authBody('token-1', 100)),
      () => jsonResponse(200, authBody('token-2', 100)),
    );
    renderWithProviders(<Probe />);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(75_000);
    });
    await waitFor(() => expect(tokenStore.get()?.value).toBe('token-2'));
    expect(calls).toHaveLength(2);
  });

  it('signs out when a background refresh fails (e.g. the token family was revoked)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockFetch(
      () => jsonResponse(200, authBody('token-1', 100)),
      () => jsonResponse(401, { ...rejected, code: 'refresh_token_reused' }),
    );
    renderWithProviders(<Probe />);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(75_000);
    });
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));
  });
});
