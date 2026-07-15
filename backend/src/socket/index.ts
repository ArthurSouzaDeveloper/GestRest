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

    // Clients join tenant-scoped rooms relevant to their screen, e.g. "kitchen:<restaurantId>".
    // The room's tenant suffix MUST match the authenticated socket's own restaurantId — without
    // this check, any connected client could join another restaurant's room (by prefix alone,
    // any known room name passed the old check) and silently receive their live orders,
    // payments and table status. There is no legitimate anonymous/cross-tenant use today, so
    // an unauthenticated socket or a suffix mismatch is simply rejected.
    socket.on('join', (room: string) => {
      const [base, tenantSuffix] = room.split(':');
      const knownRoom = Object.values(ROOMS).includes(base as never);
      const ownTenant = socket.data.user?.restaurantId;

      if (!knownRoom || !ownTenant || tenantSuffix !== ownTenant) {
        logger.warn('socket_join_rejected', {
          socketId: socket.id,
          userId: socket.data.user?.sub,
          room,
        });
        return;
      }
      socket.join(room);
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
