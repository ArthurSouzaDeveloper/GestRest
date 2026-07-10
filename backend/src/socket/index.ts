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
      } catch {
        // allow anonymous read-only connection for TV modes
      }
    }
    next();
  });

  io.on('connection', (socket) => {
    logger.debug(`Socket connected: ${socket.id}`);

    // Clients join the rooms relevant to their screen.
    socket.on('join', (room: string) => {
      if (Object.values(ROOMS).includes(room as never)) {
        socket.join(room);
      }
    });

    socket.on('leave', (room: string) => socket.leave(room));

    socket.on('disconnect', () => logger.debug(`Socket disconnected: ${socket.id}`));
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
