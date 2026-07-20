import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Bike,
  ChevronLeft,
  ChevronRight,
  ShoppingBag,
  BookOpen,
  Minus,
  Plus,
  X,
  Check,
  Banknote,
  CreditCard,
  QrCode,
  Clock,
  Instagram,
  MessageCircle,
  MapPin,
} from 'lucide-react';
import api, { apiError } from '../lib/api';
import { brl } from '../lib/format';
import { Spinner } from '../components/ui';
import { OrderComposer, draftItemUnitPrice, type DraftItem } from '../components/OrderComposer';
import type { DeliveryZone, EtaEstimate, PaymentMethod } from '../types';

/** "19:45" a partir de um ISO — usado pra mostrar a previsão travada na confirmação. */
function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** Nota de previsão reaproveitada nas telas de Dados/Carrinho/Revisão — some se a estimativa ainda não carregou. */
function EtaNote({ eta }: { eta?: EtaEstimate }) {
  if (!eta) return null;
  return (
    <div className="flex items-center gap-2 rounded-lg bg-brand/10 px-3 py-2 text-xs text-brand">
      <Clock size={14} className="shrink-0" />
      <span>
        Previsão agora: até {eta.minutes} min
        {eta.activeOrders > 5 ? ' — cozinha com fluxo alto no momento' : ''}
      </span>
    </div>
  );
}

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
  const [confirmedEta, setConfirmedEta] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState('');

  // Recalcula enquanto o cliente ainda está decidindo (Dados/Cardápio/Carrinho/Pagamento/
  // Revisão); trava um valor só no momento da confirmação (openPublic() no backend).
  const { data: eta } = useQuery({
    queryKey: ['public-eta', slug, orderKind],
    queryFn: async () => (await api.get<EtaEstimate>(`/public/${slug}/eta`, { params: { orderType: orderKind } })).data,
    enabled: !!slug && !!orderKind && step !== 'intro' && step !== 'confirmation',
    refetchInterval: 20_000,
  });

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
      return (await api.post<{ number: number; estimatedReadyAt: string | null }>(`/public/${slug}/orders`, payload)).data;
    },
    onSuccess: (order) => {
      setSubmitError('');
      setConfirmedOrderNumber(order.number);
      setConfirmedEta(order.estimatedReadyAt);
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

  const introOrConfirmation = step === 'intro' || step === 'confirmation';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {!introOrConfirmation && (
        <PublicHeader
          restaurantName={restaurant.name}
          onBack={() => {
            if (step === 'review') setStep('payment');
            else if (step === 'payment') setStep('cart');
            else if (step === 'cart') setStep('menu');
            else if (step === 'menu') setStep(orderKind ? 'details' : 'intro');
            else if (step === 'details') setStep('intro');
          }}
        />
      )}

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

      {step !== 'intro' && (
      <div className="mx-auto max-w-md px-4 pb-28 pt-4">
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
            eta={eta}
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
            eta={eta}
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
            eta={eta}
          />
        )}

        {step === 'confirmation' && (
          <ConfirmationStep
            orderNumber={confirmedOrderNumber}
            orderKind={orderKind}
            estimatedReadyAt={confirmedEta}
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
              setConfirmedEta(null);
            }}
          />
        )}
      </div>
      )}

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
  onBack,
}: {
  restaurantName: string;
  onBack: () => void;
}) {
  return (
    <div className="sticky top-0 z-10 bg-gradient-to-br from-[#6D2E9E] to-[#4A1D72]">
      <div className="mx-auto flex max-w-md items-center gap-2 px-4 py-3">
        <button onClick={onBack} className="flex text-white/85 hover:text-white" title="Voltar">
          <ChevronLeft size={22} />
        </button>
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-xs font-bold text-[#6D2E9E]">
          {restaurantName.slice(0, 2).toUpperCase()}
        </div>
        <span className="font-semibold text-white">{restaurantName}</span>
      </div>
    </div>
  );
}

/**
 * Identidade visual e dados de contato específicos de "O Rei do Suco" — hoje o único
 * tenant que usa o pedido online. Se um segundo restaurante passar a usar essa mesma
 * tela, isso precisa virar configurável por tenant (cor, selo, redes sociais) em vez de
 * fixo aqui.
 */
function IntroStep({
  restaurantName,
  onPick,
}: {
  restaurantName: string;
  onPick: (kind: OrderKind | 'MENU') => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center bg-[#FBF7FC] px-7 pt-12 dark:bg-[#FBF7FC]">
      <svg width="122" height="122" viewBox="0 0 120 120" role="img" aria-label={restaurantName}>
        <defs>
          <radialGradient id="poBadgeFill" cx="50%" cy="38%" r="70%">
            <stop offset="0%" stopColor="#7A369E" />
            <stop offset="100%" stopColor="#4A1D72" />
          </radialGradient>
        </defs>
        <circle cx="60" cy="60" r="58" fill="none" stroke="#D9A544" strokeWidth="2" />
        <circle cx="60" cy="60" r="53" fill="url(#poBadgeFill)" />
        <g fill="#D9A544" opacity="0.45">
          <circle cx="27" cy="34" r="1.5" /><circle cx="95" cy="30" r="1.3" /><circle cx="100" cy="62" r="1.4" />
          <circle cx="92" cy="92" r="1.3" /><circle cx="24" cy="88" r="1.3" /><circle cx="18" cy="58" r="1.5" />
        </g>
        <path
          d="M60 18 C 57 22 57 27 60 30 C 63 27 63 22 60 18 Z M60 30 C 54 28 49 30 47 34 C 52 37 58 36 60 30 Z M60 30 C 66 28 71 30 73 34 C 68 37 62 36 60 30 Z"
          fill="#8BC53F"
        />
        <text x="60" y="60" textAnchor="middle" fontFamily="Georgia,'Times New Roman',serif" fontStyle="italic" fontSize="24" fill="#FBF7FC">
          o Rei
        </text>
        <text x="60" y="82" textAnchor="middle" fontFamily="-apple-system,'Segoe UI',Arial,sans-serif" fontWeight="800" fontSize="17" letterSpacing="0.5" fill="#FBF7FC">
          do Suco
        </text>
      </svg>

      <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-gray-500">
        <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-[#8BC53F] shadow-[0_0_0_3px_rgba(139,197,63,0.22)]" />
        Aberto agora · delivery até 22:30
      </div>

      <div className="mt-16 flex w-full flex-col gap-3">
        <button
          className="flex w-full items-center gap-3.5 rounded-2xl bg-gradient-to-br from-[#6D2E9E] to-[#4A1D72] px-4 py-4 text-left shadow-[0_12px_24px_-10px_rgba(74,29,114,0.55)] transition active:scale-[0.98]"
          onClick={() => onPick('DELIVERY')}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20 text-white">
            <Bike size={21} />
          </span>
          <span className="flex-1">
            <span className="block text-[15px] font-extrabold text-white">Delivery</span>
            <span className="block text-xs font-medium text-white/80">Entrega no seu endereço</span>
          </span>
          <ChevronRight size={17} className="shrink-0 text-white/70" />
        </button>

        <button
          className="flex w-full items-center gap-3.5 rounded-2xl bg-[#351C4D] px-4 py-4 text-left shadow-[0_12px_24px_-10px_rgba(36,16,48,0.5)] transition active:scale-[0.98]"
          onClick={() => onPick('PICKUP')}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white">
            <ShoppingBag size={21} />
          </span>
          <span className="flex-1">
            <span className="block text-[15px] font-extrabold text-white">Retirada</span>
            <span className="block text-xs font-medium text-white/75">Sem taxa de entrega</span>
          </span>
          <ChevronRight size={17} className="shrink-0 text-white/70" />
        </button>

        <button
          className="flex w-full items-center gap-3.5 rounded-2xl border-[1.5px] border-[#351C4D]/15 bg-white px-4 py-4 text-left transition active:scale-[0.98]"
          onClick={() => onPick('MENU')}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F3E8FB] text-[#6D2E9E]">
            <BookOpen size={21} />
          </span>
          <span className="flex-1 text-[15px] font-extrabold text-[#351C4D]">Cardápio</span>
          <ChevronRight size={17} className="shrink-0 text-[#351C4D]" />
        </button>
      </div>

      <div className="mt-auto flex flex-col items-center gap-2.5 pb-6 pt-10">
        <span className="text-[11px] font-semibold text-gray-500">Pastelaria e Sucaria desde 1996</span>
        <div className="flex items-center gap-2.5">
          <a
            href="https://www.instagram.com/oreidosucoamericana"
            target="_blank"
            rel="noreferrer"
            title="Instagram"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[#351C4D]/15 bg-white text-[#351C4D]"
          >
            <Instagram size={15} />
          </a>
          <a
            href="https://wa.me/551934054361"
            target="_blank"
            rel="noreferrer"
            title="WhatsApp"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[#351C4D]/15 bg-white text-[#351C4D]"
          >
            <MessageCircle size={15} />
          </a>
          <a
            href="https://www.google.com/maps/place/Rei+do+Suco/@-22.7481879,-47.3612074,17z/data=!3m1!4b1!4m6!3m5!1s0x94c89bef9f7cfaf7:0x607ad2fefac4fcd5!8m2!3d-22.7481879!4d-47.3586271!16s%2Fg%2F11b779z2w4"
            target="_blank"
            rel="noreferrer"
            title="Localização"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[#351C4D]/15 bg-white text-[#351C4D]"
          >
            <MapPin size={15} />
          </a>
        </div>
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
  eta,
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
  eta?: EtaEstimate;
}) {
  const selectedFee = zones.find((z) => z.id === deliveryZoneId)?.fee;
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">
        {orderKind === 'DELIVERY' ? 'Seus dados para entrega' : 'Seus dados para retirada'}
      </h2>
      <EtaNote eta={eta} />

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
  eta,
}: {
  draft: DraftItem[];
  setDraft: (items: DraftItem[]) => void;
  subtotal: number;
  deliveryFee: number;
  total: number;
  orderKind: OrderKind | null;
  onContinue: () => void;
  eta?: EtaEstimate;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Seu carrinho</h2>
      <EtaNote eta={eta} />

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
  eta,
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
  eta?: EtaEstimate;
}) {
  const paymentLabel = PAYMENT_OPTIONS.find((p) => p.key === paymentMethod)?.label ?? '—';
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Revisão do pedido</h2>
      <EtaNote eta={eta} />

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
  estimatedReadyAt,
  onNewOrder,
}: {
  orderNumber: number | null;
  orderKind: OrderKind | null;
  estimatedReadyAt: string | null;
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
      {estimatedReadyAt && (
        <div className="mx-auto mt-4 inline-flex items-center gap-2 rounded-lg bg-brand/10 px-4 py-2 text-sm font-medium text-brand">
          <Clock size={16} />
          {orderKind === 'DELIVERY' ? `Previsão de chegada: até ${formatClock(estimatedReadyAt)}` : `Previsão pra retirar: até ${formatClock(estimatedReadyAt)}`}
        </div>
      )}
      <button className="btn-secondary mt-6" onClick={onNewOrder}>Fazer novo pedido</button>
    </div>
  );
}
