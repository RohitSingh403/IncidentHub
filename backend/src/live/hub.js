import { WebSocketServer } from 'ws';
import { Membership } from '../models/index.js';
import { verifyToken } from '../utils/token.js';

const clients = new Map();

function room(organizationId) {
  const key = String(organizationId);
  if (!clients.has(key)) clients.set(key, new Set());
  return clients.get(key);
}

export function publish(organizationId, event) {
  const payload = JSON.stringify(event);
  for (const socket of room(organizationId)) {
    if (socket.readyState === 1) socket.send(payload);
  }
}

export function attachLive(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname !== '/api/live') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', async (socket, request) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      const payload = verifyToken(url.searchParams.get('token') || '');
      const membership = await Membership.findOne({
        userId: payload.userId,
        organizationId: payload.organizationId,
      });
      if (!membership) {
        socket.close(4001, 'Unauthorized');
        return;
      }
      const subscribers = room(membership.organizationId);
      subscribers.add(socket);
      socket.on('close', () => subscribers.delete(socket));
      socket.send(JSON.stringify({ type: 'ready' }));
    } catch {
      socket.close(4001, 'Unauthorized');
    }
  });
}
