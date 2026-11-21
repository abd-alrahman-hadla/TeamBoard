import { DEMO_BOARD_ID } from '@teamboard/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api-client';
import type * as ApiClientModule from '@/lib/api-client';
import { ResetDemoButton, showResetDemo } from './reset-demo-button';

const apiVoid = vi.fn<(path: string, init?: RequestInit) => Promise<void>>();
vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiClientModule>()),
  apiVoid: (path: string, init?: RequestInit) => apiVoid(path, init),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderButton(onReset = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  render(<ResetDemoButton onReset={onReset} />, { wrapper });
  return onReset;
}

describe('showResetDemo', () => {
  it('only on the demo board, only in demo mode', () => {
    expect(showResetDemo(DEMO_BOARD_ID, true)).toBe(true);
    expect(showResetDemo(DEMO_BOARD_ID, false)).toBe(false);
    expect(showResetDemo('0195a000-0000-7000-8000-000000000002', true)).toBe(false);
  });
});

describe('ResetDemoButton', () => {
  beforeEach(() => {
    apiVoid.mockReset();
    vi.mocked(toast.success).mockReset();
    vi.mocked(toast.error).mockReset();
  });

  it('asks first, then resets and closes any open card', async () => {
    apiVoid.mockResolvedValue(undefined);
    const onReset = renderButton();

    await userEvent.click(screen.getByRole('button', { name: 'Reset demo' }));
    expect(apiVoid).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog', { name: 'Reset the demo?' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Reset demo' }));
    expect(apiVoid).toHaveBeenCalledWith('/demo/reset', { method: 'POST' });
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(onReset).toHaveBeenCalled();
  });

  it('shows the cooldown message from the API', async () => {
    apiVoid.mockRejectedValue(
      new ApiError(429, 'rate_limited', 'The demo was just reset. Try again in 42 seconds.'),
    );
    const onReset = renderButton();
    await userEvent.click(screen.getByRole('button', { name: 'Reset demo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reset demo' }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('The demo was just reset. Try again in 42 seconds.'),
    );
    expect(onReset).not.toHaveBeenCalled();
  });
});
