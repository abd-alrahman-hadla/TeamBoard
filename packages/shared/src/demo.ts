/**
 * The public live demo (NEXT_PUBLIC_DEMO_MODE=1). These credentials are published on purpose:
 * the login page signs visitors in with them. Both accounts are MEMBERs of the demo workspace,
 * so visitors can work on cards but can't delete the board, its columns or the workspace.
 * `pnpm db:seed:demo` recreates everything nightly.
 */
export const DEMO_PASSWORD = 'teamboard-live-demo';

export const DEMO_ACCOUNTS = [
  { key: 'sara', name: 'Sara Haddad', email: 'sara.demo@example.com' },
  { key: 'omar', name: 'Omar Nasser', email: 'omar.demo@example.com' },
] as const;

/** Fixed ids, so the demo board URL survives every reset. */
export const DEMO_WORKSPACE_ID = '0196d000-0000-7000-8000-000000000001';
export const DEMO_BOARD_ID = '0196d000-0000-7000-8000-000000000002';

export type DemoAccount = (typeof DEMO_ACCOUNTS)[number];
