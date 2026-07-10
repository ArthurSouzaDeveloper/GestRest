import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, Receipt } from 'lucide-react';
import api, { apiError } from '../lib/api';
import { brl, time } from '../lib/format';
import { Card, PageHeader, Spinner } from '../components/ui';
import { useRealtime } from '../hooks/useRealtime';
import type { Order, PaymentMethod } from '../types';

const METHODS: { key: PaymentMethod; label: string }[] = [
  { key: 'PIX', label: 'PIX' },
  { key: 'CASH', label: 'Dinheiro' },
  { key: 'CREDIT', label: 'Crédito' },
  { key: 'DEBIT', label: 'Débito' },
  { key: 'MEAL_VOUCHER', label: 'Vale Alim.' },
];

export default function Cashier() {
  useRealtime(['cashier'], [['ready-orders']]);
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['ready-orders'],
    queryFn: async () =>
      (await api.get<Order[]>('/orders', { params: { status: 'READY_FOR_PAYMENT' } })).data,
    refetchInterval: 8000,
  });

  useEffect(() => {
    if (!selectedId && orders.length) setSelectedId(orders[0].id);
    if (selectedId && !orders.find((o) => o.id === selectedId)) setSelectedId(orders[0]?.id ?? null);
  }, [orders, selectedId]);

  if (isLoading) return <Spinner />;

  const selected = orders.find((o) => o.id === selectedId) ?? null;

  return (
    <div>
      <PageHeader title="Caixa" subtitle="Pedidos prontos para pagamento" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
        {/* Left: ready orders */}
        <div className="space-y-2">
          {orders.length === 0 && <div className="card p-6 text-center text-sm text-gray-400">Nenhum pedido pronto.</div>}
          {orders.map((o) => (
            <button
              key={o.id}
              onClick={() => setSelectedId(o.id)}
              className={`w-full rounded-lg border p-3 text-left transition ${
                o.id === selectedId ? 'border-brand bg-brand-50 dark:bg-brand/20' : 'border-gray-200 dark:border-gray-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold">Mesa {o.table.number}</span>
                <span className="font-semibold text-brand">{brl(o.totals.total)}</span>
              </div>
              <div className="text-xs text-gray-500">
                {o.customer?.name ?? 'Sem nome'} · {o.items.length} itens · {time(o.openedAt)}
              </div>
            </button>
          ))}
        </div>

        {/* Right: detail + payment */}
        {selected ? <PaymentPanel order={selected} onPaid={() => qc.invalidateQueries({ queryKey: ['ready-orders'] })} /> : (
          <div className="card flex items-center justify-center p-10 text-gray-400">
            <Receipt className="mr-2" /> Selecione um pedido
          </div>
        )}
      </div>
    </div>
  );
}

function PaymentPanel({ order, onPaid }: { order: Order; onPaid: () => void }) {
  const qc = useQueryClient();
  const [discount, setDiscount] = useState(order.discount);
  const [lines, setLines] = useState<{ method: PaymentMethod; amount: number; cashReceived?: number }[]>([]);
  const [error, setError] = useState('');

  useEffect(() => setDiscount(order.discount), [order.id, order.discount]);

  const updateOrder = useMutation({
    mutationFn: async (d: number) =>
      api.patch(`/orders/${order.id}`, { discount: d, version: order.version }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ready-orders'] }),
    onError: (e) => setError(apiError(e)),
  });

  const cancelItem = useMutation({
    mutationFn: async (itemId: string) => api.delete(`/orders/items/${itemId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ready-orders'] }),
  });

  const pay = useMutation({
    mutationFn: async () => api.post(`/orders/${order.id}/pay`, { payments: lines }),
    onSuccess: () => {
      setLines([]);
      onPaid();
    },
    onError: (e) => setError(apiError(e)),
  });

  const paying = lines.reduce((a, l) => a + l.amount, 0);
  const remaining = Math.max(0, order.totals.remaining - paying);
  const change = lines
    .filter((l) => l.method === 'CASH' && l.cashReceived)
    .reduce((a, l) => a + Math.max(0, (l.cashReceived ?? 0) - l.amount), 0);

  const addLine = (method: PaymentMethod) => {
    setLines([...lines, { method, amount: Math.round(remaining * 100) / 100 }]);
  };

  return (
    <Card className="!p-0">
      <div className="border-b border-gray-100 p-4 dark:border-gray-800">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Mesa {order.table.number} — Comanda #{order.number}</h3>
          <span className="text-xs text-gray-500">Garçom: {order.waiter.name}</span>
        </div>
      </div>

      {/* Items */}
      <div className="max-h-[38vh] overflow-y-auto p-4">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-gray-400">
            <tr>
              <th className="pb-2">Item</th>
              <th className="pb-2 text-center">Qtd</th>
              <th className="pb-2 text-right">Unit.</th>
              <th className="pb-2 text-right">Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {order.items.filter((i) => i.status !== 'CANCELLED').map((it) => {
              const addl = it.additionals.reduce((a, x) => a + x.price, 0);
              return (
                <tr key={it.id} className="border-t border-gray-50 dark:border-gray-800">
                  <td className="py-2">
                    {it.product.name}
                    {it.additionals.length > 0 && (
                      <div className="text-xs text-gray-400">+ {it.additionals.map((a) => a.name).join(', ')}</div>
                    )}
                  </td>
                  <td className="text-center">{it.quantity}</td>
                  <td className="text-right">{brl(it.unitPrice + addl)}</td>
                  <td className="text-right font-medium">{brl((it.unitPrice + addl) * it.quantity)}</td>
                  <td className="pl-2 text-right">
                    <button className="text-red-400 hover:text-red-600" onClick={() => cancelItem.mutate(it.id)}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Totals + discount */}
      <div className="space-y-1 border-t border-gray-100 p-4 text-sm dark:border-gray-800">
        <Row label="Subtotal" value={brl(order.totals.subtotal)} />
        <div className="flex items-center justify-between">
          <span className="text-gray-500">Desconto</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              className="input !w-24 !py-1 text-right"
              value={discount}
              min={0}
              onChange={(e) => setDiscount(Number(e.target.value))}
              onBlur={() => discount !== order.discount && updateOrder.mutate(discount)}
            />
          </div>
        </div>
        <Row label={`Taxa de serviço (${order.serviceRate}%)`} value={brl(order.totals.serviceFee)} />
        <div className="flex justify-between border-t border-gray-100 pt-2 text-base font-semibold dark:border-gray-800">
          <span>Valor Final</span>
          <span className="text-brand">{brl(order.totals.total)}</span>
        </div>
      </div>

      {/* Payment */}
      <div className="border-t border-gray-100 p-4 dark:border-gray-800">
        <div className="mb-2 text-sm font-medium">Pagamento</div>
        <div className="mb-3 flex flex-wrap gap-2">
          {METHODS.map((m) => (
            <button key={m.key} className="btn-secondary text-xs" onClick={() => addLine(m.key)}>
              + {m.label}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="w-24">{METHODS.find((m) => m.key === l.method)?.label}</span>
              <input
                type="number"
                className="input !w-28 !py-1 text-right"
                value={l.amount}
                onChange={(e) => {
                  const next = [...lines];
                  next[i] = { ...next[i], amount: Number(e.target.value) };
                  setLines(next);
                }}
              />
              {l.method === 'CASH' && (
                <input
                  type="number"
                  placeholder="Recebido"
                  className="input !w-28 !py-1 text-right"
                  value={l.cashReceived ?? ''}
                  onChange={(e) => {
                    const next = [...lines];
                    next[i] = { ...next[i], cashReceived: Number(e.target.value) };
                    setLines(next);
                  }}
                />
              )}
              <button className="text-red-400" onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        <div className="mt-3 space-y-1 text-sm">
          <Row label="Total a pagar" value={brl(order.totals.total)} />
          <Row label="Recebido" value={brl(paying)} />
          {remaining > 0 && <Row label="Falta" value={brl(remaining)} accent="text-red-600" />}
          {change > 0 && <Row label="Troco" value={brl(change)} accent="text-green-600" />}
        </div>

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        <button
          className="btn-success mt-3 w-full !py-3"
          disabled={lines.length === 0 || remaining > 0.001 || pay.isPending}
          onClick={() => { setError(''); pay.mutate(); }}
        >
          {pay.isPending ? 'Processando...' : 'Finalizar Pagamento'}
        </button>
      </div>
    </Card>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className={`font-medium ${accent ?? ''}`}>{value}</span>
    </div>
  );
}
