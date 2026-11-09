import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PauseCircle, PlayCircle } from 'lucide-react';
import api, { apiError } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Modal } from './ui';

interface PauseState {
  paused: boolean;
  reason: string | null;
  pausedAt: string | null;
}

const QUERY_KEY = ['online-orders-pause'];

/**
 * Botão do cabeçalho pra o dono/gerente pausar só os pedidos online do site (imprevisto,
 * ex.: falta de energia) sem precisar do superadmin desativar o restaurante. O login da
 * equipe, mesas, caixa e cozinha continuam normais. Enquanto pausado, mostra uma faixa
 * vermelha em todas as telas com o botão de retomar, pra ninguém esquecer o site fechado.
 * Montado duas vezes no Layout: "button" no cabeçalho (só quando aberto) e "banner" logo
 * abaixo dele (só quando pausado) — as duas instâncias compartilham a mesma query.
 */
export function OnlineOrdersPauseControl({ placement }: { placement: 'button' | 'banner' }) {
  const { hasRole } = useAuth();
  const canManage = hasRole('ADMIN', 'MANAGER');
  const qc = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const { data } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => (await api.get<PauseState>('/catalog/online-orders-pause')).data,
    enabled: canManage,
    refetchInterval: 30_000,
  });

  const mutation = useMutation({
    mutationFn: async (body: { paused: boolean; reason?: string | null }) =>
      (await api.patch<PauseState>('/catalog/online-orders-pause', body)).data,
    onSuccess: (state) => {
      qc.setQueryData(QUERY_KEY, state);
      setConfirmOpen(false);
      setReason('');
      setError('');
    },
    onError: (e) => setError(apiError(e)),
  });

  if (!canManage || !data) return null;

  if (data.paused) {
    if (placement !== 'banner') return null;
    const since = data.pausedAt
      ? new Date(data.pausedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : null;
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 bg-red-600 px-4 py-2 text-sm font-medium text-white">
        <div className="flex items-center gap-2">
          <PauseCircle size={18} className="shrink-0" />
          <span>
            Pedidos online PAUSADOS{since ? ` desde ${since}` : ''}. O site não está aceitando pedidos.
            {data.reason ? ` Recado pro cliente: "${data.reason}"` : ''}
          </span>
        </div>
        <button
          className="flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate({ paused: false })}
        >
          <PlayCircle size={16} />
          {mutation.isPending ? 'Retomando...' : 'Retomar pedidos online'}
        </button>
        {error && <p className="w-full text-xs text-red-100">{error}</p>}
      </div>
    );
  }

  if (placement !== 'button') return null;
  return (
    <>
      <button
        className="btn-secondary flex items-center gap-1.5 text-sm"
        onClick={() => {
          setError('');
          setConfirmOpen(true);
        }}
        title="Fecha só o site de pedidos. Mesas, caixa e cozinha continuam funcionando."
      >
        <PauseCircle size={16} />
        <span className="hidden sm:inline">Pausar pedidos online</span>
      </button>
      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Pausar pedidos online?">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          O site para de aceitar pedidos de entrega e retirada na hora. Mesas, caixa, cozinha e o login da equipe
          continuam funcionando normalmente. Pedidos que já chegaram não são afetados.
        </p>
        <label className="label mt-4" htmlFor="pause-reason">
          Recado pro cliente (opcional)
        </label>
        <input
          id="pause-reason"
          className="input"
          maxLength={200}
          placeholder="Ex.: Estamos sem energia, voltamos em breve."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <p className="mt-1 text-xs text-gray-500">
          O cliente vê: "Este restaurante não está aceitando pedidos online no momento.{reason.trim() ? ` ${reason.trim()}` : ''}"
        </p>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => setConfirmOpen(false)}>
            Cancelar
          </button>
          <button
            className="btn-danger"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate({ paused: true, reason: reason.trim() || null })}
          >
            {mutation.isPending ? 'Pausando...' : 'Pausar agora'}
          </button>
        </div>
      </Modal>
    </>
  );
}
