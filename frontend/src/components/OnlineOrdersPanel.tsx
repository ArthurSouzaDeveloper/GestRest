import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bike, ShoppingBag, Phone } from 'lucide-react';
import api, { apiError } from '../lib/api';
import { brl, time } from '../lib/format';
import { Card, ProductionBadge, orderTypeLabels, paymentMethodLabels } from './ui';
import { useRealtime } from '../hooks/useRealtime';
import type { Order } from '../types';

const QUERY_KEYS: ['online-orders-delivery', 'online-orders-pickup'] = ['online-orders-delivery', 'online-orders-pickup'];

/**
 * Painel de pedidos online (delivery/retirada), separado da fila normal da Cozinha —
 * a equipe já usa aquela fila pra comandas de mesa, e nada lá muda. Fica aqui, no topo,
 * até o dia em que o resto do sistema de gestão for implementado e as duas visões
 * puderem ser unificadas.
 */
export function OnlineOrdersPanel() {
  useRealtime(['cashier', 'floor'], [[QUERY_KEYS[0]], [QUERY_KEYS[1]]]);
  const qc = useQueryClient();
  const [error, setError] = useState('');

  const { data: deliveryOrders = [] } = useQuery({
    queryKey: [QUERY_KEYS[0]],
    queryFn: async () => (await api.get<Order[]>('/orders', { params: { orderType: 'DELIVERY' } })).data,
    refetchInterval: 10000,
  });
  const { data: pickupOrders = [] } = useQuery({
    queryKey: [QUERY_KEYS[1]],
    queryFn: async () => (await api.get<Order[]>('/orders', { params: { orderType: 'PICKUP' } })).data,
    refetchInterval: 10000,
  });

  const orders = [...deliveryOrders, ...pickupOrders].filter(
    (o) => o.status !== 'PAID' && o.status !== 'CANCELLED',
  );
  const pending = orders.filter((o) => o.status === 'PENDING');
  const active = orders.filter((o) => o.status !== 'PENDING');

  const refresh = () => {
    qc.invalidateQueries({ queryKey: [QUERY_KEYS[0]] });
    qc.invalidateQueries({ queryKey: [QUERY_KEYS[1]] });
  };

  const accept = useMutation({
    mutationFn: async (id: string) => api.post(`/orders/${id}/accept`),
    onSuccess: refresh,
    onError: (e) => setError(apiError(e)),
  });
  const deliver = useMutation({
    mutationFn: async (id: string) => api.post(`/orders/${id}/deliver`),
    onSuccess: refresh,
    onError: (e) => setError(apiError(e)),
  });

  if (orders.length === 0) return null;

  return (
    <div className="mb-6">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Pedidos Online</h2>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {pending.map((o) => (
          <OnlineOrderCard key={o.id} order={o} action={{ label: 'Aceitar Pedido', pending: accept.isPending, onClick: () => accept.mutate(o.id) }} />
        ))}
        {active.map((o) => (
          <OnlineOrderCard
            key={o.id}
            order={o}
            action={
              o.status === 'READY_FOR_PAYMENT'
                ? {
                    label: 'Marcar Entregue',
                    pending: deliver.isPending,
                    onClick: () => {
                      if (window.confirm(`Confirmar entrega do pedido #${o.number}? Isso registra o pagamento (${o.declaredPaymentMethod ? paymentMethodLabels[o.declaredPaymentMethod] : '—'}).`)) {
                        deliver.mutate(o.id);
                      }
                    },
                  }
                : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}

function OnlineOrderCard({
  order,
  action,
}: {
  order: Order;
  action?: { label: string; pending: boolean; onClick: () => void };
}) {
  const Icon = order.orderType === 'DELIVERY' ? Bike : ShoppingBag;
  return (
    <Card className="!p-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-bold">
          <Icon size={16} className="text-brand" /> {orderTypeLabels[order.orderType]}
          <span className="font-normal text-gray-400">· #{order.number}</span>
        </span>
        <span className="text-xs text-gray-400">{time(order.openedAt)}</span>
      </div>

      <div className="mt-1.5 text-sm">
        <div className="font-medium">{order.customer?.name ?? '—'}</div>
        {order.customer?.phone && (
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Phone size={11} /> {order.customer.phone}
          </div>
        )}
        {order.orderType === 'DELIVERY' && (
          <div className="mt-0.5 text-xs text-gray-500">
            {order.deliveryStreet}, {order.deliveryNumber}
            {order.deliveryComplement ? ` — ${order.deliveryComplement}` : ''} · {order.deliveryZone?.name}
          </div>
        )}
      </div>

      <div className="mt-2 space-y-1 border-t border-gray-100 pt-2 dark:border-gray-800">
        {order.items.filter((i) => i.status !== 'CANCELLED').map((it) => (
          <div key={it.id} className="flex items-center justify-between text-xs">
            <span>{it.quantity}× {it.product.name}</span>
            <ProductionBadge status={it.status} />
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-2 text-xs dark:border-gray-800">
        <span className="text-gray-500">
          {order.declaredPaymentMethod ? paymentMethodLabels[order.declaredPaymentMethod] : '—'}
        </span>
        <span className="font-semibold text-brand">{brl(order.totals.total)}</span>
      </div>

      {action && (
        <button
          className="btn-primary mt-2 w-full !py-2 text-sm"
          disabled={action.pending}
          onClick={action.onClick}
        >
          {action.label}
        </button>
      )}
    </Card>
  );
}
