import { Server as HttpServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { verifyAccessToken } from '../utils/auth';

/**
 * Real-time rooms:
 *  - "kitchen"    → cozinha (COOK)
 *  - "juice_bar"  → suqueiros (JUICER)
 *  - "cashier"    → caixa (CASHIER)
 *  - "floor"      → garçons / mesas (WAITER, MANAGER, ADMIN)
 *  - "dashboard"  → métricas em tempo real
 */
export const ROOMS = {
  KITCHEN: 'kitchen',
  JUICE_BAR: 'juice_bar',
  CASHIER: 'cashier',
  FLOOR: 'floor',
  DASHBOARD: 'dashboard',
} as const;

let io: SocketServer | null = null;

export function initSocket(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: { origin: env.corsOrigin, credentials: true },
  });

  // Optional JWT handshake auth (token via auth payload)
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (token) {
      try {
        socket.data.user = verifyAccessToken(token);
      } catch (err) {
        // Falls back to an anonymous read-only connection (e.g. TV/kitchen display modes).
        logger.debug('socket_auth_failed', {
          socketId: socket.id,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }
    next();
  });

  io.on('connection', (socket) => {
    logger.debug('socket_connected', { socketId: socket.id, userId: socket.data.user?.sub });

    // Clients join tenant-scoped rooms relevant to their screen,
    // e.g. "kitchen:<restaurantId>". The base must be a known room.
    socket.on('join', (room: string) => {
      const base = room.split(':')[0];
      if (Object.values(ROOMS).includes(base as never)) {
        socket.join(room);
      }
    });

    socket.on('leave', (room: string) => socket.leave(room));

    socket.on('disconnect', () => logger.debug('socket_disconnected', { socketId: socket.id }));
  });

  return io;
}

export function getIo(): SocketServer {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
}

/** Emit an event to one or more rooms. */
export function emitTo(rooms: string | string[], event: string, payload: unknown): void {
  if (!io) return;
  const list = Array.isArray(rooms) ? rooms : [rooms];
  list.forEach((room) => io!.to(room).emit(event, payload));
}

/**
 * Namespaces base rooms by tenant so real-time events stay isolated per
 * restaurant (e.g. "kitchen" → "kitchen:<restaurantId>").
 */
export function tenantRooms(tenantId: string, rooms: string[]): string[] {
  return rooms.map((r) => `${r}:${tenantId}`);
}

/** Emit an event to tenant-scoped rooms. */
export function emitTenant(
  tenantId: string,
  rooms: string[],
  event: string,
  payload: unknown,
): void {
  emitTo(tenantRooms(tenantId, rooms), event, payload);
}
