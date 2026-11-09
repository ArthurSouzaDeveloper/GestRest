import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PauseCircle, PlayCircle } from 'lucide-react';
import api, { apiError } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Card, Modal } from './ui';

export interface PauseState {
  paused: boolean;
  reason: string | null;
  pausedAt: string | null;
  /** A pausa atual foi a automática das 23:20. */
  pausedAutomatically: boolean;
  /** Pausa automática todo dia às 23:20 ligada. */
  autoPauseAfterClose: boolean;
}

const QUERY_KEY = ['online-orders-pause'];

/**
 * Estado da pausa dos pedidos online + ações, compartilhado pelo card do Dashboard, pelo
 * botão do cabeçalho e pela faixa vermelha (todos usam a mesma query, então mudar num lugar
 * atualiza os outros na hora). Só ADMIN/MANAGER — o backend também só aceita esses perfis.
 */
function useOnlineOrdersPause() {
  const { hasRole } = useAuth();
  const canManage = hasRole('ADMIN', 'MANAGER');
  const qc = useQueryClient();
  const [error, setError] = useState('');

  const { data } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => (await api.get<PauseState>('/catalog/online-orders-pause')).data,
    enabled: canManage,
    refetchInterval: 30_000,
  });

  const mutation = useMutation({
    mutationFn: async (body: { paused?: boolean; reason?: string | null; autoPauseAfterClose?: boolean }) =>
      (await api.patch<PauseState>('/catalog/online-orders-pause', body)).data,
    onSuccess: (state) => {
      qc.setQueryData(QUERY_KEY, state);
      setError('');
    },
    onError: (e) => setError(apiError(e)),
  });

  return { canManage, data, mutation, error, setError };
}

function pausedSince(data: PauseState): string | null {
  return data.pausedAt
    ? new Date(data.pausedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null;
}

/** Confirmação de pausa com recado opcional pro cliente. */
function PauseDialog({
  open,
  onClose,
  onConfirm,
  pending,
  error,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string | null) => void;
  pending: boolean;
  error: string;
}) {
  const [reason, setReason] = useState('');
  return (
    <Modal open={open} onClose={onClose} title="Pausar pedidos online?">
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
        <button className="btn-secondary" onClick={onClose}>
          Cancelar
        </button>
        <button
          className="btn-danger"
          disabled={pending}
          onClick={() => {
            onConfirm(reason.trim() || null);
            setReason('');
          }}
        >
          {pending ? 'Pausando...' : 'Pausar agora'}
        </button>
      </div>
    </Modal>
  );
}

/**
 * Atalhos fora do Dashboard: "button" no cabeçalho (só quando aberto) e "banner" logo abaixo
 * dele (só quando pausado), pra ninguém esquecer o site fechado em qualquer tela.
 */
export function OnlineOrdersPauseControl({ placement }: { placement: 'button' | 'banner' }) {
  const { canManage, data, mutation, error, setError } = useOnlineOrdersPause();
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!canManage || !data) return null;

  if (data.paused) {
    if (placement !== 'banner') return null;
    const since = pausedSince(data);
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 bg-red-600 px-4 py-2 text-sm font-medium text-white">
        <div className="flex items-center gap-2">
          <PauseCircle size={18} className="shrink-0" />
          {data.pausedAutomatically ? (
            <span>
              Pedidos online pausados automaticamente no fechamento{since ? ` (${since})` : ''}. Clique em Retomar
              quando o restaurante estiver pronto: o site volta a aceitar pedidos no horário normal, a partir das 18h.
            </span>
          ) : (
            <span>
              Pedidos online PAUSADOS{since ? ` desde ${since}` : ''}. O site não está aceitando pedidos.
              {data.reason ? ` Recado pro cliente: "${data.reason}"` : ''}
            </span>
          )}
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
      <PauseDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        pending={mutation.isPending}
        error={error}
        onConfirm={(reason) => mutation.mutate({ paused: true, reason }, { onSuccess: () => setConfirmOpen(false) })}
      />
    </>
  );
}

/**
 * Card do Dashboard (pedido do dono): tudo dos pedidos online num lugar só — situação do
 * site, Pausar/Retomar e a pausa automática das 23:20.
 */
export function OnlineOrdersCard() {
  const { canManage, data, mutation, error, setError } = useOnlineOrdersPause();
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!canManage || !data) return null;
  const since = pausedSince(data);

  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Pedidos online</h3>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                data.paused ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
              }`}
            >
              {data.paused ? 'Pausados' : 'Ativos'}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {data.paused
              ? data.pausedAutomatically
                ? `Pausados automaticamente no fechamento${since ? ` (${since})` : ''}. Ao retomar, o site aceita pedidos no horário normal, a partir das 18h.`
                : `Pausados${since ? ` desde ${since}` : ''}. O site não está aceitando pedidos.${data.reason ? ` Recado: "${data.reason}"` : ''}`
              : 'O site aceita pedidos no horário normal (quarta a domingo, das 18h às 23:15).'}
          </p>
        </div>
        {data.paused ? (
          <button
            className="btn-primary flex items-center gap-1.5"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate({ paused: false })}
          >
            <PlayCircle size={16} />
            {mutation.isPending ? 'Retomando...' : 'Retomar pedidos online'}
          </button>
        ) : (
          <button
            className="btn-danger flex items-center gap-1.5"
            onClick={() => {
              setError('');
              setConfirmOpen(true);
            }}
          >
            <PauseCircle size={16} />
            Pausar pedidos online
          </button>
        )}
      </div>

      <label className="mt-4 flex items-start gap-2 border-t border-gray-100 pt-4 text-sm dark:border-gray-800">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={data.autoPauseAfterClose}
          disabled={mutation.isPending}
          onChange={(e) => mutation.mutate({ autoPauseAfterClose: e.target.checked })}
        />
        <span>
          <span className="font-semibold">Pausar sozinho às 23:20 e só voltar quando alguém retomar</span>
          <span className="block text-gray-500">
            Se o restaurante ficar sem energia ou sem acesso, o site não abre sozinho no dia seguinte. Atenção: se
            ninguém clicar em Retomar, o site fica fechado o dia todo.
          </span>
        </span>
      </label>
      {error && !confirmOpen && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <PauseDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        pending={mutation.isPending}
        error={error}
        onConfirm={(reason) => mutation.mutate({ paused: true, reason }, { onSuccess: () => setConfirmOpen(false) })}
      />
    </Card>
  );
}
