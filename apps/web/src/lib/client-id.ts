let clientId: string | undefined;

/**
 * A random id for this browser tab. It goes out as X-Client-Id on every API request, and the
 * API stamps it on the realtime events those requests cause, so a tab can skip its own echoes
 * (another tab of the same user still gets them).
 */
export function getClientId(): string {
  clientId ??= crypto.randomUUID();
  return clientId;
}
