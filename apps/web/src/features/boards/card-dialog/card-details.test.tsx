import type { Card, Member } from '@teamboard/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { makeCard } from '@/test/board-fixtures';
import { jsonResponse, mockFetch } from '@/test/fetch-mock';
import { fromDueIso } from '../due-date';
import { boardPermissions } from '../permissions';
import { TitleField } from './card-fields';
import { CardDetails, type CardDetailsProps } from './card-details';

vi.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({
    state: { status: 'authenticated', user: { id: 'u-me', name: 'Me', email: 'me@test.dev' } },
  }),
}));

const ADA: Member = {
  userId: 'a0000000-0000-4000-8000-000000000001',
  name: 'Ada Lovelace',
  email: 'ada@test.dev',
  role: 'MEMBER',
  joinedAt: '2026-11-01T00:00:00.000Z',
};

function setup(overrides: Partial<CardDetailsProps> & { card?: Card } = {}) {
  // Comments and activity panels load their own data.
  mockFetch(
    () => jsonResponse(200, []),
    () => jsonResponse(200, { items: [], nextCursor: null }),
    () => jsonResponse(200, []),
  );
  const onSave = vi.fn();
  const onDelete = vi.fn();
  const props: CardDetailsProps = {
    card: makeCard({ columnId: 'col-1', position: 'a0', title: 'Ship it', labels: ['ui'] }),
    columnName: () => 'To do',
    members: [ADA],
    labelSuggestions: ['ui', 'bug'],
    permissions: boardPermissions('MEMBER'),
    now: new Date(2026, 10, 15, 10),
    onSave,
    onDelete,
    ...overrides,
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
  );
  render(<CardDetails {...props} />, { wrapper });
  return { onSave, onDelete, props };
}

describe('CardDetails (editor)', () => {
  it('adds and removes labels', async () => {
    const { onSave } = setup();
    await userEvent.type(screen.getByRole('combobox', { name: 'Add label' }), 'backend{Enter}');
    expect(onSave).toHaveBeenLastCalledWith({ labels: ['ui', 'backend'] });
    await userEvent.click(screen.getByRole('button', { name: 'Remove label ui' }));
    expect(onSave).toHaveBeenLastCalledWith({ labels: [] });
  });

  it('ignores duplicate labels', async () => {
    const { onSave } = setup();
    await userEvent.type(screen.getByRole('combobox', { name: 'Add label' }), 'ui{Enter}');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('sets and clears the due date as end-of-day ISO', async () => {
    const { onSave } = setup();
    const input = screen.getByLabelText('Due date');
    await userEvent.type(input, '2026-12-01');
    const patch = onSave.mock.lastCall?.[0] as { dueDate: string };
    expect(fromDueIso(patch.dueDate)).toBe('2026-12-01');
    expect(new Date(patch.dueDate).getHours()).toBe(23);
  });

  it('assigns a member from the picker', async () => {
    const { onSave } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Assign members' }));
    await userEvent.click(await screen.findByRole('checkbox'));
    expect(onSave).toHaveBeenLastCalledWith({ assigneeIds: [ADA.userId] });
  });

  it('saves the markdown description and previews it', async () => {
    const { onSave } = setup();
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Description (markdown)' }),
      '## Plan{Enter}- [[ ] write tests',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenLastCalledWith({ description: '## Plan\n- [ ] write tests' });
  });

  it('shows the comment composer and the delete button', () => {
    setup();
    expect(screen.getByRole('combobox', { name: 'Write a comment' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete card' })).toBeInTheDocument();
  });
});

describe('CardDetails (viewer)', () => {
  const card = makeCard({
    columnId: 'col-1',
    position: 'a0',
    title: 'Read me',
    description: '## Heading\n\n- [x] done item\n\n<script>alert(1)</script>',
    labels: ['docs'],
    assigneeIds: [ADA.userId],
  });

  it('is read-only: no inputs, composer or delete', async () => {
    setup({ card, permissions: boardPermissions('VIEWER') });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete card' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Assign members' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Due date')).not.toBeInTheDocument();
    // …but sees everything.
    expect(screen.getByText('docs')).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Assignees' })).getByText('Ada Lovelace'),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('No comments yet.')).toBeInTheDocument());
  });

  it('renders markdown (GFM task lists) but never raw HTML', () => {
    const { props } = setup({ card, permissions: boardPermissions('VIEWER') });
    expect(screen.getByRole('heading', { name: 'Heading' })).toBeInTheDocument();
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeChecked();
    expect(checkbox).toBeDisabled();
    expect(document.querySelector('script')).toBeNull();
    expect(props.onSave).not.toHaveBeenCalled();
  });
});

describe('TitleField', () => {
  it('saves a trimmed title on Enter and restores an empty one', async () => {
    const onSave = vi.fn();
    const card = makeCard({ columnId: 'c', position: 'a0', title: 'Old' });
    render(<TitleField card={card} editable onSave={onSave} />);
    const input = screen.getByRole('textbox', { name: 'Card title' });
    await userEvent.clear(input);
    await userEvent.type(input, '  New title {Enter}');
    expect(onSave).toHaveBeenCalledWith({ title: 'New title' });

    onSave.mockClear();
    await userEvent.clear(input);
    await userEvent.tab();
    expect(onSave).not.toHaveBeenCalled();
    expect(input).toHaveValue('Old');
  });
});
