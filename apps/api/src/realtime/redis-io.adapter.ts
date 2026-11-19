import { type INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import type { Server, ServerOptions } from 'socket.io';
import type { Env } from '../config/env';

type RedisClient = ReturnType<typeof createClient>;

/**
 * Socket.io with the Redis adapter, so rooms, broadcasts and fetchSockets() span every API
 * instance. Without REDIS_URL it falls back to the in-memory adapter (one instance only).
 *
 * WebSocket-only transport: no HTTP long-polling, so a load balancer needs no sticky sessions.
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly log = new Logger(RedisIoAdapter.name);
  private adapterConstructor: ReturnType<typeof createAdapter> | undefined;
  private clients: RedisClient[] = [];

  constructor(
    app: INestApplicationContext,
    private readonly env: Pick<Env, 'REDIS_URL' | 'WEB_ORIGIN'>,
  ) {
    super(app);
  }

  /**
   * Connects the pub/sub clients, or fails within `timeoutMs`. node-redis keeps retrying an
   * unreachable server forever, which would block startup before `listen()`: a host like
   * Render then reports "no open ports" instead of the real cause.
   */
  async connect(timeoutMs = 15_000): Promise<void> {
    if (!this.env.REDIS_URL) {
      this.log.warn('REDIS_URL is not set: realtime events only reach clients of this instance');
      return;
    }
    const pub = createClient({ url: this.env.REDIS_URL });
    const sub = pub.duplicate();
    let lastError = '';
    for (const client of [pub, sub]) {
      client.on('error', (error: unknown) => {
        lastError = String(error);
        this.log.error(`Redis: ${lastError}`);
      });
    }

    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const host = new URL(this.env.REDIS_URL ?? '').host; // never log the password
        reject(
          new Error(
            `Could not connect to Redis at ${host} within ${timeoutMs / 1000}s` +
              `${lastError ? ` (last error: ${lastError})` : ''}. Check REDIS_URL: ` +
              'Upstash needs the rediss:// (TLS) Redis URL, not the https:// REST URL.',
          ),
        );
      }, timeoutMs);
    });
    try {
      await Promise.race([Promise.all([pub.connect(), sub.connect()]), timeout]);
    } catch (error) {
      for (const client of [pub, sub]) client.destroy();
      throw error;
    } finally {
      clearTimeout(timer);
    }
    this.clients = [pub, sub];
    this.adapterConstructor = createAdapter(pub, sub);
    this.log.log(`Redis adapter connected (${new URL(this.env.REDIS_URL).host})`);
  }

  override createIOServer(port: number | undefined, options?: Partial<ServerOptions>): Server {
    const server = super.createIOServer(port, {
      ...options,
      transports: ['websocket'],
      cors: { origin: new URL(this.env.WEB_ORIGIN).origin, credentials: true },
    }) as Server;
    if (this.adapterConstructor) server.adapter(this.adapterConstructor);
    return server;
  }

  override async dispose(): Promise<void> {
    await super.dispose();
    await Promise.all(this.clients.map((client) => client.quit().catch(() => undefined)));
    this.clients = [];
  }
}
