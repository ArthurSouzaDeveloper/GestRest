import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import api, { apiError } from '../lib/api';
import { brl, time } from '../lib/format';
import { Card, Modal, PageHeader, ProductionBadge, Spinner, tableClass, tableLabels } from '../components/ui';
import { OrderComposer, DraftItem } from '../components/OrderComposer';
import { useRealtime } from '../hooks/useRealtime';
import type { Order, RestaurantTable } from '../types';

export default function Tables() {
  useRealtime(['floor'], [['tables'], ['orders']]);
  const qc = useQueryClient();
  const [openTable, setOpenTable] = useState<RestaurantTable | null>(null);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);

  const { data: tables = [], isLoading } = useQuery({
    queryKey: ['tables'],
    queryFn: async () => (await api.get<RestaurantTable[]>('/tables')).data,
  });

  const openMutation = useMutation({
    mutationFn: async (payload: { tableId: string; customerName?: string; peopleCount: number; notes?: string }) =>
      (await api.post<Order>('/orders', payload)).data,
    onSuccess: (order) => {
      qc.invalidateQueries({ queryKey: ['tables'] });
      setOpenTable(null);
      setActiveOrderId(order.id);
    },
  });

  if (isLoading) return <Spinner />;

  const activeOrderIdForTable = (t: RestaurantTable) => t.orders?.[0]?.id ?? null;

  return (
    <div>
      <PageHeader title="Mesas" subtitle="Selecione uma mesa para abrir ou lançar pedidos" />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
        {tables.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              if (t.status === 'FREE') setOpenTable(t);
              else setActiveOrderId(activeOrderIdForTable(t));
            }}
            className={`rounded-lg border-2 p-4 text-left transition hover:shadow ${tableClass(t.status)}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold">{t.number}</span>
              <span className="flex items-center gap-1 text-xs opacity-70">
                <Users size={12} /> {t.seats}
              </span>
            </div>
            <div className="mt-2 text-xs font-medium">{tableLabels[t.status]}</div>
          </button>
        ))}
      </div>

      {/* Open table modal */}
      <OpenTableModal
        table={openTable}
        onClose={() => setOpenTable(null)}
        onSubmit={(v) => openTable && openMutation.mutate({ tableId: openTable.id, ...v })}
        error={openMutation.isError ? apiError(openMutation.error) : ''}
        loading={openMutation.isPending}
      />

      {/* Order detail / composer */}
      {activeOrderId && <OrderModal orderId={activeOrderId} onClose={() => setActiveOrderId(null)} />}
    </div>
  );
}

function OpenTableModal({
  table,
  onClose,
  onSubmit,
  error,
  loading,
}: {
  table: RestaurantTable | null;
  onClose: () => void;
  onSubmit: (v: { customerName?: string; peopleCount: number; notes?: string }) => void;
  error: string;
  loading: boolean;
}) {
  const [customerName, setName] = useState('');
  const [peopleCount, setPeople] = useState(2);
  const [notes, setNotes] = useState('');

  return (
    <Modal open={!!table} onClose={onClose} title={`Abrir Mesa ${table?.number ?? ''}`}>
      <div className="space-y-4">
        <div>
          <label className="label">Nome do cliente (opcional)</label>
          <input className="input" value={customerName} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">Quantidade de pessoas</label>
          <input
            className="input"
            type="number"
            min={1}
            value={peopleCount}
            onChange={(e) => setPeople(Number(e.target.value))}
          />
        </div>
        <div>
          <label className="label">Observações gerais</label>
          <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button
            className="btn-primary"
            disabled={loading}
            onClick={() => onSubmit({ customerName: customerName || undefined, peopleCount, notes: notes || undefined })}
          >
            {loading ? 'Abrindo...' : 'Abrir Mesa'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function OrderModal({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<DraftItem[]>([]);

  const { data: order, isLoading } = useQuery({
    queryKey: ['orders', orderId],
    queryFn: async () => (await api.get<Order>(`/orders/${orderId}`)).data,
    refetchInterval: 5000,
  });

  const addItems = useMutation({
    mutationFn: async () =>
      api.post(`/orders/${orderId}/items`, {
        items: draft.map((d) => ({
          productId: d.product.id,
          quantity: d.quantity,
          notes: d.notes || undefined,
          additionalIds: d.additionalIds,
        })),
      }),
    onSuccess: () => {
      setDraft([]);
      qc.invalidateQueries({ queryKey: ['orders', orderId] });
      qc.invalidateQueries({ queryKey: ['tables'] });
    },
  });

  return (
    <Modal open onClose={onClose} title={order ? `Mesa ${order.table.number} — Comanda #${order.number}` : 'Pedido'} wide>
      {isLoading || !order ? (
        <Spinner />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
            <span>Cliente: {order.customer?.name ?? '—'}</span>
            <span>Garçom: {order.waiter.name}</span>
            <span>Aberta às {time(order.openedAt)}</span>
          </div>

          {/* Existing items */}
          {order.items.length > 0 && (
            <Card className="!p-3">
              <div className="mb-2 text-sm font-medium">Itens lançados</div>
              <div className="space-y-1.5">
                {order.items.map((it) => (
                  <div key={it.id} className="flex items-center justify-between text-sm">
                    <div>
                      <span className="font-medium">{it.quantity}× {it.product.name}</span>
                      {it.additionals.length > 0 && (
                        <span className="text-xs text-gray-500"> ({it.additionals.map((a) => a.name).join(', ')})</span>
                      )}
                      {it.notes && <span className="ml-1 text-xs italic text-gray-500">— {it.notes}</span>}
                    </div>
                    <ProductionBadge status={it.status} />
                  </div>
                ))}
              </div>
              <div className="mt-3 flex justify-between border-t border-gray-100 pt-2 text-sm dark:border-gray-800">
                <span className="text-gray-500">Total parcial</span>
                <span className="font-semibold">{brl(order.totals.total)}</span>
              </div>
            </Card>
          )}

          {/* Composer */}
          <div>
            <div className="mb-2 text-sm font-medium">Adicionar itens</div>
            <OrderComposer draft={draft} setDraft={setDraft} />
          </div>

          <div className="flex justify-end gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
            <button className="btn-secondary" onClick={onClose}>Fechar</button>
            <button
              className="btn-primary"
              disabled={draft.length === 0 || addItems.isPending}
              onClick={() => addItems.mutate()}
            >
              {addItems.isPending ? 'Enviando...' : `Confirmar Pedido (${draft.reduce((a, d) => a + d.quantity, 0)})`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
