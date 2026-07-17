import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Bike, ChevronLeft, ShoppingBag, BookOpen, Minus, Plus, X, Check, Banknote, CreditCard, QrCode } from 'lucide-react';
import api, { apiError } from '../lib/api';
import { brl } from '../lib/format';
import { Spinner } from '../components/ui';
import { OrderComposer, draftItemUnitPrice, type DraftItem } from '../components/OrderComposer';
import type { DeliveryZone, PaymentMethod } from '../types';

type Step = 'intro' | 'details' | 'menu' | 'cart' | 'payment' | 'review' | 'confirmation';
type OrderKind = 'DELIVERY' | 'PICKUP';
/** Subset of PaymentMethod the public site offers — sem vale-refeição (só faz sentido presencial). */
type PublicPaymentMethod = Extract<PaymentMethod, 'PIX' | 'CASH' | 'CREDIT' | 'DEBIT'>;

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
  const [paymentMethod, setPaymentMethod] = useState<PublicPaymentMethod | ''>('');
  const [changeFor, setChangeFor] = useState('');
  // Honeypot — nome propositalmente neutro pra não colidir com autofill do navegador
  // (campos chamados "website"/"empresa" são alvo comum de autofill, o que barraria
  // um cliente de verdade sem ele nunca ter digitado nada aqui).
  const [grHp, setGrHp] = useState('');
  const [confirmedOrderNumber, setConfirmedOrderNumber] = useState<number | null>(null);
  const [submitError, setSubmitError] = useState('');

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

  const submitOrder = useMutation({
    mutationFn: async () => {
      const payload = {
        orderType: orderKind,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        ...(orderKind === 'DELIVERY'
          ? {
              deliveryZoneId,
              deliveryStreet: deliveryStreet.trim(),
              deliveryNumber: deliveryNumber.trim(),
              deliveryComplement: deliveryComplement.trim() || undefined,
            }
          : {}),
        declaredPaymentMethod: paymentMethod,
        changeFor: paymentMethod === 'CASH' && changeFor ? Number(changeFor) : undefined,
        gr_hp: grHp || undefined,
        items: draft.map((d) => ({
          productId: d.product.id,
          quantity: d.quantity,
          notes: d.notes || undefined,
          additionalIds: d.additionalIds,
        })),
      };
      return (await api.post<{ number: number }>(`/public/${slug}/orders`, payload)).data;
    },
    onSuccess: (order) => {
      setSubmitError('');
      setConfirmedOrderNumber(order.number);
      setStep('confirmation');
    },
    onError: (e) => setSubmitError(apiError(e)),
  });

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
          if (step === 'review') setStep('payment');
          else if (step === 'payment') setStep('cart');
          else if (step === 'cart') setStep('menu');
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
            onContinue={() => setStep('payment')}
          />
        )}

        {step === 'payment' && (
          <PaymentStep
            paymentMethod={paymentMethod}
            setPaymentMethod={setPaymentMethod}
            changeFor={changeFor}
            setChangeFor={setChangeFor}
            total={total}
            onContinue={() => setStep('review')}
          />
        )}

        {step === 'review' && orderKind && (
          <ReviewStep
            orderKind={orderKind}
            customerName={customerName}
            customerPhone={customerPhone}
            deliveryZoneName={selectedZone?.name}
            deliveryStreet={deliveryStreet}
            deliveryNumber={deliveryNumber}
            deliveryComplement={deliveryComplement}
            draft={draft}
            subtotal={subtotal}
            deliveryFee={deliveryFee}
            total={total}
            paymentMethod={paymentMethod}
            changeFor={changeFor}
            grHp={grHp}
            setGrHp={setGrHp}
            submitting={submitOrder.isPending}
            error={submitError}
            onConfirm={() => submitOrder.mutate()}
          />
        )}

        {step === 'confirmation' && (
          <ConfirmationStep
            orderNumber={confirmedOrderNumber}
            orderKind={orderKind}
            onNewOrder={() => {
              setStep('intro');
              setOrderKind(null);
              setDraft([]);
              setCustomerName('');
              setCustomerPhone('');
              setDeliveryZoneId('');
              setDeliveryStreet('');
              setDeliveryNumber('');
              setDeliveryComplement('');
              setPaymentMethod('');
              setChangeFor('');
              setConfirmedOrderNumber(null);
            }}
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
        {step !== 'intro' && step !== 'confirmation' && (
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
  onContinue,
}: {
  draft: DraftItem[];
  setDraft: (items: DraftItem[]) => void;
  subtotal: number;
  deliveryFee: number;
  total: number;
  orderKind: OrderKind | null;
  onContinue: () => void;
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

      <button className="btn-primary w-full !py-3" disabled={draft.length === 0} onClick={onContinue}>
        Continuar para pagamento
      </button>
    </div>
  );
}

const PAYMENT_OPTIONS: { key: PublicPaymentMethod; label: string; icon: typeof QrCode }[] = [
  { key: 'PIX', label: 'PIX', icon: QrCode },
  { key: 'CREDIT', label: 'Cartão de Crédito', icon: CreditCard },
  { key: 'DEBIT', label: 'Cartão de Débito', icon: CreditCard },
  { key: 'CASH', label: 'Dinheiro', icon: Banknote },
];

function PaymentStep({
  paymentMethod,
  setPaymentMethod,
  changeFor,
  setChangeFor,
  total,
  onContinue,
}: {
  paymentMethod: PublicPaymentMethod | '';
  setPaymentMethod: (m: PublicPaymentMethod) => void;
  changeFor: string;
  setChangeFor: (v: string) => void;
  total: number;
  onContinue: () => void;
}) {
  const needsChange = paymentMethod === 'CASH';
  const canContinue = !!paymentMethod && (!needsChange || !changeFor || Number(changeFor) >= total);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Forma de pagamento</h2>
      <p className="text-sm text-gray-500">Pago na entrega/retirada — igual já é hoje.</p>

      <div className="grid grid-cols-2 gap-3">
        {PAYMENT_OPTIONS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            className={`card flex flex-col items-center gap-2 p-4 text-center transition ${
              paymentMethod === key ? 'border-brand ring-1 ring-brand' : 'hover:border-brand hover:shadow'
            }`}
            onClick={() => setPaymentMethod(key)}
          >
            <Icon className="text-brand" size={24} />
            <span className="text-sm font-medium">{label}</span>
          </button>
        ))}
      </div>

      {needsChange && (
        <div>
          <label className="label">Precisa de troco? Troco para quanto?</label>
          <input
            className="input"
            type="number"
            step="0.01"
            min={0}
            placeholder={`Deixe em branco se não precisar (total: ${brl(total)})`}
            value={changeFor}
            onChange={(e) => setChangeFor(e.target.value)}
          />
          {changeFor && Number(changeFor) < total && (
            <p className="mt-1 text-xs text-red-600">O valor precisa ser maior ou igual ao total ({brl(total)}).</p>
          )}
        </div>
      )}

      <button className="btn-primary w-full !py-3" disabled={!canContinue} onClick={onContinue}>
        Revisar Pedido
      </button>
    </div>
  );
}

function ReviewStep({
  orderKind,
  customerName,
  customerPhone,
  deliveryZoneName,
  deliveryStreet,
  deliveryNumber,
  deliveryComplement,
  draft,
  subtotal,
  deliveryFee,
  total,
  paymentMethod,
  changeFor,
  grHp,
  setGrHp,
  submitting,
  error,
  onConfirm,
}: {
  orderKind: OrderKind;
  customerName: string;
  customerPhone: string;
  deliveryZoneName?: string;
  deliveryStreet: string;
  deliveryNumber: string;
  deliveryComplement: string;
  draft: DraftItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  paymentMethod: PublicPaymentMethod | '';
  changeFor: string;
  grHp: string;
  setGrHp: (v: string) => void;
  submitting: boolean;
  error: string;
  onConfirm: () => void;
}) {
  const paymentLabel = PAYMENT_OPTIONS.find((p) => p.key === paymentMethod)?.label ?? '—';
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Revisão do pedido</h2>

      <div className="card space-y-2 p-4 text-sm">
        <div className="font-medium">{orderKind === 'DELIVERY' ? 'Entrega' : 'Retirada'}</div>
        <div className="text-gray-500">{customerName} · {customerPhone}</div>
        {orderKind === 'DELIVERY' && (
          <div className="text-gray-500">
            {deliveryStreet}, {deliveryNumber}{deliveryComplement ? ` — ${deliveryComplement}` : ''} · {deliveryZoneName}
          </div>
        )}
      </div>

      <div className="card space-y-2 p-4 text-sm">
        <div className="font-medium">Itens</div>
        {draft.map((item, i) => (
          <div key={i} className="flex justify-between">
            <span>{item.quantity}× {item.product.name}</span>
            <span>{brl(draftItemUnitPrice(item) * item.quantity)}</span>
          </div>
        ))}
      </div>

      <div className="card space-y-1 p-4 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">Forma de pagamento</span>
          <span>{paymentLabel}</span>
        </div>
        {paymentMethod === 'CASH' && changeFor && (
          <div className="flex justify-between">
            <span className="text-gray-500">Troco para</span>
            <span>{brl(Number(changeFor))}</span>
          </div>
        )}
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

      {/* Honeypot — invisível pra gente, um bot que preenche todo campo do form cai aqui.
          Nome neutro de propósito, pra não ser alvo de autofill do navegador. */}
      <input
        type="text"
        name="gr_hp"
        value={grHp}
        onChange={(e) => setGrHp(e.target.value)}
        className="absolute -left-[9999px] h-0 w-0 opacity-0"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button className="btn-primary w-full !py-3" disabled={submitting} onClick={onConfirm}>
        {submitting ? 'Enviando...' : 'Confirmar Pedido'}
      </button>
    </div>
  );
}

function ConfirmationStep({
  orderNumber,
  orderKind,
  onNewOrder,
}: {
  orderNumber: number | null;
  orderKind: OrderKind | null;
  onNewOrder: () => void;
}) {
  return (
    <div className="pt-10 text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
        <Check className="text-green-600 dark:text-green-400" size={32} />
      </div>
      <h1 className="text-xl font-bold">Pedido recebido!</h1>
      {orderNumber && <p className="mt-1 text-gray-500">Pedido #{orderNumber}</p>}
      <p className="mt-3 text-sm text-gray-500">
        {orderKind === 'DELIVERY'
          ? 'Assim que o restaurante aceitar, seu pedido entra em preparo.'
          : 'Assim que o restaurante aceitar, seu pedido entra em preparo. Vá até o balcão no horário combinado.'}
      </p>
      <button className="btn-secondary mt-6" onClick={onNewOrder}>Fazer novo pedido</button>
    </div>
  );
}
