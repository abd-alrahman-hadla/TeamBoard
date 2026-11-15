import { getAuthRedirect, safeNextPath } from './route-guard';

describe('getAuthRedirect', () => {
  it('sends visitors without a session hint to login, keeping the full destination', () => {
    expect(getAuthRedirect('/workspaces', '?tab=all', false)).toBe('/login?next=%2Fworkspaces%3Ftab%3Dall');
    expect(getAuthRedirect('/', '', false)).toBe('/login?next=%2F');
  });

  it('lets visitors with a session hint through', () => {
    expect(getAuthRedirect('/workspaces', '', true)).toBeNull();
  });

  it('never redirects guest pages (prevents loops on a stale hint)', () => {
    expect(getAuthRedirect('/login', '', false)).toBeNull();
    expect(getAuthRedirect('/login', '', true)).toBeNull();
    expect(getAuthRedirect('/register', '', true)).toBeNull();
  });
});

describe('safeNextPath', () => {
  it('keeps same-site relative paths', () => {
    expect(safeNextPath('/workspaces?x=1')).toBe('/workspaces?x=1');
  });

  it.each([null, undefined, '', 'https://evil.com', '//evil.com', '/\\evil.com', 'workspaces'])(
    'falls back to the home page for %s',
    (value) => {
      expect(safeNextPath(value)).toBe('/workspaces');
    },
  );
});
