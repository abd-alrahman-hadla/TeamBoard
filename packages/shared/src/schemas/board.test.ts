import { describe, expect, it } from 'vitest';
import { createCardInputSchema, moveCardInputSchema, updateCardInputSchema } from './board';

const id = '0194d6a4-6a8e-7cc5-9d1b-3f2a1b0c9d8e';

describe('card schemas', () => {
  it('accepts a minimal card and trims the title', () => {
    expect(createCardInputSchema.parse({ title: '  Ship it ' })).toEqual({ title: 'Ship it' });
  });

  it('rejects duplicate labels and assignees', () => {
    expect(createCardInputSchema.safeParse({ title: 'x', labels: ['a', 'a'] }).success).toBe(false);
    expect(createCardInputSchema.safeParse({ title: 'x', assigneeIds: [id, id] }).success).toBe(false);
  });

  it('requires an offset on due dates and allows clearing them', () => {
    expect(createCardInputSchema.safeParse({ title: 'x', dueDate: '2026-12-01T10:00:00Z' }).success).toBe(
      true,
    );
    expect(createCardInputSchema.safeParse({ title: 'x', dueDate: '2026-12-01' }).success).toBe(false);
    expect(updateCardInputSchema.safeParse({ dueDate: null }).success).toBe(true);
  });

  it('rejects an empty PATCH', () => {
    expect(updateCardInputSchema.safeParse({}).success).toBe(false);
  });

  it('requires an explicit afterId on moves (null = first)', () => {
    expect(moveCardInputSchema.safeParse({ columnId: id }).success).toBe(false);
    expect(moveCardInputSchema.safeParse({ columnId: id, afterId: null }).success).toBe(true);
  });
});
