import type { Member } from '@teamboard/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type CardFilters, EMPTY_FILTERS } from './filter-cards';
import { FilterToolbar } from './filter-toolbar';

const ADA: Member = {
  userId: 'a0000000-0000-4000-8000-000000000001',
  name: 'Ada',
  email: 'ada@test.dev',
  role: 'MEMBER',
  joinedAt: '2026-11-01T00:00:00.000Z',
};

function setup(filters: CardFilters = EMPTY_FILTERS) {
  const onChange = vi.fn();
  render(
    <FilterToolbar
      filters={filters}
      onChange={onChange}
      members={[ADA]}
      labels={['bug', 'docs']}
      shown={2}
      total={5}
    />,
  );
  return onChange;
}

describe('FilterToolbar', () => {
  it('debounces the search box into the filters', async () => {
    const onChange = setup();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search cards' }), 'login');
    expect(onChange).not.toHaveBeenCalled();
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FILTERS, query: 'login' }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('toggles labels and assignees (including unassigned)', async () => {
    const onChange = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Filter by label' }));
    await userEvent.click(await screen.findByLabelText('bug'));
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_FILTERS, labels: ['bug'] });

    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Filter by assignee' }));
    await userEvent.click(await screen.findByLabelText('Unassigned'));
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_FILTERS, assignees: ['none'] });
  });

  it('shows counts and clears everything', async () => {
    const onChange = setup({ ...EMPTY_FILTERS, labels: ['bug'], query: 'x' });
    expect(screen.getByTestId('filter-status')).toHaveTextContent('Showing 2 of 5 cards');
    expect(screen.getByRole('button', { name: 'Filter by label' })).toHaveTextContent('1');
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onChange).toHaveBeenCalledWith(EMPTY_FILTERS);
  });

  it('hides "Clear filters" and shows the plain total when nothing is filtered', () => {
    setup();
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
    expect(screen.getByTestId('filter-status')).toHaveTextContent('5 cards');
  });
});
