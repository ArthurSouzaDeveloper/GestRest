import { io, Socket } from 'socket.io-client';
import { getAccessToken } from './api';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io('/', {
      autoConnect: true,
      auth: { token: getAccessToken() },
      transports: ['websocket', 'polling'],
    });
  }
  return socket;
}

export function joinRoom(room: string) {
  getSocket().emit('join', room);
}
