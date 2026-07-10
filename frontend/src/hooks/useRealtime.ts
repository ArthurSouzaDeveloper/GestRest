import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSocket, joinRoom } from '../lib/socket';

/**
 * Joins the given realtime rooms and invalidates the provided query keys
 * whenever any relevant server event fires — keeping screens live without polling.
 */
export function useRealtime(rooms: string[], invalidateKeys: string[][]) {
  const qc = useQueryClient();

  useEffect(() => {
    const socket = getSocket();
    rooms.forEach(joinRoom);

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
      rooms.forEach((r) => socket.emit('leave', r));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(rooms)]);
}
