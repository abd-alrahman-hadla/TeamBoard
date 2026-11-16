import type { Member } from '@teamboard/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MentionTextarea } from './mention-textarea';

const member = (userId: string, name: string): Member => ({
  userId,
  name,
  email: `${name.split(' ')[0]?.toLowerCase() ?? 'x'}@example.com`,
  role: 'MEMBER',
  joinedAt: '2026-11-01T00:00:00.000Z',
});
const ADA = member('0195a000-0000-7000-8000-00000000000a', 'Ada Lovelace');
const ALAN = member('0195a000-0000-7000-8000-00000000000c', 'Alan Turing');
const ME = member('0195a000-0000-7000-8000-00000000000d', 'Me Myself');

function Harness({ onKeyDown }: { onKeyDown?: () => void }) {
  const [value, setValue] = useState('');
  return (
    <>
      <MentionTextarea
        aria-label="Write a comment"
        value={value}
        onValueChange={setValue}
        members={[ADA, ALAN, ME]}
        meId={ME.userId}
        {...(onKeyDown ? { onKeyDown } : {})}
      />
      <output data-testid="value">{value}</output>
    </>
  );
}

describe('MentionTextarea', () => {
  it('suggests members after @ and inserts a token with the keyboard', async () => {
    render(<Harness />);
    const box = screen.getByRole('combobox', { name: 'Write a comment' });
    await userEvent.type(box, 'Hey @a');

    const options = screen.getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Ada Lovelace', 'Alan Turing']);
    expect(box).toHaveAttribute('aria-expanded', 'true');

    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(screen.getByTestId('value')).toHaveTextContent(`Hey @[Alan Turing](${ALAN.userId})`);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('never suggests yourself, and Escape closes the list without bubbling', async () => {
    const onKeyDown = vi.fn();
    render(<Harness onKeyDown={onKeyDown} />);
    const box = screen.getByRole('combobox', { name: 'Write a comment' });
    await userEvent.type(box, '@m');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    await userEvent.clear(box);
    await userEvent.type(box, '@ad');
    onKeyDown.mockClear();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onKeyDown).not.toHaveBeenCalled();
  });

  it('picks with the mouse', async () => {
    render(<Harness />);
    await userEvent.type(screen.getByRole('combobox', { name: 'Write a comment' }), '@ad');
    await userEvent.click(screen.getByRole('option', { name: 'Ada Lovelace' }));
    expect(screen.getByTestId('value')).toHaveTextContent(`@[Ada Lovelace](${ADA.userId})`);
  });
});
