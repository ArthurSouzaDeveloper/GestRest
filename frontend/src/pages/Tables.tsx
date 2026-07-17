import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Users, XCircle } from 'lucide-react';
import api, { apiError } from '../lib/api';
import { brl, time } from '../lib/format';
import {
  Card,
  Modal,
  PageHeader,
  ProductionBadge,
  Spinner,
  orderStatusLabels,
  tableClass,
  tableLabels,
} from '../components/ui';
import { OrderComposer, DraftItem, draftItemUnitPrice } from '../components/OrderComposer';
import { useRealtime } from '../hooks/useRealtime';
import type { Order, RestaurantTable } from '../types';

export default function Tables() {
  useRealtime(['floor'], [['tables'], ['orders']]);
  const qc = useQueryClient();
  const [openTable, setOpenTable] = useState<RestaurantTable | null>(null);
  const [comandasTable, setComandasTable] = useState<RestaurantTable | null>(null);
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

  // Keeps the comandas list modal in sync with fresh data after a refetch (realtime or otherwise).
  const liveComandasTable = comandasTable ? tables.find((t) => t.id === comandasTable.id) ?? null : null;

  return (
    <div>
      <PageHeader
        title="Mesas"
        subtitle="Uma mesa pode ter várias comandas abertas ao mesmo tempo — cada grupo fecha a sua"
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
        {tables.map((t) => {
          const comandaCount = t.orders?.length ?? 0;
          return (
            <button
              key={t.id}
              onClick={() => (comandaCount === 0 ? setOpenTable(t) : setComandasTable(t))}
              className={`relative rounded-lg border-2 p-4 text-left transition hover:shadow ${tableClass(t.status)}`}
            >
              {comandaCount > 1 && (
                <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs font-bold text-white shadow">
                  {comandaCount}
                </span>
              )}
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">{t.number}</span>
                <span className="flex items-center gap-1 text-xs opacity-70">
                  <Users size={12} /> {t.seats}
                </span>
              </div>
              <div className="mt-2 text-xs font-medium">{tableLabels[t.status]}</div>
              {comandaCount > 1 && <div className="text-[11px] opacity-70">{comandaCount} comandas</div>}
            </button>
          );
        })}
      </div>

      {/* Comandas list for a table that already has one or more open */}
      <ComandasListModal
        table={liveComandasTable}
        onClose={() => setComandasTable(null)}
        onPick={(orderId) => {
          setComandasTable(null);
          setActiveOrderId(orderId);
        }}
        onNewComanda={(table) => {
          setComandasTable(null);
          setOpenTable(table);
        }}
      />

      {/* Open table / new comanda modal */}
      <OpenTableModal
        table={openTable}
        isAdditional={(openTable?.orders?.length ?? 0) > 0}
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

function ComandasListModal({
  table,
  onClose,
  onPick,
  onNewComanda,
}: {
  table: RestaurantTable | null;
  onClose: () => void;
  onPick: (orderId: string) => void;
  onNewComanda: (table: RestaurantTable) => void;
}) {
  const comandas = table?.orders ?? [];
  return (
    <Modal open={!!table} onClose={onClose} title={`Mesa ${table?.number ?? ''} — Comandas`}>
      <div className="space-y-3">
        {comandas.length === 0 && <p className="text-sm text-gray-400">Nenhuma comanda aberta nesta mesa.</p>}
        <div className="space-y-2">
          {comandas.map((o) => (
            <button
              key={o.id}
              onClick={() => onPick(o.id)}
              className="card flex w-full items-center justify-between p-3 text-left transition hover:border-brand hover:shadow"
            >
              <div>
                <div className="text-sm font-medium">
                  Comanda #{o.number} {o.customer?.name ? `— ${o.customer.name}` : ''}
                </div>
                <div className="text-xs text-gray-500">
                  {o.peopleCount} pessoa(s) · aberta às {time(o.openedAt)}
                </div>
              </div>
              <span className="text-xs font-medium text-gray-500">{orderStatusLabels[o.status]}</span>
            </button>
          ))}
        </div>
        <button
          className="btn-secondary w-full"
          onClick={() => table && onNewComanda(table)}
        >
          <Plus size={16} /> Nova comanda nesta mesa
        </button>
      </div>
    </Modal>
  );
}

function OpenTableModal({
  table,
  isAdditional,
  onClose,
  onSubmit,
  error,
  loading,
}: {
  table: RestaurantTable | null;
  isAdditional: boolean;
  onClose: () => void;
  onSubmit: (v: { customerName?: string; peopleCount: number; notes?: string }) => void;
  error: string;
  loading: boolean;
}) {
  const [customerName, setName] = useState('');
  const [peopleCount, setPeople] = useState(2);
  const [notes, setNotes] = useState('');

  return (
    <Modal
      open={!!table}
      onClose={onClose}
      title={isAdditional ? `Nova Comanda — Mesa ${table?.number ?? ''}` : `Abrir Mesa ${table?.number ?? ''}`}
    >
      <div className="space-y-4">
        {isAdditional && (
          <p className="text-xs text-gray-500">
            Esta mesa já tem comanda(s) aberta(s). Esta será uma comanda separada, com conta própria.
          </p>
        )}
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
            {loading ? 'Abrindo...' : isAdditional ? 'Abrir Comanda' : 'Abrir Mesa'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function OrderModal({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<DraftItem[]>([]);
  const [error, setError] = useState('');

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

  const cancelItem = useMutation({
    mutationFn: async (itemId: string) => api.delete(`/orders/items/${itemId}`),
    onSuccess: () => {
      setError('');
      qc.invalidateQueries({ queryKey: ['orders', orderId] });
      qc.invalidateQueries({ queryKey: ['tables'] });
    },
    onError: (e) => setError(apiError(e)),
  });

  const cancelOrder = useMutation({
    mutationFn: async () => api.post(`/orders/${orderId}/cancel`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tables'] });
      onClose();
    },
    onError: (e) => setError(apiError(e)),
  });

  const draftCount = draft.reduce((a, d) => a + d.quantity, 0);
  const draftTotal = draft.reduce((a, d) => a + draftItemUnitPrice(d) * d.quantity, 0);

  return (
    <Modal open onClose={onClose} title={order ? `Mesa ${order.table?.number ?? '—'} — Comanda #${order.number}` : 'Pedido'} wide>
      {isLoading || !order ? (
        <Spinner />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
              <span>Cliente: {order.customer?.name ?? '—'}</span>
              <span>Garçom: {order.waiter?.name ?? '—'}</span>
              <span className="flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-800 dark:bg-green-900/30 dark:text-green-200">
                <span className="h-1.5 w-1.5 rounded-full bg-green-600 dark:bg-green-300" />
                Aberta às {time(order.openedAt)}
              </span>
            </div>
            {order.status !== 'CANCELLED' && (
              <button
                className="flex items-center gap-1 text-xs font-medium text-red-500 hover:text-red-700"
                disabled={cancelOrder.isPending}
                onClick={() => {
                  if (window.confirm('Cancelar esta comanda inteira? Só é possível antes de a cozinha começar a preparar.')) {
                    cancelOrder.mutate();
                  }
                }}
              >
                <XCircle size={14} /> Cancelar comanda
              </button>
            )}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}

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
                    <div className="flex items-center gap-2">
                      <ProductionBadge status={it.status} />
                      {it.status !== 'CANCELLED' && (
                        <button
                          className="text-gray-400 hover:text-red-600"
                          title="Cancelar item (lançado por engano)"
                          disabled={cancelItem.isPending}
                          onClick={() => {
                            if (window.confirm(`Cancelar ${it.product.name}?`)) cancelItem.mutate(it.id);
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
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

          <div className="sticky bottom-0 -mx-6 -mb-6 border-t border-gray-100 bg-white px-6 py-3 dark:border-gray-800 dark:bg-gray-900">
            {draftCount > 0 ? (
              <div className="flex items-center justify-between gap-4 rounded-2xl bg-brand px-5 py-3.5 shadow-lg shadow-brand/25">
                <div className="flex flex-col leading-tight">
                  <span className="text-xs font-semibold text-white/85">
                    {draftCount} {draftCount === 1 ? 'item' : 'itens'}
                  </span>
                  <span className="text-lg font-extrabold text-white">{brl(draftTotal)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button className="text-sm font-medium text-white/80 hover:text-white" onClick={onClose}>
                    Fechar
                  </button>
                  <button
                    className="h-10 rounded-lg bg-white px-5 text-sm font-bold text-brand disabled:opacity-60"
                    disabled={addItems.isPending}
                    onClick={() => addItems.mutate()}
                  >
                    {addItems.isPending ? 'Enviando...' : 'Confirmar Pedido'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex justify-end">
                <button className="btn-secondary" onClick={onClose}>Fechar</button>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
