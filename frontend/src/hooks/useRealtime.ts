import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSocket, joinRoom } from '../lib/socket';
import { useAuth } from '../contexts/AuthContext';

/**
 * Joins tenant-scoped realtime rooms (e.g. "kitchen:<restaurantId>") and
 * invalidates the given query keys on any relevant server event — keeping the
 * screen live without polling, isolated to the logged-in restaurant.
 */
export function useRealtime(rooms: string[], invalidateKeys: string[][]) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const restaurantId = user?.restaurant?.id;

  useEffect(() => {
    if (!restaurantId) return;
    const socket = getSocket();
    const scoped = rooms.map((r) => `${r}:${restaurantId}`);
    scoped.forEach(joinRoom);

    const handler = () => {
      invalidateKeys.forEach((key) => qc.invalidateQueries({ queryKey: key }));
    };

    const events = [
      'order:created',
      'order:updated',
      'order:paid',
      'production:updated',
      'table:updated',
    ];
    events.forEach((e) => socket.on(e, handler));

    return () => {
      events.forEach((e) => socket.off(e, handler));
      scoped.forEach((r) => socket.emit('leave', r));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(rooms), restaurantId]);
}
