import {
  type AuthResponse,
  authResponseSchema,
  type LoginInput,
  type RegisterInput,
  type User,
  userSchema,
} from '@teamboard/shared';
import { apiJson, apiVoid } from '@/lib/api-client';

export function loginRequest(input: LoginInput): Promise<AuthResponse> {
  return apiJson('/auth/login', authResponseSchema, { method: 'POST', body: input, auth: false });
}

export function registerRequest(input: RegisterInput): Promise<AuthResponse> {
  return apiJson('/auth/register', authResponseSchema, { method: 'POST', body: input, auth: false });
}

export function logoutRequest(): Promise<void> {
  return apiVoid('/auth/logout', { method: 'POST', auth: false });
}

export function meRequest(): Promise<User> {
  return apiJson('/auth/me', userSchema);
}
