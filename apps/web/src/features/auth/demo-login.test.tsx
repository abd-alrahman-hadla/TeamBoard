import { DEMO_PASSWORD } from '@teamboard/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DemoLogin } from './demo-login';

describe('DemoLogin', () => {
  it('signs in as the chosen demo user with the published password', async () => {
    const onLogin = vi.fn(() => Promise.resolve());
    render(<DemoLogin onLogin={onLogin} />);
    expect(screen.getByRole('heading', { name: 'Try the live demo' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Sign in as Omar' }));
    expect(onLogin).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'omar.demo@example.com' }),
      DEMO_PASSWORD,
    );
  });

  it('shows an error and re-enables the buttons when sign-in fails', async () => {
    const onLogin = vi.fn(() => Promise.reject(new Error('down')));
    render(<DemoLogin onLogin={onLogin} />);
    await userEvent.click(screen.getByRole('button', { name: 'Sign in as Sara' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in as Sara' })).toBeEnabled();
  });
});
