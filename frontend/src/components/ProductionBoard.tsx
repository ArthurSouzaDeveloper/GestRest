import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import api from '../lib/api';
import { PageHeader, Spinner, orderTypeLabels } from './ui';
import { useRealtime } from '../hooks/useRealtime';
import type { ProductionStatus, ProductionTicket } from '../types';

interface Props {
  title: string;
  subtitle: string;
  endpoint: string; // '/production/kitchen' | '/production/juice-bar'
  room: string; // 'kitchen' | 'juice_bar'
  queryKey: string;
}

/** Full-station board for Kitchen / Juice Bar with large touch targets. */
export function ProductionBoard({ title, subtitle, endpoint, room, queryKey }: Props) {
  useRealtime([room], [[queryKey]]);
  const qc = useQueryClient();

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: [queryKey],
    queryFn: async () => (await api.get<ProductionTicket[]>(endpoint)).data,
    refetchInterval: 10000,
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ProductionStatus }) =>
      api.post(`/orders/items/${id}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [queryKey] }),
  });

  if (isLoading) return <Spinner />;

  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} action={<span className="text-sm text-gray-500">{tickets.length} em fila</span>} />

      {tickets.length === 0 ? (
        <div className="card p-10 text-center text-gray-400">Nenhum item na fila 🎉</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {tickets.map((t) => (
            <div
              key={t.id}
              className={clsx(
                'card flex flex-col p-4',
                t.critical && 'border-red-400 ring-1 ring-red-300',
                t.status === 'PREPARING' && 'border-yellow-400',
              )}
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span className="rounded-md bg-brand px-2.5 py-1 text-sm font-bold text-white">
                    {t.tableNumber !== null ? `Mesa ${t.tableNumber}` : orderTypeLabels[t.orderType]}
                  </span>
                  {/* Uma mesa pode ter várias comandas simultâneas — o nº da comanda desambigua. */}
                  <span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                    #{t.orderNumber}
                  </span>
                </span>
                <span
                  className={clsx(
                    'flex items-center gap-1 text-sm font-medium',
                    t.critical ? 'text-red-600' : 'text-gray-500',
                  )}
                >
                  {t.critical ? <AlertTriangle size={14} /> : <Clock size={14} />}
                  {t.waitingMin} min
                </span>
              </div>

              <div className="mt-3 text-lg font-semibold leading-tight">
                {t.quantity}× {t.productName}
              </div>
              {t.customerName && <div className="text-xs text-gray-500">Cliente: {t.customerName}</div>}

              {t.additionals.length > 0 && (
                <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                  <span className="font-medium">Adicionais:</span> {t.additionals.join(', ')}
                </div>
              )}
              {t.notes && (
                <div className="mt-1 rounded bg-yellow-50 px-2 py-1 text-sm italic text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200">
                  {t.notes}
                </div>
              )}

              <div className="mt-4 flex gap-2">
                {t.status === 'WAITING' && (
                  <button
                    className="btn-primary flex-1 !py-3 text-base"
                    onClick={() => setStatus.mutate({ id: t.id, status: 'PREPARING' })}
                  >
                    Preparando
                  </button>
                )}
                {t.status === 'PREPARING' && (
                  <button
                    className="btn-success flex-1 !py-3 text-base"
                    onClick={() => setStatus.mutate({ id: t.id, status: 'DONE' })}
                  >
                    Concluído
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
