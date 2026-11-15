import { msUntilProactiveRefresh, tokenStore } from './token-store';

describe('tokenStore', () => {
  afterEach(() => tokenStore.clear());

  it('stores the token with its expiry and notifies subscribers', () => {
    const seen: (string | null)[] = [];
    const unsubscribe = tokenStore.subscribe((token) => seen.push(token?.value ?? null));
    tokenStore.set('a', 900, 1_000);
    expect(tokenStore.get()).toEqual({ value: 'a', expiresAt: 901_000, lifetimeMs: 900_000 });
    tokenStore.clear();
    unsubscribe();
    tokenStore.set('b', 900);
    expect(seen).toEqual(['a', null]);
  });

  it('does not notify when clearing an empty store', () => {
    const listener = vi.fn();
    tokenStore.subscribe(listener);
    tokenStore.clear();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('msUntilProactiveRefresh', () => {
  it('fires at 75% of the lifetime', () => {
    const token = { value: 'a', expiresAt: 900_000, lifetimeMs: 900_000 };
    expect(msUntilProactiveRefresh(token, 0)).toBe(675_000);
  });

  it('never returns a negative delay', () => {
    const token = { value: 'a', expiresAt: 1_000, lifetimeMs: 900_000 };
    expect(msUntilProactiveRefresh(token, 5_000)).toBe(0);
  });
});
