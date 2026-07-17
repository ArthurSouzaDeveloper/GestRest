import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bike, ChevronLeft, ShoppingBag, BookOpen, Minus, Plus, X } from 'lucide-react';
import api from '../lib/api';
import { brl } from '../lib/format';
import { Spinner } from '../components/ui';
import { OrderComposer, draftItemUnitPrice, type DraftItem } from '../components/OrderComposer';
import type { DeliveryZone } from '../types';

type Step = 'intro' | 'details' | 'menu' | 'cart';
type OrderKind = 'DELIVERY' | 'PICKUP';

interface PublicRestaurant {
  name: string;
  slug: string;
  active: boolean;
}

/**
 * Site público de pedidos (delivery/retirada) — sem login, alcançado por um link
 * (ex.: resposta automática do WhatsApp). Reaproveita o mesmo catálogo/carrinho que a
 * equipe usa (OrderComposer com basePath), mas com uma casca própria, mobile-first,
 * sem nada da tela autenticada da equipe.
 */
export default function PublicOrder() {
  const { slug = '' } = useParams();
  const [step, setStep] = useState<Step>('intro');
  const [orderKind, setOrderKind] = useState<OrderKind | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryZoneId, setDeliveryZoneId] = useState('');
  const [deliveryStreet, setDeliveryStreet] = useState('');
  const [deliveryNumber, setDeliveryNumber] = useState('');
  const [deliveryComplement, setDeliveryComplement] = useState('');
  const [draft, setDraft] = useState<DraftItem[]>([]);

  const { data: restaurant, isLoading: loadingRestaurant, isError: restaurantNotFound } = useQuery({
    queryKey: ['public-restaurant', slug],
    queryFn: async () => (await api.get<PublicRestaurant>(`/public/restaurants/${slug}`)).data,
    enabled: !!slug,
    retry: false,
  });

  const { data: zones = [] } = useQuery({
    queryKey: ['public-delivery-zones', slug],
    queryFn: async () => (await api.get<DeliveryZone[]>(`/public/${slug}/delivery-zones`)).data,
    enabled: !!slug && orderKind === 'DELIVERY',
  });

  const selectedZone = zones.find((z) => z.id === deliveryZoneId) ?? null;
  const deliveryFee = orderKind === 'DELIVERY' ? selectedZone?.fee ?? 0 : 0;

  const itemCount = draft.reduce((a, d) => a + d.quantity, 0);
  const subtotal = draft.reduce((a, d) => a + draftItemUnitPrice(d) * d.quantity, 0);
  const total = subtotal + deliveryFee;

  const canContinueDetails =
    customerName.trim().length >= 2 &&
    customerPhone.trim().length >= 8 &&
    (orderKind === 'PICKUP' || (deliveryZoneId && deliveryStreet.trim() && deliveryNumber.trim()));

  if (loadingRestaurant) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (restaurantNotFound || !restaurant) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4 text-center dark:bg-gray-950">
        <div className="card max-w-sm p-8">
          <h1 className="text-xl font-semibold">Restaurante não encontrado</h1>
          <p className="mt-1 text-sm text-gray-500">Verifique o link enviado pelo restaurante.</p>
        </div>
      </div>
    );
  }

  if (!restaurant.active) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4 text-center dark:bg-gray-950">
        <div className="card max-w-sm p-8">
          <h1 className="text-xl font-semibold">{restaurant.name}</h1>
          <p className="mt-2 text-sm text-red-600">
            Este restaurante não está aceitando pedidos online no momento.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <PublicHeader
        restaurantName={restaurant.name}
        step={step}
        onBack={() => {
          if (step === 'cart') setStep('menu');
          else if (step === 'menu') setStep(orderKind ? 'details' : 'intro');
          else if (step === 'details') setStep('intro');
        }}
      />

      <div className="mx-auto max-w-md px-4 pb-28 pt-4">
        {step === 'intro' && (
          <IntroStep
            restaurantName={restaurant.name}
            onPick={(kind) => {
              if (kind === 'MENU') {
                setOrderKind(null);
                setStep('menu');
              } else {
                setOrderKind(kind);
                setStep('details');
              }
            }}
          />
        )}

        {step === 'details' && orderKind && (
          <DetailsStep
            orderKind={orderKind}
            customerName={customerName}
            setCustomerName={setCustomerName}
            customerPhone={customerPhone}
            setCustomerPhone={setCustomerPhone}
            zones={zones}
            deliveryZoneId={deliveryZoneId}
            setDeliveryZoneId={setDeliveryZoneId}
            deliveryStreet={deliveryStreet}
            setDeliveryStreet={setDeliveryStreet}
            deliveryNumber={deliveryNumber}
            setDeliveryNumber={setDeliveryNumber}
            deliveryComplement={deliveryComplement}
            setDeliveryComplement={setDeliveryComplement}
            canContinue={!!canContinueDetails}
            onContinue={() => setStep('menu')}
          />
        )}

        {step === 'menu' && <OrderComposer draft={draft} setDraft={setDraft} basePath={`/public/${slug}/catalog`} />}

        {step === 'cart' && (
          <CartStep
            draft={draft}
            setDraft={setDraft}
            subtotal={subtotal}
            deliveryFee={deliveryFee}
            total={total}
            orderKind={orderKind}
          />
        )}
      </div>

      {step === 'menu' && itemCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 border-t border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
          <button className="btn-primary mx-auto flex w-full max-w-md items-center justify-between !py-3" onClick={() => setStep('cart')}>
            <span>{itemCount} {itemCount === 1 ? 'item' : 'itens'}</span>
            <span>Ver carrinho · {brl(subtotal)}</span>
          </button>
        </div>
      )}
    </div>
  );
}

function PublicHeader({
  restaurantName,
  step,
  onBack,
}: {
  restaurantName: string;
  step: Step;
  onBack: () => void;
}) {
  return (
    <div className="sticky top-0 z-10 border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="mx-auto flex max-w-md items-center gap-2 px-4 py-3">
        {step !== 'intro' && (
          <button onClick={onBack} className="text-gray-500 hover:text-gray-700" title="Voltar">
            <ChevronLeft size={22} />
          </button>
        )}
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-xs font-bold text-white">
          {restaurantName.slice(0, 2).toUpperCase()}
        </div>
        <span className="font-semibold">{restaurantName}</span>
      </div>
    </div>
  );
}

function IntroStep({
  restaurantName,
  onPick,
}: {
  restaurantName: string;
  onPick: (kind: OrderKind | 'MENU') => void;
}) {
  return (
    <div className="pt-6 text-center">
      <h1 className="text-2xl font-bold">{restaurantName}</h1>
      <p className="mt-1 text-sm text-gray-500">Como você quer pedir hoje?</p>

      <div className="mt-8 space-y-3">
        <button
          className="card flex w-full items-center gap-4 p-5 text-left transition hover:border-brand hover:shadow"
          onClick={() => onPick('DELIVERY')}
        >
          <Bike className="text-brand" size={28} />
          <div>
            <div className="font-semibold">Fazer Pedido Delivery</div>
            <div className="text-xs text-gray-500">Receba no seu endereço</div>
          </div>
        </button>
        <button
          className="card flex w-full items-center gap-4 p-5 text-left transition hover:border-brand hover:shadow"
          onClick={() => onPick('PICKUP')}
        >
          <ShoppingBag className="text-brand" size={28} />
          <div>
            <div className="font-semibold">Fazer Pedido para Retirada</div>
            <div className="text-xs text-gray-500">Retire no balcão</div>
          </div>
        </button>
        <button
          className="card flex w-full items-center gap-4 p-5 text-left transition hover:border-brand hover:shadow"
          onClick={() => onPick('MENU')}
        >
          <BookOpen className="text-brand" size={28} />
          <div>
            <div className="font-semibold">Ver Cardápio</div>
            <div className="text-xs text-gray-500">Sem compromisso</div>
          </div>
        </button>
      </div>
    </div>
  );
}

function DetailsStep({
  orderKind,
  customerName,
  setCustomerName,
  customerPhone,
  setCustomerPhone,
  zones,
  deliveryZoneId,
  setDeliveryZoneId,
  deliveryStreet,
  setDeliveryStreet,
  deliveryNumber,
  setDeliveryNumber,
  deliveryComplement,
  setDeliveryComplement,
  canContinue,
  onContinue,
}: {
  orderKind: OrderKind;
  customerName: string;
  setCustomerName: (v: string) => void;
  customerPhone: string;
  setCustomerPhone: (v: string) => void;
  zones: DeliveryZone[];
  deliveryZoneId: string;
  setDeliveryZoneId: (v: string) => void;
  deliveryStreet: string;
  setDeliveryStreet: (v: string) => void;
  deliveryNumber: string;
  setDeliveryNumber: (v: string) => void;
  deliveryComplement: string;
  setDeliveryComplement: (v: string) => void;
  canContinue: boolean;
  onContinue: () => void;
}) {
  const selectedFee = zones.find((z) => z.id === deliveryZoneId)?.fee;
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">
        {orderKind === 'DELIVERY' ? 'Seus dados para entrega' : 'Seus dados para retirada'}
      </h2>

      <div>
        <label className="label">Nome</label>
        <input className="input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Seu nome" />
      </div>
      <div>
        <label className="label">Telefone (WhatsApp)</label>
        <input
          className="input"
          value={customerPhone}
          onChange={(e) => setCustomerPhone(e.target.value)}
          placeholder="(00) 00000-0000"
          inputMode="tel"
        />
      </div>

      {orderKind === 'DELIVERY' && (
        <>
          <div>
            <label className="label">Bairro</label>
            <select className="input" value={deliveryZoneId} onChange={(e) => setDeliveryZoneId(e.target.value)}>
              <option value="">Selecione seu bairro</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>{z.name} — {brl(z.fee)}</option>
              ))}
            </select>
            {zones.length === 0 && (
              <p className="mt-1 text-xs text-amber-600">Nenhum bairro cadastrado ainda para entrega.</p>
            )}
            {selectedFee !== undefined && <p className="mt-1 text-xs text-gray-500">Taxa de entrega: {brl(selectedFee)}</p>}
          </div>
          <div>
            <label className="label">Endereço (rua, avenida...)</label>
            <input className="input" value={deliveryStreet} onChange={(e) => setDeliveryStreet(e.target.value)} placeholder="Rua das Flores" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Número</label>
              <input className="input" value={deliveryNumber} onChange={(e) => setDeliveryNumber(e.target.value)} />
            </div>
            <div>
              <label className="label">Complemento (opcional)</label>
              <input className="input" value={deliveryComplement} onChange={(e) => setDeliveryComplement(e.target.value)} placeholder="Apto, bloco..." />
            </div>
          </div>
        </>
      )}

      <button className="btn-primary w-full !py-3" disabled={!canContinue} onClick={onContinue}>
        Continuar para o cardápio
      </button>
    </div>
  );
}

function CartStep({
  draft,
  setDraft,
  subtotal,
  deliveryFee,
  total,
  orderKind,
}: {
  draft: DraftItem[];
  setDraft: (items: DraftItem[]) => void;
  subtotal: number;
  deliveryFee: number;
  total: number;
  orderKind: OrderKind | null;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Seu carrinho</h2>

      {draft.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">Seu carrinho está vazio.</p>
      ) : (
        <div className="space-y-2">
          {draft.map((item, i) => (
            <div key={i} className="card p-3">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{item.product.name}</div>
                  {item.additionalIds.length > 0 && (
                    <div className="text-xs text-gray-500">+ {item.additionalIds.length} adicional(is)</div>
                  )}
                  <div className="text-xs font-semibold text-brand">{brl(draftItemUnitPrice(item) * item.quantity)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button className="btn-secondary !px-2 !py-1" onClick={() => {
                    const next = [...draft];
                    if (next[i].quantity > 1) next[i] = { ...next[i], quantity: next[i].quantity - 1 };
                    else next.splice(i, 1);
                    setDraft(next);
                  }}>
                    <Minus size={14} />
                  </button>
                  <span className="w-6 text-center text-sm font-semibold">{item.quantity}</span>
                  <button className="btn-secondary !px-2 !py-1" onClick={() => {
                    const next = [...draft];
                    next[i] = { ...next[i], quantity: next[i].quantity + 1 };
                    setDraft(next);
                  }}>
                    <Plus size={14} />
                  </button>
                  <button className="text-red-500" onClick={() => setDraft(draft.filter((_, j) => j !== i))}>
                    <X size={16} />
                  </button>
                </div>
              </div>
              {item.notes && <div className="mt-1 text-xs italic text-gray-500">“{item.notes}”</div>}
            </div>
          ))}
        </div>
      )}

      <div className="card space-y-1 p-4 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">Subtotal</span>
          <span>{brl(subtotal)}</span>
        </div>
        {orderKind === 'DELIVERY' && (
          <div className="flex justify-between">
            <span className="text-gray-500">Taxa de entrega</span>
            <span>{brl(deliveryFee)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-gray-100 pt-2 text-base font-semibold dark:border-gray-800">
          <span>Total</span>
          <span className="text-brand">{brl(total)}</span>
        </div>
      </div>

      <button className="btn-primary w-full !py-3" disabled title="Disponível em breve">
        Finalizar Pedido (em breve)
      </button>
    </div>
  );
}
