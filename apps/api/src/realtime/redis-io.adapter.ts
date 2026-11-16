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

  async connect(): Promise<void> {
    if (!this.env.REDIS_URL) {
      this.log.warn('REDIS_URL is not set: realtime events only reach clients of this instance');
      return;
    }
    const pub = createClient({ url: this.env.REDIS_URL });
    const sub = pub.duplicate();
    for (const client of [pub, sub]) {
      client.on('error', (error: unknown) => this.log.error(`Redis: ${String(error)}`));
    }
    await Promise.all([pub.connect(), sub.connect()]);
    this.clients = [pub, sub];
    this.adapterConstructor = createAdapter(pub, sub);
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
