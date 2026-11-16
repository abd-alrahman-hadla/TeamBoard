// Proves realtime works across API replicas (the `scale` compose profile).
//
//   docker compose --profile scale up -d --build --wait
//   pnpm realtime:scale-smoke            (SCALE_URL defaults to http://localhost:8080)
//
// Through nginx it sets up a board, opens sockets until it has one on each replica, then makes
// writes over REST and checks that sockets on *both* replicas receive every event, whichever
// replica handled the write. Exits non-zero on failure.
import { randomUUID } from 'node:crypto';
import { io } from 'socket.io-client';

const BASE = process.env.SCALE_URL ?? 'http://localhost:8080';
const TIMEOUT_MS = 5000;

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

async function api(method, path, token, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) fail(`${method} ${path} → ${res.status} ${text}`);
  return { body: text ? JSON.parse(text) : null, instance: res.headers.get('x-instance-id') };
}

async function register(label) {
  const user = {
    name: `${label} ${randomUUID().slice(0, 4)}`,
    email: `scale-${randomUUID().slice(0, 8)}@test.dev`,
    password: 'correct horse battery',
  };
  const { body } = await api('POST', '/auth/register', undefined, user);
  return { ...user, id: body.user.id, token: body.accessToken };
}

function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      auth: { token },
    });
    const timer = setTimeout(() => reject(new Error('no hello')), TIMEOUT_MS);
    socket.once('hello', ({ instanceId }) => {
      clearTimeout(timer);
      resolve({ socket, instanceId });
    });
    socket.once('connect_error', (error) => reject(error));
  });
}

function nextEvent(socket, type) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ${type}`)), TIMEOUT_MS);
    const handler = (event) => {
      if (event.type !== type) return;
      clearTimeout(timer);
      socket.off('board:event', handler);
      resolve(event);
    };
    socket.on('board:event', handler);
  });
}

const owner = await register('Owner');
const member = await register('Member');
const { body: workspace } = await api('POST', '/workspaces', owner.token, { name: 'Scale smoke' });
const { body: invite } = await api('POST', `/workspaces/${workspace.id}/invitations`, owner.token, {
  email: member.email,
  role: 'MEMBER',
});
await api('POST', `/invitations/${invite.link.split('/invite/')[1]}/accept`, member.token);
const { body: board } = await api('POST', `/workspaces/${workspace.id}/boards`, owner.token, {
  name: 'Scale',
});
const { body: todo } = await api('POST', `/boards/${board.id}/columns`, owner.token, { name: 'To do' });
const { body: done } = await api('POST', `/boards/${board.id}/columns`, owner.token, { name: 'Done' });
const { body: card } = await api('POST', `/columns/${todo.id}/cards`, owner.token, { title: 'Ship it' });

// One socket per replica (nginx round-robins new connections).
const byInstance = new Map();
for (let attempt = 0; attempt < 12 && byInstance.size < 2; attempt += 1) {
  const connection = await connect(member.token);
  if (byInstance.has(connection.instanceId)) connection.socket.close();
  else byInstance.set(connection.instanceId, connection.socket);
}
if (byInstance.size < 2)
  fail(`only reached ${byInstance.size} replica(s): ${[...byInstance.keys()].join(', ')}`);
console.log(`✓ sockets connected to 2 replicas: ${[...byInstance.keys()].join(', ')}`);

for (const socket of byInstance.values()) {
  const ack = await socket.emitWithAck('board:join', { boardId: board.id });
  if (!ack.ok) fail('board:join refused');
}

// Two writes; round-robin sends them to different replicas. Every socket must get every event.
const writes = [
  {
    label: 'move to Done',
    run: () => api('POST', `/cards/${card.id}/move`, owner.token, { columnId: done.id, afterId: null }),
    type: 'card.moved',
  },
  {
    label: 'rename card',
    run: () => api('PATCH', `/cards/${card.id}`, owner.token, { title: 'Shipped' }),
    type: 'card.updated',
  },
  {
    label: 'move back',
    run: () => api('POST', `/cards/${card.id}/move`, owner.token, { columnId: todo.id, afterId: null }),
    type: 'card.moved',
  },
];
const writers = new Set();
for (const write of writes) {
  const waits = [...byInstance].map(([instanceId, socket]) =>
    nextEvent(socket, write.type).then(() => instanceId),
  );
  const { instance } = await write.run();
  writers.add(instance);
  const delivered = await Promise.all(waits).catch((error) => fail(`${write.label}: ${error.message}`));
  console.log(`✓ ${write.label}: written by ${instance}, delivered to ${delivered.join(' + ')}`);
}
if (writers.size < 2)
  console.warn(
    `! all writes landed on one replica (${[...writers].join()}); cross-replica delivery still verified for sockets on the other`,
  );

for (const socket of byInstance.values()) socket.close();
console.log('✓ events cross replicas through the Redis adapter');
process.exit(0);
