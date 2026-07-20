import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { publicBrandVars } from '../lib/publicBrand';
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
  Loader2,
} from 'lucide-react';
import api, { apiError } from '../lib/api';
import { brl } from '../lib/format';
import { Spinner } from '../components/ui';
import { OrderComposer, draftItemUnitPrice, type DraftItem } from '../components/OrderComposer';
import AddressAutocomplete from '../components/AddressAutocomplete';
import type { DeliveryZone, EtaEstimate, PaymentMethod, PlaceDetails } from '../types';

/** "19:45" a partir de um ISO — usado pra mostrar a previsão travada na confirmação. */
function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** Nota de previsão reaproveitada nas telas de Dados/Carrinho/Revisão — some se a estimativa ainda não carregou. */
function EtaNote({ eta }: { eta?: EtaEstimate }) {
  if (!eta) return null;
  return (
    <div className="flex items-center gap-2 rounded-[11px] bg-[#F3E8FB] px-3 py-2 text-xs font-medium text-[#6D2E9E]">
      <Clock size={14} className="shrink-0" />
      <span>
        Previsão agora: até {eta.minutes} min
        {eta.activeOrders > 5 ? ' — cozinha com fluxo alto no momento' : ''}
      </span>
    </div>
  );
}

// ─── Tokens visuais do site público — espelham 1:1 as classes do preview
// (.field/.primary-cta/.step-title/.card/.seg/.cart-bar etc.) ───────────────
const FIELD_LABEL = 'mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[#7c7086]';
const FIELD_INPUT =
  'w-full rounded-[11px] border border-[#351C4D]/[0.15] bg-white px-3.5 py-2.5 text-[13.5px] text-[#351C4D] outline-none transition focus:border-[#6D2E9E] focus:ring-2 focus:ring-[#6D2E9E]/20';
const PRIMARY_CTA =
  'block w-full rounded-[14px] bg-gradient-to-br from-[#6D2E9E] to-[#4A1D72] px-4 py-3.5 text-center text-[13.5px] font-extrabold text-white shadow-[0_10px_20px_-8px_rgba(74,29,114,0.5)] transition disabled:cursor-not-allowed disabled:opacity-50';
const STEP_TITLE = 'mb-[18px] text-[18px] font-extrabold tracking-tight text-[#351C4D]';
const CARD = 'rounded-[14px] border border-[#351C4D]/[0.08] bg-white';

/** Barra fixa no rodapé (Cardápio/Carrinho/Revisão) — igual ao .cart-bar do preview. */
function CartBar({
  left,
  right,
  onClick,
  disabled,
}: {
  left: string;
  right: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="fixed bottom-0 left-0 right-0 border-t border-[#351C4D]/10 bg-[#FBF7FC] p-3 pb-3.5">
      <button
        className="mx-auto flex w-full max-w-3xl items-center justify-between rounded-[14px] bg-gradient-to-br from-[#6D2E9E] to-[#4A1D72] px-[18px] py-[13px] text-[13.5px] font-bold text-white shadow-[0_10px_20px_-8px_rgba(74,29,114,0.5)] disabled:cursor-not-allowed disabled:opacity-60"
        onClick={onClick}
        disabled={disabled}
      >
        <span>{left}</span>
        <span>{right}</span>
      </button>
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
  deliveryPricingMode: 'ZONE' | 'DISTANCE_BANDS';
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
  const [deliveryLat, setDeliveryLat] = useState<number | null>(null);
  const [deliveryLng, setDeliveryLng] = useState<number | null>(null);
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
  const [confirmedOrderId, setConfirmedOrderId] = useState<string | null>(null);
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

  const distanceMode = restaurant?.deliveryPricingMode === 'DISTANCE_BANDS';

  const { data: zones = [] } = useQuery({
    queryKey: ['public-delivery-zones', slug],
    queryFn: async () => (await api.get<DeliveryZone[]>(`/public/${slug}/delivery-zones`)).data,
    enabled: !!slug && orderKind === 'DELIVERY' && !distanceMode,
  });

  // Cotação do frete por distância — dispara quando o cliente escolhe um endereço no
  // autocomplete (não a cada tecla). Reconferida de novo pelo back no momento de confirmar
  // o pedido, então esse valor aqui é só pra mostrar antes de continuar.
  const {
    data: deliveryQuote,
    isFetching: quotingDelivery,
    isError: quoteOutOfRange,
  } = useQuery({
    queryKey: ['public-delivery-quote', slug, deliveryLat, deliveryLng],
    queryFn: async () =>
      (await api.get<{ fee: number; distanceKm: number }>(`/public/${slug}/delivery-quote`, { params: { lat: deliveryLat, lng: deliveryLng } })).data,
    enabled: !!slug && orderKind === 'DELIVERY' && distanceMode && deliveryLat !== null && deliveryLng !== null,
    retry: false,
  });

  const selectedZone = zones.find((z) => z.id === deliveryZoneId) ?? null;
  const deliveryFee = orderKind === 'DELIVERY' ? (distanceMode ? deliveryQuote?.fee ?? 0 : selectedZone?.fee ?? 0) : 0;
  // Rótulo mostrado ao lado da "Taxa de entrega" no Carrinho/Revisão — bairro escolhido no
  // modo por bairro, distância calculada no modo por Google Maps.
  const deliveryFeeLabel = distanceMode ? (deliveryQuote ? `${deliveryQuote.distanceKm.toFixed(1)} km` : undefined) : selectedZone?.name;

  const itemCount = draft.reduce((a, d) => a + d.quantity, 0);
  const subtotal = draft.reduce((a, d) => a + draftItemUnitPrice(d) * d.quantity, 0);
  const total = subtotal + deliveryFee;

  const canContinueDetails =
    customerName.trim().length >= 2 &&
    customerPhone.trim().length >= 8 &&
    (orderKind === 'PICKUP' ||
      (distanceMode
        ? deliveryLat !== null && deliveryLng !== null && !!deliveryQuote && !quoteOutOfRange && deliveryNumber.trim()
        : deliveryZoneId && deliveryStreet.trim() && deliveryNumber.trim()));

  const submitOrder = useMutation({
    mutationFn: async () => {
      const payload = {
        orderType: orderKind,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        ...(orderKind === 'DELIVERY'
          ? {
              ...(distanceMode
                ? { deliveryLat: deliveryLat ?? undefined, deliveryLng: deliveryLng ?? undefined }
                : { deliveryZoneId }),
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
      return (await api.post<{ id: string; number: number; estimatedReadyAt: string | null }>(`/public/${slug}/orders`, payload)).data;
    },
    onSuccess: (order) => {
      setSubmitError('');
      setConfirmedOrderNumber(order.number);
      setConfirmedOrderId(order.id);
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
  const headerTitle: Record<Exclude<Step, 'intro' | 'confirmation'>, string> = {
    details: 'Seus dados',
    menu: 'Cardápio',
    cart: 'Seu carrinho',
    payment: 'Pagamento',
    review: 'Revisar pedido',
  };

  return (
    <div className="min-h-screen bg-[#FBF7FC]" style={publicBrandVars}>
      {!introOrConfirmation && (
        <PublicHeader
          restaurantName={restaurant.name}
          title={headerTitle[step as Exclude<Step, 'intro' | 'confirmation'>]}
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
      <div className={`mx-auto px-4 pb-28 pt-4 ${step === 'menu' ? 'max-w-3xl' : 'max-w-md'}`}>
        {step === 'details' && orderKind && (
          <DetailsStep
            slug={slug}
            orderKind={orderKind}
            onChangeKind={setOrderKind}
            customerName={customerName}
            setCustomerName={setCustomerName}
            customerPhone={customerPhone}
            setCustomerPhone={setCustomerPhone}
            distanceMode={distanceMode}
            zones={zones}
            deliveryZoneId={deliveryZoneId}
            setDeliveryZoneId={setDeliveryZoneId}
            deliveryLat={deliveryLat}
            onPickAddress={(place) => {
              setDeliveryLat(place.lat);
              setDeliveryLng(place.lng);
              setDeliveryStreet(place.formattedAddress);
            }}
            deliveryQuote={deliveryQuote}
            quotingDelivery={quotingDelivery}
            quoteOutOfRange={quoteOutOfRange}
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
            deliveryZoneName={deliveryFeeLabel}
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
            deliveryZoneName={deliveryFeeLabel}
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
            error={submitError}
            eta={eta}
          />
        )}

        {step === 'confirmation' && (
          <ConfirmationStep
            slug={slug}
            orderNumber={confirmedOrderNumber}
            orderId={confirmedOrderId}
            orderKind={orderKind}
            estimatedReadyAt={confirmedEta}
            onNewOrder={() => {
              setStep('intro');
              setOrderKind(null);
              setDraft([]);
              setCustomerName('');
              setCustomerPhone('');
              setDeliveryZoneId('');
              setDeliveryLat(null);
              setDeliveryLng(null);
              setDeliveryStreet('');
              setDeliveryNumber('');
              setDeliveryComplement('');
              setPaymentMethod('');
              setChangeFor('');
              setConfirmedOrderNumber(null);
              setConfirmedOrderId(null);
              setConfirmedEta(null);
            }}
          />
        )}
      </div>
      )}

      {step === 'menu' && itemCount > 0 && (
        <CartBar
          left={`${itemCount} ${itemCount === 1 ? 'item' : 'itens'}`}
          right={`Ver carrinho · ${brl(subtotal)}`}
          onClick={() => setStep('cart')}
        />
      )}

      {step === 'cart' && (
        <CartBar
          left={`${itemCount} ${itemCount === 1 ? 'item' : 'itens'}`}
          right={`Continuar · ${brl(total)}`}
          disabled={draft.length === 0}
          onClick={() => setStep('payment')}
        />
      )}

      {step === 'review' && (
        <CartBar
          left={submitOrder.isPending ? 'Enviando...' : 'Confirmar'}
          right={`Fazer Pedido · ${brl(total)}`}
          disabled={submitOrder.isPending}
          onClick={() => submitOrder.mutate()}
        />
      )}
    </div>
  );
}

function PublicHeader({
  restaurantName,
  title,
  onBack,
}: {
  restaurantName: string;
  title: string;
  onBack: () => void;
}) {
  return (
    <div className="sticky top-0 z-10 bg-gradient-to-br from-[#6D2E9E] to-[#4A1D72]">
      <div className={`mx-auto flex items-center gap-2.5 px-4 py-3 ${title === 'Cardápio' ? 'max-w-3xl' : 'max-w-md'}`}>
        <button onClick={onBack} className="flex text-white/85 hover:text-white" title="Voltar">
          <ChevronLeft size={20} strokeWidth={2.3} />
        </button>
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-white text-[10.5px] font-extrabold text-[#6D2E9E]">
          {restaurantName.slice(0, 2).toUpperCase()}
        </div>
        <span className="text-sm font-extrabold text-white">{title}</span>
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

      <div className="mx-auto mt-16 flex w-full max-w-md flex-col gap-3">
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

      <div className="mx-auto mt-auto flex w-full max-w-md flex-col items-center gap-2.5 pb-6 pt-10">
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
  slug,
  orderKind,
  onChangeKind,
  customerName,
  setCustomerName,
  customerPhone,
  setCustomerPhone,
  distanceMode,
  zones,
  deliveryZoneId,
  setDeliveryZoneId,
  deliveryLat,
  onPickAddress,
  deliveryQuote,
  quotingDelivery,
  quoteOutOfRange,
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
  slug: string;
  orderKind: OrderKind;
  onChangeKind: (kind: OrderKind) => void;
  customerName: string;
  setCustomerName: (v: string) => void;
  customerPhone: string;
  setCustomerPhone: (v: string) => void;
  distanceMode: boolean;
  zones: DeliveryZone[];
  deliveryZoneId: string;
  setDeliveryZoneId: (v: string) => void;
  deliveryLat: number | null;
  onPickAddress: (place: PlaceDetails) => void;
  deliveryQuote?: { fee: number; distanceKm: number };
  quotingDelivery: boolean;
  quoteOutOfRange: boolean;
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
      <h2 className={STEP_TITLE}>Pra onde vai o pedido?</h2>

      <div className="mb-[18px] flex gap-1 rounded-[14px] border border-[#351C4D]/10 bg-white p-1">
        <button
          className={`flex-1 rounded-[10px] py-2 text-[12.5px] font-bold transition ${
            orderKind === 'DELIVERY' ? 'bg-[#6D2E9E] text-white' : 'text-[#7c7086]'
          }`}
          onClick={() => onChangeKind('DELIVERY')}
        >
          Entrega
        </button>
        <button
          className={`flex-1 rounded-[10px] py-2 text-[12.5px] font-bold transition ${
            orderKind === 'PICKUP' ? 'bg-[#6D2E9E] text-white' : 'text-[#7c7086]'
          }`}
          onClick={() => onChangeKind('PICKUP')}
        >
          Retirada
        </button>
      </div>

      <EtaNote eta={eta} />

      <div>
        <label className={FIELD_LABEL}>Nome</label>
        <input className={FIELD_INPUT} value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Seu nome" />
      </div>
      <div>
        <label className={FIELD_LABEL}>Telefone / WhatsApp</label>
        <input
          className={FIELD_INPUT}
          value={customerPhone}
          onChange={(e) => setCustomerPhone(e.target.value)}
          placeholder="(21) 9 9999-9999"
          inputMode="tel"
        />
      </div>

      {orderKind === 'DELIVERY' && distanceMode && (
        <>
          <div>
            <label className={FIELD_LABEL}>Endereço</label>
            <AddressAutocomplete slug={slug} inputClassName={FIELD_INPUT} placeholder="Digite seu endereço" onSelect={onPickAddress} />
            {deliveryLat !== null && quotingDelivery && (
              <p className="mt-1 flex items-center gap-1.5 text-[11px] text-[#7c7086]">
                <Loader2 size={11} className="animate-spin" /> Calculando frete...
              </p>
            )}
            {deliveryLat !== null && !quotingDelivery && quoteOutOfRange && (
              <p className="mt-1 text-[11px] text-red-600">Esse endereço está fora da nossa área de entrega.</p>
            )}
            {deliveryQuote && !quotingDelivery && (
              <p className="mt-1 text-[11px] text-[#7c7086]">
                Taxa de entrega: {brl(deliveryQuote.fee)} ({deliveryQuote.distanceKm.toFixed(1)} km)
              </p>
            )}
          </div>
          <div>
            <label className={FIELD_LABEL}>Número</label>
            <input className={FIELD_INPUT} value={deliveryNumber} onChange={(e) => setDeliveryNumber(e.target.value)} placeholder="123" />
          </div>
          <div>
            <label className={FIELD_LABEL}>Complemento (opcional)</label>
            <input
              className={FIELD_INPUT}
              value={deliveryComplement}
              onChange={(e) => setDeliveryComplement(e.target.value)}
              placeholder="Apto, bloco, ponto de referência"
            />
          </div>
        </>
      )}

      {orderKind === 'DELIVERY' && !distanceMode && (
        <>
          <div>
            <label className={FIELD_LABEL}>Bairro</label>
            <select className={FIELD_INPUT} value={deliveryZoneId} onChange={(e) => setDeliveryZoneId(e.target.value)}>
              <option value="">Selecione seu bairro</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>{z.name} — taxa {brl(z.fee)}</option>
              ))}
            </select>
            {zones.length === 0 && (
              <p className="mt-1 text-[11px] text-amber-600">Nenhum bairro cadastrado ainda para entrega.</p>
            )}
            {selectedFee !== undefined && <p className="mt-1 text-[11px] text-[#7c7086]">Taxa de entrega: {brl(selectedFee)}</p>}
          </div>
          <div className="grid grid-cols-[1.4fr_1fr] gap-2.5">
            <div>
              <label className={FIELD_LABEL}>Rua</label>
              <input className={FIELD_INPUT} value={deliveryStreet} onChange={(e) => setDeliveryStreet(e.target.value)} placeholder="Rua das Laranjeiras" />
            </div>
            <div>
              <label className={FIELD_LABEL}>Número</label>
              <input className={FIELD_INPUT} value={deliveryNumber} onChange={(e) => setDeliveryNumber(e.target.value)} placeholder="123" />
            </div>
          </div>
          <div>
            <label className={FIELD_LABEL}>Complemento (opcional)</label>
            <input
              className={FIELD_INPUT}
              value={deliveryComplement}
              onChange={(e) => setDeliveryComplement(e.target.value)}
              placeholder="Apto, bloco, ponto de referência"
            />
          </div>
        </>
      )}

      <button className={PRIMARY_CTA} disabled={!canContinue} onClick={onContinue}>
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
  deliveryZoneName,
  eta,
}: {
  draft: DraftItem[];
  setDraft: (items: DraftItem[]) => void;
  subtotal: number;
  deliveryFee: number;
  total: number;
  orderKind: OrderKind | null;
  deliveryZoneName?: string;
  eta?: EtaEstimate;
}) {
  return (
    <div className="space-y-4">
      <EtaNote eta={eta} />

      {draft.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">Seu carrinho está vazio.</p>
      ) : (
        <div>
          {draft.map((item, i) => (
            <div key={i} className="flex items-start justify-between gap-2.5 border-b border-[#351C4D]/[0.08] py-3 last:border-b-0">
              <span className="w-6 shrink-0 text-[12.5px] font-extrabold text-[#6D2E9E]">{item.quantity}×</span>
              <div className="flex-1">
                <div className="text-[13px] font-bold text-[#351C4D]">{item.product.name}</div>
                {item.notes && <div className="mt-0.5 text-[10.5px] text-[#7c7086]">{item.notes}</div>}
                {item.additionalIds.length > 0 && (
                  <div className="mt-0.5 text-[10.5px] text-[#7c7086]">+ {item.additionalIds.length} adicional(is)</div>
                )}
                <div className="mt-1.5 flex items-center gap-2">
                  <button
                    className="flex h-6 w-6 items-center justify-center rounded-full border border-[#351C4D]/15 text-[#351C4D]"
                    onClick={() => {
                      const next = [...draft];
                      if (next[i].quantity > 1) next[i] = { ...next[i], quantity: next[i].quantity - 1 };
                      else next.splice(i, 1);
                      setDraft(next);
                    }}
                  >
                    <Minus size={12} />
                  </button>
                  <button
                    className="flex h-6 w-6 items-center justify-center rounded-full border border-[#351C4D]/15 text-[#351C4D]"
                    onClick={() => {
                      const next = [...draft];
                      next[i] = { ...next[i], quantity: next[i].quantity + 1 };
                      setDraft(next);
                    }}
                  >
                    <Plus size={12} />
                  </button>
                  <button className="text-red-500" onClick={() => setDraft(draft.filter((_, j) => j !== i))}>
                    <X size={14} />
                  </button>
                </div>
              </div>
              <span className="shrink-0 text-[12.5px] font-bold tabular-nums text-[#351C4D]">
                {brl(draftItemUnitPrice(item) * item.quantity)}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-2 border-t border-dashed border-[#351C4D]/[0.18] pt-3.5">
        <div className="flex justify-between py-1 text-[12.5px] text-[#5B4A66]">
          <span>Subtotal</span>
          <span>{brl(subtotal)}</span>
        </div>
        {orderKind === 'DELIVERY' && (
          <div className="flex justify-between py-1 text-[12.5px] text-[#5B4A66]">
            <span>Taxa de entrega{deliveryZoneName ? ` · ${deliveryZoneName}` : ''}</span>
            <span>{brl(deliveryFee)}</span>
          </div>
        )}
        <div className="flex justify-between pt-2 text-[15.5px] font-extrabold text-[#351C4D]">
          <span>Total</span>
          <span>{brl(total)}</span>
        </div>
      </div>
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
      <h2 className={STEP_TITLE}>Como você vai pagar?</h2>

      <div className="grid grid-cols-2 gap-2.5">
        {PAYMENT_OPTIONS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            className={`flex flex-col items-center gap-2 rounded-[14px] border-2 p-4 text-center transition ${
              paymentMethod === key ? 'border-[#6D2E9E] bg-[#F3E8FB]' : 'border-[#351C4D]/10 bg-white'
            }`}
            onClick={() => setPaymentMethod(key)}
          >
            <Icon className="text-[#6D2E9E]" size={21} />
            <span className="text-xs font-bold text-[#351C4D]">{label}</span>
          </button>
        ))}
      </div>

      {needsChange && (
        <div className="mt-4">
          <label className={FIELD_LABEL}>Troco pra quanto?</label>
          <input
            className={FIELD_INPUT}
            type="number"
            step="0.01"
            min={0}
            placeholder="Deixe em branco se não precisar"
            value={changeFor}
            onChange={(e) => setChangeFor(e.target.value)}
          />
          <div className="mt-[5px] text-[11px] text-[#7c7086]">Total do pedido: {brl(total)}</div>
          {changeFor && Number(changeFor) < total && (
            <p className="mt-1 text-[11px] text-red-600">O valor precisa ser maior ou igual ao total ({brl(total)}).</p>
          )}
        </div>
      )}

      <button className={`${PRIMARY_CTA} mt-5`} disabled={!canContinue} onClick={onContinue}>
        Continuar
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
  error,
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
  error: string;
  eta?: EtaEstimate;
}) {
  const paymentLabel = PAYMENT_OPTIONS.find((p) => p.key === paymentMethod)?.label ?? '—';
  return (
    <div className="space-y-2.5">
      <EtaNote eta={eta} />

      <div className={`${CARD} p-3.5`}>
        <h3 className="mb-2 text-[10.5px] font-extrabold uppercase tracking-wide text-[#9B4FC7]">
          {orderKind === 'DELIVERY' ? 'Entrega' : 'Retirada'}
        </h3>
        <div className="text-[12.5px] leading-[1.55] text-[#351C4D]">{customerName} · {customerPhone}</div>
        {orderKind === 'DELIVERY' && (
          <>
            <div className="text-[12.5px] leading-[1.55] text-[#351C4D]">
              {deliveryStreet}, {deliveryNumber}{deliveryComplement ? ` — ${deliveryComplement}` : ''}
            </div>
            {deliveryZoneName && <div className="text-[11.5px] text-[#7c7086]">{deliveryZoneName}</div>}
          </>
        )}
      </div>

      <div className={`${CARD} p-3.5`}>
        <h3 className="mb-2 text-[10.5px] font-extrabold uppercase tracking-wide text-[#9B4FC7]">Itens</h3>
        {draft.map((item, i) => (
          <div key={i} className="text-[12.5px] leading-[1.55] text-[#351C4D]">
            {item.quantity}× {item.product.name} — {brl(draftItemUnitPrice(item) * item.quantity)}
          </div>
        ))}
      </div>

      <div className={`${CARD} p-3.5`}>
        <h3 className="mb-2 text-[10.5px] font-extrabold uppercase tracking-wide text-[#9B4FC7]">Pagamento</h3>
        <div className="text-[12.5px] leading-[1.55] text-[#351C4D]">
          {paymentLabel}
          {paymentMethod === 'CASH' && changeFor ? ` · troco pra ${brl(Number(changeFor))}` : ''}
        </div>
      </div>

      <div className="border-t border-dashed border-[#351C4D]/[0.18] pt-3.5">
        <div className="flex justify-between py-1 text-[12.5px] text-[#5B4A66]">
          <span>Subtotal</span>
          <span>{brl(subtotal)}</span>
        </div>
        {orderKind === 'DELIVERY' && (
          <div className="flex justify-between py-1 text-[12.5px] text-[#5B4A66]">
            <span>Taxa de entrega</span>
            <span>{brl(deliveryFee)}</span>
          </div>
        )}
        <div className="flex justify-between pt-2 text-[15.5px] font-extrabold text-[#351C4D]">
          <span>Total</span>
          <span>{brl(total)}</span>
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

      {error && <p className="text-[12.5px] text-red-600">{error}</p>}
    </div>
  );
}

function ConfirmationStep({
  slug,
  orderNumber,
  orderId,
  orderKind,
  estimatedReadyAt,
  onNewOrder,
}: {
  slug: string;
  orderNumber: number | null;
  orderId: string | null;
  orderKind: OrderKind | null;
  estimatedReadyAt: string | null;
  onNewOrder: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 pt-[54px] text-center">
      <div className="flex h-[66px] w-[66px] items-center justify-center rounded-full bg-[#F3E8FB] text-[#6D2E9E]">
        <Check size={30} strokeWidth={2.4} />
      </div>
      <h1 className="mt-1 text-[18px] font-extrabold text-[#351C4D]">Pedido recebido!</h1>
      {orderNumber && (
        <div className="text-[12.5px] text-[#7c7086]">
          Número do pedido <b className="text-[14.5px] text-[#351C4D]">#{orderNumber}</b>
        </div>
      )}
      <p className="max-w-[26ch] text-[12.5px] leading-[1.5] text-[#5B4A66]">
        {orderKind === 'DELIVERY'
          ? 'O restaurante já foi avisado. Assim que aceitar, seu pedido entra em preparo.'
          : 'O restaurante já foi avisado. Assim que aceitar, seu pedido entra em preparo — vá até o balcão no horário combinado.'}
      </p>
      {estimatedReadyAt && (
        <div className="mx-auto flex w-fit items-center gap-2 rounded-lg bg-[#F3E8FB] px-4 py-2 text-xs font-medium text-[#6D2E9E]">
          <Clock size={16} />
          {orderKind === 'DELIVERY' ? `Previsão de chegada: até ${formatClock(estimatedReadyAt)}` : `Previsão pra retirar: até ${formatClock(estimatedReadyAt)}`}
        </div>
      )}
      {orderId && (
        <Link to={`/pedido/${slug}/rastreio/${orderId}`} className={`${PRIMARY_CTA} mt-3`}>
          Acompanhar pedido
        </Link>
      )}
      <button className="mt-[18px] text-[12.5px] font-bold text-[#6D2E9E] underline decoration-[#6D2E9E]/35 underline-offset-2" onClick={onNewOrder}>
        Fazer novo pedido
      </button>
    </div>
  );
}
