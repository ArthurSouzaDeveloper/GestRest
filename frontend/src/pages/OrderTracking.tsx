import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Check, Clock, ShoppingBag, ChefHat, PartyPopper, XCircle } from 'lucide-react';
import api from '../lib/api';
import { brl } from '../lib/format';
import { Spinner } from '../components/ui';
import type { OrderStatus, OrderType } from '../types';

interface PublicOrderStatus {
  number: number;
  status: OrderStatus;
  orderType: OrderType;
  estimatedReadyAt: string | null;
  acceptedAt: string | null;
  items: { name: string; quantity: number; status: string }[];
  total: number;
}

interface PublicRestaurant {
  name: string;
  slug: string;
  active: boolean;
}

const STEPS = [
  { key: 'received', label: 'Recebido', icon: Check },
  { key: 'preparing', label: 'Em preparo', icon: ChefHat },
  { key: 'ready', label: 'Pronto', icon: ShoppingBag },
  { key: 'done', label: 'Entregue', icon: PartyPopper },
] as const;

/** Quantos passos do stepper já ficaram pra trás, dado o status real do pedido. */
function stepIndex(status: OrderStatus): number {
  switch (status) {
    case 'PENDING':
      return 0;
    case 'OPEN':
    case 'IN_PRODUCTION':
      return 1;
    case 'READY_FOR_PAYMENT':
      return 2;
    case 'PAID':
      return 3;
    default:
      return 0;
  }
}

export default function OrderTracking() {
  const { slug = '', orderId = '' } = useParams();

  const { data: restaurant } = useQuery({
    queryKey: ['public-restaurant', slug],
    queryFn: async () => (await api.get<PublicRestaurant>(`/public/restaurants/${slug}`)).data,
    enabled: !!slug,
    retry: false,
  });

  const { data: order, isLoading, isError } = useQuery({
    queryKey: ['public-order-status', slug, orderId],
    queryFn: async () => (await api.get<PublicOrderStatus>(`/public/${slug}/orders/${orderId}`)).data,
    enabled: !!slug && !!orderId,
    refetchInterval: 20_000,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
        <Spinner />
      </div>
    );
  }

  if (isError || !order) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4 text-center dark:bg-gray-950">
        <div className="max-w-sm rounded-2xl border border-[#351C4D]/10 bg-white p-8">
          <h1 className="text-lg font-bold text-[#351C4D]">Pedido não encontrado</h1>
          <p className="mt-1 text-sm text-gray-500">Confira se o link de acompanhamento está certo.</p>
        </div>
      </div>
    );
  }

  const cancelled = order.status === 'CANCELLED';
  const current = stepIndex(order.status);
  const isPickup = order.orderType === 'PICKUP';

  return (
    <div className="min-h-screen bg-[#FBF7FC] pb-10 dark:bg-[#FBF7FC]">
      <div className="bg-gradient-to-br from-[#6D2E9E] to-[#4A1D72] px-4 py-5 text-center">
        <div className="mx-auto max-w-md">
          <span className="text-xs font-semibold text-white/75">{restaurant?.name ?? 'Acompanhar pedido'}</span>
          <h1 className="mt-0.5 text-xl font-extrabold text-white">Pedido #{order.number}</h1>
        </div>
      </div>

      <div className="mx-auto max-w-md px-4 pt-6">
        {cancelled ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-900 dark:bg-red-900/20">
            <XCircle className="text-red-500" size={32} />
            <p className="font-semibold text-red-700 dark:text-red-300">Este pedido foi cancelado.</p>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between">
              {STEPS.map((step, i) => {
                const Icon = step.icon;
                const done = i <= current;
                return (
                  <div key={step.key} className="flex flex-1 flex-col items-center gap-1.5 text-center">
                    <div className="flex w-full items-center">
                      {i > 0 && <span className={`h-0.5 flex-1 ${i <= current ? 'bg-[#6D2E9E]' : 'bg-gray-200'}`} />}
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                          done ? 'bg-[#6D2E9E] text-white' : 'bg-gray-100 text-gray-400'
                        }`}
                      >
                        <Icon size={16} />
                      </span>
                      {i < STEPS.length - 1 && (
                        <span className={`h-0.5 flex-1 ${i < current ? 'bg-[#6D2E9E]' : 'bg-gray-200'}`} />
                      )}
                    </div>
                    <span className={`text-[11px] font-semibold ${done ? 'text-[#351C4D]' : 'text-gray-400'}`}>
                      {i === 2 && isPickup ? 'Pronto p/ retirar' : step.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {order.status === 'PENDING' && (
              <p className="mt-6 text-center text-sm text-gray-500">Aguardando a loja confirmar seu pedido.</p>
            )}
            {(order.status === 'OPEN' || order.status === 'IN_PRODUCTION') && (
              <p className="mt-6 text-center text-sm text-gray-500">Seu pedido já está sendo preparado.</p>
            )}
            {order.status === 'READY_FOR_PAYMENT' && (
              <p className="mt-6 text-center text-sm text-gray-500">
                {isPickup ? 'Pronto! Pode vir retirar.' : 'Pronto! Saindo para entrega.'}
              </p>
            )}
            {order.status === 'PAID' && (
              <p className="mt-6 text-center text-sm font-medium text-[#6D2E9E]">
                {isPickup ? 'Retirado — obrigado pela preferência!' : 'Entregue — obrigado pela preferência!'}
              </p>
            )}

            {order.estimatedReadyAt && order.status !== 'PAID' && (
              <div className="mx-auto mt-4 flex w-fit items-center gap-2 rounded-lg bg-[#F3E8FB] px-3 py-2 text-xs font-medium text-[#6D2E9E]">
                <Clock size={14} />
                Previsão: até{' '}
                {new Date(order.estimatedReadyAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
          </>
        )}

        <div className="mt-6 rounded-2xl border border-[#351C4D]/10 bg-white p-4">
          <div className="text-sm font-semibold text-[#351C4D]">Itens</div>
          <div className="mt-2 space-y-1.5 text-sm">
            {order.items.map((item, i) => (
              <div key={i} className="flex justify-between text-gray-600">
                <span>{item.quantity}× {item.name}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-between border-t border-gray-100 pt-3 text-sm font-semibold text-[#351C4D] dark:border-gray-800">
            <span>Total</span>
            <span>{brl(order.total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
