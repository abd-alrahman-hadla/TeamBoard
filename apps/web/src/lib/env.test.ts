import { publicEnvSchema, socketUrl } from './env';

describe('public env', () => {
  it('accepts an absolute API URL or a same-origin path', () => {
    expect(publicEnvSchema.parse({ NEXT_PUBLIC_API_URL: 'http://localhost:4000/' }).NEXT_PUBLIC_API_URL).toBe(
      'http://localhost:4000',
    );
    expect(publicEnvSchema.parse({ NEXT_PUBLIC_API_URL: '/api/' }).NEXT_PUBLIC_API_URL).toBe('/api');
    expect(publicEnvSchema.safeParse({ NEXT_PUBLIC_API_URL: 'api' }).success).toBe(false);
  });

  it('picks the socket URL', () => {
    const parse = (raw: Record<string, string>) => socketUrl(publicEnvSchema.parse(raw));
    expect(parse({ NEXT_PUBLIC_API_URL: 'http://localhost:4000' })).toBe('http://localhost:4000');
    expect(parse({ NEXT_PUBLIC_API_URL: '/api' })).toBeUndefined();
    expect(parse({ NEXT_PUBLIC_API_URL: '/api', NEXT_PUBLIC_SOCKET_URL: 'https://api.example.com/' })).toBe(
      'https://api.example.com',
    );
  });
});
