import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, AlertTriangle, Check } from 'lucide-react';
import clsx from 'clsx';
import api from '../lib/api';
import { PageHeader, Spinner, orderTypeLabels } from './ui';
import { useRealtime } from '../hooks/useRealtime';
import type { ProductionTicket } from '../types';

interface Props {
  title: string;
  subtitle: string;
  endpoint: string; // '/production/kitchen' | '/production/juice-bar'
  room: string; // 'kitchen' | 'juice_bar'
  queryKey: string;
}

interface OrderBlock {
  orderId: string;
  tableNumber: number | null;
  orderType: ProductionTicket['orderType'];
  orderNumber: number;
  customerName: string | null;
  waitingMin: number;
  critical: boolean;
  items: ProductionTicket[];
}

/** Agrupa os itens (um por linha vinda do backend) em um bloco por pedido — pedido de
 * mesa com 3 itens virava 3 cards espalhados na tela, agora vira 1 card só. Mantém a
 * ordem de chegada (o backend já devolve mais antigo primeiro). */
function groupByOrder(tickets: ProductionTicket[]): OrderBlock[] {
  const blocks = new Map<string, OrderBlock>();
  for (const t of tickets) {
    let block = blocks.get(t.orderId);
    if (!block) {
      block = {
        orderId: t.orderId,
        tableNumber: t.tableNumber,
        orderType: t.orderType,
        orderNumber: t.orderNumber,
        customerName: t.customerName,
        waitingMin: t.waitingMin,
        critical: t.critical,
        items: [],
      };
      blocks.set(t.orderId, block);
    }
    block.waitingMin = Math.max(block.waitingMin, t.waitingMin);
    block.critical = block.critical || t.critical;
    block.items.push(t);
  }
  return [...blocks.values()];
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

  const blocks = useMemo(() => groupByOrder(tickets), [tickets]);

  // Sem etapa intermediária de "aceitar"/"preparando" — assim que os itens aparecem já
  // estão em produção; um clique só marca todo o bloco do pedido como concluído de uma
  // vez (pedido do dono do restaurante, pra não precisar ficar mexendo item por item).
  const completeOrder = useMutation({
    mutationFn: async (items: ProductionTicket[]) =>
      Promise.all(items.map((item) => api.post(`/orders/items/${item.id}/status`, { status: 'DONE' }))),
    onSuccess: () => qc.invalidateQueries({ queryKey: [queryKey] }),
  });

  if (isLoading) return <Spinner />;

  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} action={<span className="text-sm text-gray-500">{tickets.length} em fila</span>} />

      {blocks.length === 0 ? (
        <div className="card p-10 text-center text-gray-400">
          <Check size={22} className="mx-auto mb-2 text-green-500" />
          Nenhum item na fila
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {blocks.map((block) => (
            <div
              key={block.orderId}
              className={clsx('card flex flex-col p-4', block.critical && 'border-red-400 ring-1 ring-red-300')}
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="rounded-md bg-brand px-3 py-1.5 text-base font-bold text-white">
                    {block.tableNumber !== null ? `Mesa ${block.tableNumber}` : orderTypeLabels[block.orderType]}
                  </span>
                  {/* Uma mesa pode ter várias comandas simultâneas — o nº da comanda desambigua. */}
                  <span className="rounded-md bg-gray-100 px-2.5 py-1.5 text-sm font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                    #{block.orderNumber}
                  </span>
                </span>
                <span
                  className={clsx(
                    'flex items-center gap-1 text-base font-medium',
                    block.critical ? 'text-red-600' : 'text-gray-500',
                  )}
                >
                  {block.critical ? <AlertTriangle size={18} /> : <Clock size={18} />}
                  {block.waitingMin} min
                </span>
              </div>
              {block.customerName && <div className="mt-1 text-sm text-gray-500">Cliente: {block.customerName}</div>}

              <div className="mt-3 flex flex-col divide-y divide-gray-100 dark:divide-gray-800">
                {block.items.map((item) => (
                  <div key={item.id} className="py-3 first:pt-0 last:pb-0">
                    {/* Categoria em destaque logo acima do sabor — só na Cozinha, onde o
                        mesmo sabor pode existir em categorias diferentes (ex.: "Mussarela"
                        no Pastel e na Mini Pizza). Nos Suqueiros só mostraria "SUCOS" em
                        todo item, sem servir pra nada — mesma regra do ticket impresso
                        (ver escpos.helpers.ts). */}
                    {room === 'kitchen' && (
                      <div className="text-sm font-bold uppercase tracking-wide text-brand dark:text-brand-100">
                        {item.category}
                      </div>
                    )}
                    <div className="text-2xl font-bold leading-tight">
                      {item.quantity}× {item.productName}
                    </div>
                    {item.additionals.length > 0 && (
                      <div className="mt-1 text-base text-gray-600 dark:text-gray-300">
                        <span className="font-medium">Adicionais:</span> {item.additionals.join(', ')}
                      </div>
                    )}
                    {item.notes && (
                      <div className="mt-1 rounded bg-yellow-50 px-2.5 py-1.5 text-base italic text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200">
                        {item.notes}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <button
                className="btn-success mt-4 !py-3 text-base"
                disabled={completeOrder.isPending}
                onClick={() => completeOrder.mutate(block.items)}
              >
                Concluído
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
