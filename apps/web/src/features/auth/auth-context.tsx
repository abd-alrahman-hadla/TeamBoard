'use client';

import type { LoginInput, RegisterInput, User } from '@teamboard/shared';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { refreshSession } from '@/lib/auth/refresh';
import { msUntilProactiveRefresh, tokenStore } from '@/lib/auth/token-store';
import { loginRequest, logoutRequest, registerRequest } from './auth-api';

export type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'authenticated'; user: User }
  | { status: 'unauthenticated'; user: null };

export interface AuthContextValue {
  state: AuthState;
  login: (input: LoginInput) => Promise<User>;
  register: (input: RegisterInput) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const LOADING: AuthState = { status: 'loading', user: null };
const SIGNED_OUT: AuthState = { status: 'unauthenticated', user: null };

/** When a backgrounded tab comes back, refresh if the token expires within this window. */
const VISIBILITY_REFRESH_WINDOW_MS = 30_000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>(LOADING);

  const applyRefresh = useCallback(async () => {
    const session = await refreshSession();
    setState(session ? { status: 'authenticated', user: session.user } : SIGNED_OUT);
  }, []);

  // Silent sign-in on load: the access token lives in memory, the refresh cookie survives reloads.
  useEffect(() => {
    void applyRefresh();
  }, [applyRefresh]);

  // Proactive refresh before expiry, and sign-out when the token is cleared (failed refresh, logout).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = tokenStore.subscribe((token) => {
      clearTimeout(timer);
      if (!token) {
        setState((previous) => (previous.status === 'authenticated' ? SIGNED_OUT : previous));
        return;
      }
      timer = setTimeout(() => void applyRefresh(), msUntilProactiveRefresh(token));
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [applyRefresh]);

  // Browsers throttle timers in background tabs; catch up when the tab is visible again.
  useEffect(() => {
    const onVisible = () => {
      const token = tokenStore.get();
      if (
        document.visibilityState === 'visible' &&
        token &&
        token.expiresAt - Date.now() < VISIBILITY_REFRESH_WINDOW_MS
      ) {
        void applyRefresh();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [applyRefresh]);

  const login = useCallback(async (input: LoginInput) => {
    const session = await loginRequest(input);
    tokenStore.set(session.accessToken, session.expiresIn);
    setState({ status: 'authenticated', user: session.user });
    return session.user;
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const session = await registerRequest(input);
    tokenStore.set(session.accessToken, session.expiresIn);
    setState({ status: 'authenticated', user: session.user });
    return session.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } finally {
      tokenStore.clear();
      queryClient.clear();
      setState(SIGNED_OUT);
    }
  }, [queryClient]);

  const value = useMemo(() => ({ state, login, register, logout }), [state, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
