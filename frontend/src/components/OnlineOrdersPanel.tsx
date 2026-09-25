import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bike, ShoppingBag, Phone, Archive } from 'lucide-react';
import api, { apiError } from '../lib/api';
import { brl, time, dateTime } from '../lib/format';
import { Card, ProductionBadge, orderTypeLabels, paymentMethodLabels } from './ui';
import { useRealtime } from '../hooks/useRealtime';
import type { Order, OrderType } from '../types';

const QUERY_KEYS: ['online-orders-delivery', 'online-orders-pickup'] = ['online-orders-delivery', 'online-orders-pickup'];
// Histórico (pedidos arquivados pela rotina noturna de 00:30 — ver
// archive-stale-online-orders.ts) tem chaves próprias: não deve ser invalidado pelos
// eventos em tempo real da fila do dia, e um refetch mais espaçado já basta (não muda com
// frequência, só uma vez por noite).
const HISTORY_QUERY_KEYS: ['online-orders-delivery-history', 'online-orders-pickup-history'] = [
  'online-orders-delivery-history',
  'online-orders-pickup-history',
];

/**
 * Painel de pedidos online (delivery/retirada), separado da fila normal da Cozinha —
 * a equipe já usa aquela fila pra comandas de mesa, e nada lá muda. Fica aqui, no topo,
 * até o dia em que o resto do sistema de gestão for implementado e as duas visões
 * puderem ser unificadas.
 *
 * Reaproveitado pela tela do Motoboy (Motoboy.tsx): mesma lista/ação de "Marcar
 * Entregue", só filtrando pra DELIVERY e escondendo "Aceitar Pedido" (motoboy não decide
 * o que a cozinha prepara, só retira o que já está pronto).
 */
export function OnlineOrdersPanel({
  orderTypes = ['DELIVERY', 'PICKUP'],
  canAccept = true,
  title = 'Pedidos Online',
  emptyMessage,
  defaultTab = 'preparing',
}: {
  orderTypes?: OrderType[];
  canAccept?: boolean;
  title?: string;
  /** Quando a lista está vazia: por padrão o painel some (faz sentido dentro da tela da
   * Cozinha, que tem outras coisas pra mostrar); numa tela dedicada (Motoboy.tsx) fica
   * em branco sem isso — passe uma mensagem pra mostrar um estado vazio de verdade. */
  emptyMessage?: string;
  /** Motoboy.tsx abre direto em "Prontos" — é a fila que ele realmente usa; a Cozinha
   * abre em "Em preparo", o que está sendo cozinhado agora. */
  defaultTab?: 'preparing' | 'ready';
} = {}) {
  useRealtime(['cashier', 'floor'], [[QUERY_KEYS[0]], [QUERY_KEYS[1]]]);
  const qc = useQueryClient();
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'preparing' | 'ready' | 'history'>(defaultTab);

  const { data: deliveryOrders = [] } = useQuery({
    queryKey: [QUERY_KEYS[0]],
    queryFn: async () => (await api.get<Order[]>('/orders', { params: { orderType: 'DELIVERY' } })).data,
    refetchInterval: 10000,
    enabled: orderTypes.includes('DELIVERY'),
  });
  const { data: pickupOrders = [] } = useQuery({
    queryKey: [QUERY_KEYS[1]],
    queryFn: async () => (await api.get<Order[]>('/orders', { params: { orderType: 'PICKUP' } })).data,
    refetchInterval: 10000,
    enabled: orderTypes.includes('PICKUP'),
  });
  // Pedidos arquivados às 00:30 pela rotina noturna (esquecidos de um dia pro outro) — ver
  // archive-stale-online-orders.ts. Carrega sempre (não só quando a aba está aberta): a
  // aba "Histórico" precisa aparecer/contar mesmo antes de ser clicada, e sem isso o
  // painel inteiro sumiria de madrugada (sem pedido ao vivo) mesmo com histórico pra ver.
  const { data: deliveryHistory = [] } = useQuery({
    queryKey: [HISTORY_QUERY_KEYS[0]],
    queryFn: async () =>
      (await api.get<Order[]>('/orders', { params: { orderType: 'DELIVERY', archived: true } })).data,
    refetchInterval: 60000,
    enabled: orderTypes.includes('DELIVERY'),
  });
  const { data: pickupHistory = [] } = useQuery({
    queryKey: [HISTORY_QUERY_KEYS[1]],
    queryFn: async () =>
      (await api.get<Order[]>('/orders', { params: { orderType: 'PICKUP', archived: true } })).data,
    refetchInterval: 60000,
    enabled: orderTypes.includes('PICKUP'),
  });

  const orders = [...deliveryOrders, ...pickupOrders].filter(
    (o) => o.status !== 'PAID' && o.status !== 'CANCELLED' && (canAccept || o.status !== 'PENDING'),
  );
  const pending = orders.filter((o) => o.status === 'PENDING');
  // "Em preparo" (pendente de aceite + em produção) fica separado de "Prontos" (todos os
  // itens concluídos, só falta entregar/retirar) — antes ficavam todos juntos na mesma
  // lista, e um pedido pronto há um tempo (só esperando alguém marcar como entregue)
  // atrapalhava a visão de quem só quer ver o que ainda está sendo preparado.
  const preparing = orders.filter((o) => o.status === 'OPEN' || o.status === 'IN_PRODUCTION');
  const ready = orders.filter((o) => o.status === 'READY_FOR_PAYMENT');
  const history = [...deliveryHistory, ...pickupHistory];

  const refresh = () => {
    qc.invalidateQueries({ queryKey: [QUERY_KEYS[0]] });
    qc.invalidateQueries({ queryKey: [QUERY_KEYS[1]] });
    qc.invalidateQueries({ queryKey: [HISTORY_QUERY_KEYS[0]] });
    qc.invalidateQueries({ queryKey: [HISTORY_QUERY_KEYS[1]] });
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

  // "Histórico" é sempre alcançável mesmo sem nenhum pedido ao vivo no momento (ex.: painel
  // vazio de madrugada, mas com pedidos esquecidos arquivados ontem) — só esconde tudo (ou
  // mostra emptyMessage) quando não há absolutamente nada, nem ao vivo nem arquivado.
  if (orders.length === 0 && history.length === 0) {
    if (!emptyMessage) return null;
    return <p className="py-10 text-center text-sm text-gray-400">{emptyMessage}</p>;
  }

  const preparingCount = pending.length + preparing.length;

  return (
    <div className="mb-6">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">{title}</h2>

      <div className="mb-3 flex gap-2">
        <button
          className={`h-8 rounded-full px-3.5 text-[12.5px] font-semibold transition ${tab === 'preparing' ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'}`}
          onClick={() => setTab('preparing')}
        >
          Em preparo{preparingCount > 0 ? ` (${preparingCount})` : ''}
        </button>
        <button
          className={`h-8 rounded-full px-3.5 text-[12.5px] font-semibold transition ${tab === 'ready' ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'}`}
          onClick={() => setTab('ready')}
        >
          Prontos{ready.length > 0 ? ` (${ready.length})` : ''}
        </button>
        <button
          className={`h-8 rounded-full px-3.5 text-[12.5px] font-semibold transition ${tab === 'history' ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'}`}
          onClick={() => setTab('history')}
        >
          Histórico{history.length > 0 ? ` (${history.length})` : ''}
        </button>
      </div>

      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

      {tab === 'preparing' && preparingCount === 0 && (
        <p className="py-6 text-center text-sm text-gray-400">Nenhum pedido em preparo no momento.</p>
      )}
      {tab === 'ready' && ready.length === 0 && (
        <p className="py-6 text-center text-sm text-gray-400">Nenhum pedido pronto no momento.</p>
      )}
      {tab === 'history' && history.length === 0 && (
        <p className="py-6 text-center text-sm text-gray-400">
          Nenhum pedido arquivado. Todo dia às 00:30, pedidos online esquecidos do dia anterior caem aqui automaticamente.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {tab === 'preparing' && canAccept && pending.map((o) => (
          <OnlineOrderCard key={o.id} order={o} action={{ label: 'Aceitar Pedido', pending: accept.isPending, onClick: () => accept.mutate(o.id) }} />
        ))}
        {tab === 'preparing' && preparing.map((o) => <OnlineOrderCard key={o.id} order={o} />)}
        {tab === 'ready' && ready.map((o) => (
          <OnlineOrderCard
            key={o.id}
            order={o}
            action={{
              label: 'Marcar Entregue',
              pending: deliver.isPending,
              onClick: () => {
                if (window.confirm(`Confirmar entrega do pedido #${o.number}? Isso registra o pagamento (${o.declaredPaymentMethod ? paymentMethodLabels[o.declaredPaymentMethod] : '—'}).`)) {
                  deliver.mutate(o.id);
                }
              },
            }}
          />
        ))}
        {tab === 'history' && history.map((o) => (
          <OnlineOrderCard
            key={o.id}
            order={o}
            action={o.status === 'READY_FOR_PAYMENT' ? {
              label: 'Marcar Entregue',
              pending: deliver.isPending,
              onClick: () => {
                if (window.confirm(`Confirmar entrega do pedido #${o.number}? Isso registra o pagamento (${o.declaredPaymentMethod ? paymentMethodLabels[o.declaredPaymentMethod] : '—'}).`)) {
                  deliver.mutate(o.id);
                }
              },
            } : undefined}
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
  // Pedido arquivado pode ser de qualquer dia anterior — só a hora (como nas abas ao vivo,
  // sempre "hoje") ficaria ambígua, por isso mostra data + hora aqui.
  return (
    <Card className="!p-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-bold">
          <Icon size={16} className="text-brand" /> {orderTypeLabels[order.orderType]}
          <span className="font-normal text-gray-400">· #{order.number}</span>
        </span>
        <span className="text-xs text-gray-400">{order.archivedAt ? dateTime(order.openedAt) : time(order.openedAt)}</span>
      </div>
      {order.archivedAt && (
        <div className="mt-1 flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
          <Archive size={11} /> Arquivado em {dateTime(order.archivedAt)}
        </div>
      )}

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
            {order.deliveryCep ? ` · CEP ${order.deliveryCep}` : ''}
          </div>
        )}
      </div>

      <div className="mt-2 space-y-1 border-t border-gray-100 pt-2 dark:border-gray-800">
        {order.items.filter((i) => i.status !== 'CANCELLED').map((it) => (
          <div key={it.id} className="flex items-center justify-between text-xs">
            <span>{it.quantity}× {it.comboLabel ?? it.product.name}</span>
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

      {order.estimatedReadyAt && (
        <div className="mt-1 text-xs text-gray-500">
          Prometido ao cliente: até <span className="font-medium text-gray-700 dark:text-gray-300">{time(order.estimatedReadyAt)}</span>
        </div>
      )}

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
