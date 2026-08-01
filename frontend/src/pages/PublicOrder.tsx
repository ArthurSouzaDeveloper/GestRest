import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { deriveBrandVars } from '../lib/publicBrand';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ChevronLeft,
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
import type { DeliveryZone, EtaEstimate, OrderStatus, OrderType, PaymentMethod, PlaceDetails } from '../types';

/** "19:45" a partir de um ISO — usado pra mostrar a previsão travada na confirmação. */
function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** Nota de previsão reaproveitada nas telas de Dados/Carrinho/Revisão — some se a estimativa ainda não carregou. */
function EtaNote({ eta }: { eta?: EtaEstimate }) {
  if (!eta) return null;
  return (
    <div className="flex items-center gap-2 rounded-[6px] bg-brand-100 px-3 py-2 text-xs font-medium text-brand">
      <Clock size={14} className="shrink-0" />
      <span>
        Previsão agora: até {eta.minutes} min
        {eta.mode === 'AUTO' && eta.activeOrders > 5 ? ' — cozinha com fluxo alto no momento' : ''}
      </span>
    </div>
  );
}

// ─── Tokens visuais do site público — direção "Modernist" azul aprovada na prévia:
// cantos mais retos, divisórias grossas, tipografia pesada, azul do sistema principal
// no lugar do roxo antigo. Espelham 1:1 as classes do preview. ───────────────
const FIELD_LABEL = 'mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[#5A6072]';
const FIELD_INPUT =
  'w-full rounded-[6px] border border-[#14161C]/[0.18] bg-white px-3.5 py-2.5 text-[13.5px] text-[#14161C] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20';
const PRIMARY_CTA =
  'block w-full rounded-[6px] bg-gradient-to-br from-brand to-brand-700 px-4 py-3.5 text-center text-[13.5px] font-extrabold text-white shadow-[0_10px_20px_-8px_rgba(20,41,94,0.45)] transition disabled:cursor-not-allowed disabled:opacity-50';
const STEP_TITLE = 'mb-[18px] text-[18px] font-extrabold tracking-tight text-[#14161C]';
const CARD = 'rounded-[6px] border border-[#14161C]/[0.1] bg-white';

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
    <div className="fixed bottom-0 left-0 right-0 border-t-2 border-[#14161C]/10 bg-[#F4F6FA] p-3 pb-3.5">
      <button
        className="mx-auto flex w-full max-w-3xl items-center justify-between rounded-[6px] bg-gradient-to-br from-brand to-brand-700 px-[18px] py-[13px] text-[13.5px] font-bold text-white shadow-[0_10px_20px_-8px_rgba(20,41,94,0.45)] disabled:cursor-not-allowed disabled:opacity-60"
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
  brandColor: string | null;
  logoUrl: string | null;
}

interface CustomerOrderSummary {
  id: string;
  number: number;
  status: OrderStatus;
  orderType: OrderType;
  total: number;
  estimatedReadyAt: string | null;
  createdAt: string;
}

interface SavedCustomer {
  name: string;
  phone: string;
}

/** Identidade salva no navegador (nome+telefone) — só pra reconhecer quem já pediu
 * antes e oferecer "ver meu pedido" sem precisar redigitar. Escopada por restaurante. */
function customerStorageKey(slug: string): string {
  return `gr:${slug}:customer`;
}
function readSavedCustomer(slug: string): SavedCustomer | null {
  try {
    const raw = localStorage.getItem(customerStorageKey(slug));
    return raw ? (JSON.parse(raw) as SavedCustomer) : null;
  } catch {
    return null;
  }
}
function saveCustomer(slug: string, customer: SavedCustomer): void {
  try {
    localStorage.setItem(customerStorageKey(slug), JSON.stringify(customer));
  } catch {
    // localStorage indisponível (modo privado etc.) — não é crítico, só perde a conveniência.
  }
}

const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'Aguardando confirmação',
  OPEN: 'Em preparo',
  IN_PRODUCTION: 'Em preparo',
  READY_FOR_PAYMENT: 'Pronto',
  PAID: 'Concluído',
  CANCELLED: 'Cancelado',
};

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
  const [deliveryCity, setDeliveryCity] = useState<string | null>(null);
  const [deliveryLat, setDeliveryLat] = useState<number | null>(null);
  const [deliveryLng, setDeliveryLng] = useState<number | null>(null);
  const [deliveryStreet, setDeliveryStreet] = useState('');
  const [deliveryNumber, setDeliveryNumber] = useState('');
  const [deliveryCep, setDeliveryCep] = useState('');
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

  // Cidades distintas entre os bairros cadastrados (bairro salvo como "Bairro (Cidade)" —
  // ver script de importação). A maioria dos tenants atende só uma cidade e nem grava esse
  // sufixo, então o bloco de cidade só aparece quando faz sentido (mais de uma cidade
  // cadastrada) — pra não confundir quem só usa uma.
  const zoneCities = useMemo(() => {
    const set = new Set<string>();
    for (const z of zones) {
      const city = splitZoneName(z.name).city;
      if (city) set.add(city);
    }
    return [...set];
  }, [zones]);
  const needsCityFirst = zoneCities.length > 1;
  // Sem escolher a cidade ainda (tenant multi-cidade), não mostra bairro nenhum — evita o
  // cliente escolher um "Centro" errado antes de dizer qual cidade é a dele.
  const zonesForBairro = needsCityFirst ? zones.filter((z) => splitZoneName(z.name).city === deliveryCity) : zones;

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
    !!orderKind &&
    customerName.trim().length >= 2 &&
    customerPhone.trim().length >= 8 &&
    (orderKind === 'PICKUP' ||
      (distanceMode
        ? deliveryLat !== null && deliveryLng !== null && !!deliveryQuote && !quoteOutOfRange && deliveryNumber.trim()
        : deliveryZoneId && deliveryStreet.trim() && deliveryNumber.trim()));

  // Quem clicou em "Só quero ver o cardápio" na Capa pula a escolha de Entrega/Retirada —
  // se tentar avançar pro Carrinho/Pagamento/Revisão sem isso definido, manda de volta pra
  // Dados pra escolher (sem isso, a Revisão ficava em branco e dava pra finalizar sem endereço).
  useEffect(() => {
    if ((step === 'cart' || step === 'payment' || step === 'review') && !orderKind) {
      setStep('details');
    }
  }, [step, orderKind]);

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
              deliveryCep: deliveryCep.trim() || undefined,
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
      // Lembra nome+telefone nesse navegador — é o que deixa o cliente "entrar" de novo na
      // Capa depois de fechar o site pra ver como o pedido está indo.
      saveCustomer(slug, { name: customerName.trim(), phone: customerPhone.trim() });
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
    <div className="min-h-screen bg-[#F4F6FA]" style={deriveBrandVars(restaurant.brandColor)}>
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
          slug={slug}
          restaurantName={restaurant.name}
          logoUrl={restaurant.logoUrl}
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
        {step === 'details' && (
          <DetailsStep
            slug={slug}
            orderKind={orderKind}
            onChangeKind={setOrderKind}
            customerName={customerName}
            setCustomerName={setCustomerName}
            customerPhone={customerPhone}
            setCustomerPhone={setCustomerPhone}
            distanceMode={distanceMode}
            zones={zonesForBairro}
            zoneCities={zoneCities}
            deliveryCity={deliveryCity}
            setDeliveryCity={(city) => {
              setDeliveryCity(city);
              setDeliveryZoneId(''); // bairro escolhido antes pode ser de outra cidade
            }}
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
            deliveryCep={deliveryCep}
            setDeliveryCep={setDeliveryCep}
            deliveryComplement={deliveryComplement}
            setDeliveryComplement={setDeliveryComplement}
            canContinue={!!canContinueDetails}
            onContinue={() => setStep(draft.length > 0 ? 'cart' : 'menu')}
            continueLabel={draft.length > 0 ? 'Continuar para o carrinho' : 'Continuar para o cardápio'}
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
            onContinue={() => setStep(orderKind ? 'review' : 'details')}
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
            deliveryCep={deliveryCep}
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
              setDeliveryCity(null);
              setDeliveryLat(null);
              setDeliveryLng(null);
              setDeliveryStreet('');
              setDeliveryNumber('');
              setDeliveryCep('');
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
          onClick={() => setStep(orderKind ? 'payment' : 'details')}
        />
      )}

      {step === 'review' && (
        <CartBar
          left={submitOrder.isPending ? 'Enviando...' : 'Confirmar'}
          right={`Fazer Pedido · ${brl(total)}`}
          disabled={submitOrder.isPending || !orderKind}
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
    <div className="sticky top-0 z-10 bg-gradient-to-br from-brand to-brand-700">
      <div className={`mx-auto flex items-center gap-2.5 px-4 py-3 ${title === 'Cardápio' ? 'max-w-3xl' : 'max-w-md'}`}>
        <button onClick={onBack} className="flex text-white/85 hover:text-white" title="Voltar">
          <ChevronLeft size={20} strokeWidth={2.3} />
        </button>
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-white text-[10.5px] font-extrabold text-brand">
          {restaurantName.slice(0, 2).toUpperCase()}
        </div>
        <span className="text-sm font-extrabold uppercase tracking-wide text-white">{title}</span>
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
  slug,
  restaurantName,
  logoUrl,
  onPick,
}: {
  slug: string;
  restaurantName: string;
  logoUrl: string | null;
  onPick: (kind: OrderKind | 'MENU') => void;
}) {
  const [kind, setKind] = useState<OrderKind>('DELIVERY');

  const { data: eta } = useQuery({
    queryKey: ['public-eta', slug, kind],
    queryFn: async () => (await api.get<EtaEstimate>(`/public/${slug}/eta`, { params: { orderType: kind } })).data,
    enabled: !!slug,
  });

  return (
    <div className="flex min-h-screen flex-col items-center bg-[#F4F6FA] px-7 pt-12 dark:bg-[#F4F6FA]">
      <div className="w-full max-w-md overflow-hidden rounded-[6px] border border-[#14161C]/[0.08] bg-white">
        {/* Topo do card: a logo do restaurante (subida pela tela de Identidade Visual, ver
            branding.service.ts), centralizada num fundo levemente tingido da cor da marca.
            Sem logo configurada ainda, cai no mesmo placeholder de "foto do restaurante" de
            antes — pensado pra virar uma foto de verdade do balcão quando existir esse campo. */}
        {logoUrl ? (
          <div className="flex h-40 w-full items-center justify-center bg-brand-50">
            <img src={logoUrl} alt={restaurantName} className="h-32 w-32 object-contain" />
          </div>
        ) : (
          <div
            className="flex h-40 w-full items-center justify-center text-center text-[10.5px] font-bold uppercase tracking-wide text-gray-400"
            style={{
              backgroundColor: '#E7E5E4',
              backgroundImage:
                'repeating-linear-gradient(-45deg, transparent, transparent 10px, rgba(255,255,255,0.6) 10px, rgba(255,255,255,0.6) 20px)',
            }}
          >
            Foto: balcão de pastéis e sucos
          </div>
        )}

        <div className="p-4">
          <h6 className="text-[11px] font-bold uppercase tracking-[0.08em] text-brand">Pastelaria &amp; Sucaria</h6>
          <h1 className="mt-0.5 text-[26px] font-extrabold leading-tight text-[#14161C]">{restaurantName}</h1>

          <div className="mt-4 border-t-2 border-[#14161C]/[0.08] pt-4">
            <h6 className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#5A6072]">Como você quer receber?</h6>
            <div className="flex gap-1 rounded-[6px] border border-[#14161C]/10 bg-[#F4F6FA] p-1">
              <button
                className={`flex-1 rounded-[4px] py-2 text-[12.5px] font-bold transition ${
                  kind === 'DELIVERY' ? 'bg-brand text-white' : 'text-[#5A6072]'
                }`}
                onClick={() => setKind('DELIVERY')}
              >
                Entrega
              </button>
              <button
                className={`flex-1 rounded-[4px] py-2 text-[12.5px] font-bold transition ${
                  kind === 'PICKUP' ? 'bg-brand text-white' : 'text-[#5A6072]'
                }`}
                onClick={() => setKind('PICKUP')}
              >
                Retirada
              </button>
            </div>

            <div className="mt-3">
              <EtaNote eta={eta} />
            </div>

            <button className={`${PRIMARY_CTA} mt-4`} onClick={() => onPick(kind)}>
              Ver cardápio completo
            </button>
            <button
              className="mt-2.5 w-full text-center text-[11.5px] font-semibold text-[#5A6072] underline underline-offset-2"
              onClick={() => onPick('MENU')}
            >
              Só quero ver o cardápio
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-auto flex w-full max-w-md flex-col items-center gap-2.5 pb-6 pt-8">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500">
          <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-[#8BC53F] shadow-[0_0_0_3px_rgba(139,197,63,0.22)]" />
          Aberto de quarta a domingo até 23h
        </div>

        <CustomerLoginPanel slug={slug} />

        <div className="flex items-center gap-2.5">
          <a
            href="https://www.instagram.com/oreidosucoamericana"
            target="_blank"
            rel="noreferrer"
            title="Instagram"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[#14161C]/15 bg-white text-[#14161C]"
          >
            <Instagram size={15} />
          </a>
          <a
            href="https://wa.me/551934054361"
            target="_blank"
            rel="noreferrer"
            title="WhatsApp"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[#14161C]/15 bg-white text-[#14161C]"
          >
            <MessageCircle size={15} />
          </a>
          <a
            href="https://www.google.com/maps/place/Rei+do+Suco/@-22.7481879,-47.3612074,17z/data=!3m1!4b1!4m6!3m5!1s0x94c89bef9f7cfaf7:0x607ad2fefac4fcd5!8m2!3d-22.7481879!4d-47.3586271!16s%2Fg%2F11b779z2w4"
            target="_blank"
            rel="noreferrer"
            title="Localização"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[#14161C]/15 bg-white text-[#14161C]"
          >
            <MapPin size={15} />
          </a>
        </div>
      </div>
    </div>
  );
}

/**
 * "Entrar" no site público por nome+telefone — não é autenticação de verdade (sem senha),
 * é só o jeito do cliente reencontrar os próprios pedidos depois de fechar o navegador
 * (sem o link de acompanhamento salvo). Se o navegador já tem uma identidade salva de um
 * pedido anterior, mostra direto "bem-vindo de volta"; senão, oferece o link discreto que
 * abre o formulário.
 */
function CustomerLoginPanel({ slug }: { slug: string }) {
  const [saved] = useState(() => readSavedCustomer(slug));
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(saved?.name ?? '');
  const [phone, setPhone] = useState(saved?.phone ?? '');
  const [result, setResult] = useState<{ name: string | null; orders: CustomerOrderSummary[] } | null>(null);

  const login = useMutation({
    mutationFn: async () => {
      const payload = { name: name.trim(), phone: phone.trim() };
      const data = (await api.post<{ name: string | null; orders: CustomerOrderSummary[] }>(`/public/${slug}/customers/login`, payload)).data;
      if (data.name) saveCustomer(slug, payload);
      return data;
    },
    onSuccess: setResult,
  });

  if (!open && !saved) {
    return (
      <button
        className="mt-3 text-[11.5px] font-semibold text-brand underline decoration-brand/35 underline-offset-2"
        onClick={() => setOpen(true)}
      >
        Já pediu antes? Entrar
      </button>
    );
  }

  return (
    <div className="mt-3 w-full max-w-md">
      {!open && saved && !result && (
        <div className="flex items-center justify-between rounded-[6px] border border-[#14161C]/10 bg-white px-3.5 py-2.5">
          <span className="text-[12px] font-semibold text-[#14161C]">Bem-vindo de volta, {saved.name.split(' ')[0]}</span>
          <button
            className="text-[11.5px] font-bold text-brand disabled:opacity-50"
            disabled={login.isPending}
            onClick={() => login.mutate()}
          >
            {login.isPending ? 'Buscando...' : 'Ver meu pedido'}
          </button>
        </div>
      )}

      {open && !result && (
        <div className="rounded-[6px] border border-[#14161C]/10 bg-white p-3.5">
          <p className="mb-2 text-[11.5px] font-bold uppercase tracking-wide text-[#5A6072]">Entrar</p>
          <div className="flex flex-col gap-2">
            <input className={FIELD_INPUT} value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" />
            <input
              className={FIELD_INPUT}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(21) 9 9999-9999"
              inputMode="tel"
            />
            <button
              className="rounded-[6px] bg-brand py-2 text-[12.5px] font-bold text-white disabled:opacity-50"
              disabled={login.isPending || name.trim().length < 2 || phone.trim().length < 8}
              onClick={() => login.mutate()}
            >
              {login.isPending ? 'Buscando...' : 'Entrar'}
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className="rounded-[6px] border border-[#14161C]/10 bg-white p-3.5">
          {result.name === null ? (
            <p className="text-[12px] text-red-600">Nenhum pedido encontrado com esse nome e telefone.</p>
          ) : result.orders.length === 0 ? (
            <p className="text-[12px] text-[#5A6072]">Você ainda não tem pedidos por aqui.</p>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-[11.5px] font-bold uppercase tracking-wide text-[#5A6072]">Seus pedidos</p>
              {result.orders.map((o) => (
                <Link
                  key={o.id}
                  to={`/pedido/${slug}/rastreio/${o.id}`}
                  className="flex items-center justify-between rounded-[6px] border border-[#14161C]/10 px-3 py-2 text-[12.5px] hover:bg-brand-100"
                >
                  <span className="font-bold text-[#14161C]">Pedido #{o.number}</span>
                  <span className="text-brand">{ORDER_STATUS_LABEL[o.status]}</span>
                </Link>
              ))}
            </div>
          )}
          <button
            className="mt-2.5 text-[11px] font-semibold text-[#5A6072] underline underline-offset-2"
            onClick={() => {
              setResult(null);
              setOpen(false);
            }}
          >
            Fechar
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Bairros são salvos como "Bairro (Cidade)" pra não colidir entre cidades diferentes que
 * têm rua com o mesmo nome (ver script de importação) — aqui separa os dois só pra exibir
 * organizado: a cidade vira cabeçalho de bloco, o nome do bairro fica limpo.
 */
function splitZoneName(fullName: string): { bairro: string; city: string | null } {
  const m = fullName.match(/^(.+) \(([^)]+)\)$/);
  return m ? { bairro: m[1], city: m[2] } : { bairro: fullName, city: null };
}

/**
 * Busca local do bairro entre os cadastrados — sem chamada nenhuma, a lista já veio
 * carregada com a tela (reaproveita o mesmo GET /public/:slug/delivery-zones de sempre).
 * Se o cliente digitar um bairro que não bate com nada cadastrado, mostra o aviso de fora
 * da área com um contato — mesmo WhatsApp já usado no rodapé do Início.
 */
function ZoneAutocomplete({
  zones,
  selectedZoneId,
  onSelect,
}: {
  zones: DeliveryZone[];
  selectedZoneId: string;
  onSelect: (zoneId: string) => void;
}) {
  const [query, setQuery] = useState(() => {
    const selected = zones.find((z) => z.id === selectedZoneId);
    return selected ? splitZoneName(selected.name).bairro : '';
  });
  const [open, setOpen] = useState(false);

  const term = query.trim().toLowerCase();
  const filtered = term ? zones.filter((z) => z.name.toLowerCase().includes(term)) : zones;
  const notFound = zones.length === 0 || (term.length > 0 && !selectedZoneId && filtered.length === 0);

  const pick = (zone: DeliveryZone) => {
    setQuery(splitZoneName(zone.name).bairro);
    onSelect(zone.id);
    setOpen(false);
  };

  return (
    <div className="relative">
      <input
        className={FIELD_INPUT}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (selectedZoneId) onSelect('');
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Digite o nome do seu bairro"
        autoComplete="off"
        disabled={zones.length === 0}
      />
      {open && term.length > 0 && filtered.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-[6px] border border-[#14161C]/[0.15] bg-white shadow-lg">
          {filtered.map((z) => (
            <button
              key={z.id}
              type="button"
              className="flex w-full items-center justify-between border-b border-gray-100 p-2.5 text-left text-[12.5px] text-[#14161C] last:border-b-0 hover:bg-gray-50"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(z)}
            >
              <span>{splitZoneName(z.name).bairro}</span>
              <span className="text-[#5A6072]">{brl(z.fee)}</span>
            </button>
          ))}
        </div>
      )}
      {notFound && (
        <p className="mt-1.5 text-[11px] text-red-600">
          Bairro indisponível para entrega. Fale com a gente pelo{' '}
          <a href="https://wa.me/551934054361" target="_blank" rel="noreferrer" className="font-semibold underline">
            WhatsApp (19) 3405-4361
          </a>
          .
        </p>
      )}
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
  zoneCities,
  deliveryCity,
  setDeliveryCity,
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
  deliveryCep,
  setDeliveryCep,
  deliveryComplement,
  setDeliveryComplement,
  canContinue,
  onContinue,
  continueLabel,
  eta,
}: {
  slug: string;
  orderKind: OrderKind | null;
  onChangeKind: (kind: OrderKind) => void;
  customerName: string;
  setCustomerName: (v: string) => void;
  customerPhone: string;
  setCustomerPhone: (v: string) => void;
  distanceMode: boolean;
  zones: DeliveryZone[];
  zoneCities: string[];
  deliveryCity: string | null;
  setDeliveryCity: (v: string | null) => void;
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
  deliveryCep: string;
  setDeliveryCep: (v: string) => void;
  deliveryComplement: string;
  setDeliveryComplement: (v: string) => void;
  canContinue: boolean;
  onContinue: () => void;
  continueLabel: string;
  eta?: EtaEstimate;
}) {
  const selectedZone = zones.find((z) => z.id === deliveryZoneId);
  const selectedFee = selectedZone?.fee;
  return (
    <div className="space-y-4">
      <h2 className={STEP_TITLE}>Pra onde vai o pedido?</h2>

      <div className="mb-[18px] flex gap-1 rounded-[6px] border border-[#14161C]/10 bg-white p-1">
        <button
          className={`flex-1 rounded-[4px] py-2 text-[12.5px] font-bold transition ${
            orderKind === 'DELIVERY' ? 'bg-brand text-white' : 'text-[#5A6072]'
          }`}
          onClick={() => onChangeKind('DELIVERY')}
        >
          Entrega
        </button>
        <button
          className={`flex-1 rounded-[4px] py-2 text-[12.5px] font-bold transition ${
            orderKind === 'PICKUP' ? 'bg-brand text-white' : 'text-[#5A6072]'
          }`}
          onClick={() => onChangeKind('PICKUP')}
        >
          Retirada
        </button>
      </div>

      {!orderKind && (
        <p className="-mt-3 text-[11.5px] text-[#5A6072]">Escolha Entrega ou Retirada pra continuar.</p>
      )}

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
              <p className="mt-1 flex items-center gap-1.5 text-[11px] text-[#5A6072]">
                <Loader2 size={11} className="animate-spin" /> Calculando frete...
              </p>
            )}
            {deliveryLat !== null && !quotingDelivery && quoteOutOfRange && (
              <p className="mt-1 text-[11px] text-red-600">Esse endereço está fora da nossa área de entrega.</p>
            )}
            {deliveryQuote && !quotingDelivery && (
              <p className="mt-1 text-[11px] text-[#5A6072]">
                Taxa de entrega: {brl(deliveryQuote.fee)} ({deliveryQuote.distanceKm.toFixed(1)} km)
              </p>
            )}
          </div>
          <div>
            <label className={FIELD_LABEL}>Número</label>
            <input className={FIELD_INPUT} value={deliveryNumber} onChange={(e) => setDeliveryNumber(e.target.value)} placeholder="123" />
          </div>
          <div>
            <label className={FIELD_LABEL}>CEP (opcional)</label>
            <input
              className={FIELD_INPUT}
              value={deliveryCep}
              onChange={(e) => setDeliveryCep(e.target.value)}
              placeholder="13480-000"
              inputMode="numeric"
            />
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
          {zoneCities.length > 1 && (
            <div>
              <label className={FIELD_LABEL}>Cidade</label>
              <div className="flex flex-wrap gap-1.5">
                {zoneCities.map((city) => (
                  <button
                    key={city}
                    type="button"
                    className={`rounded-[4px] px-3 py-2 text-[12.5px] font-bold transition ${
                      deliveryCity === city ? 'bg-brand text-white' : 'border border-[#14161C]/10 text-[#5A6072]'
                    }`}
                    onClick={() => setDeliveryCity(city)}
                  >
                    {city}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className={FIELD_LABEL}>Bairro</label>
            {zoneCities.length > 1 && !deliveryCity ? (
              <p className={`${FIELD_INPUT} flex items-center text-[#5A6072]`}>Escolha a cidade acima primeiro</p>
            ) : (
              <ZoneAutocomplete
                key={deliveryCity ?? 'sem-cidade'}
                zones={zones}
                selectedZoneId={deliveryZoneId}
                onSelect={setDeliveryZoneId}
              />
            )}
            {selectedFee !== undefined && <p className="mt-1 text-[11px] text-[#5A6072]">Taxa de entrega: {brl(selectedFee)}</p>}
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
            <label className={FIELD_LABEL}>CEP (opcional)</label>
            <input
              className={FIELD_INPUT}
              value={deliveryCep}
              onChange={(e) => setDeliveryCep(e.target.value)}
              placeholder="13480-000"
              inputMode="numeric"
            />
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
        {continueLabel}
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
            <div key={i} className="flex items-start justify-between gap-2.5 border-b border-[#14161C]/[0.08] py-3 last:border-b-0">
              <span className="w-6 shrink-0 text-[12.5px] font-extrabold text-brand">{item.quantity}×</span>
              <div className="flex-1">
                <div className="text-[13px] font-bold text-[#14161C]">{item.product.name}</div>
                {item.notes && <div className="mt-0.5 text-[10.5px] text-[#5A6072]">{item.notes}</div>}
                {item.additionalIds.length > 0 && (
                  <div className="mt-0.5 text-[10.5px] text-[#5A6072]">+ {item.additionalIds.length} adicional(is)</div>
                )}
                <div className="mt-1.5 flex items-center gap-2">
                  <button
                    className="flex h-6 w-6 items-center justify-center rounded-full border border-[#14161C]/15 text-[#14161C]"
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
                    className="flex h-6 w-6 items-center justify-center rounded-full border border-[#14161C]/15 text-[#14161C]"
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
              <span className="shrink-0 text-[12.5px] font-bold tabular-nums text-[#14161C]">
                {brl(draftItemUnitPrice(item) * item.quantity)}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-2 border-t-2 border-[#14161C]/[0.12] pt-3.5">
        <div className="flex justify-between py-1 text-[12.5px] text-[#4A5068]">
          <span>Subtotal</span>
          <span>{brl(subtotal)}</span>
        </div>
        {orderKind === 'DELIVERY' && (
          <div className="flex justify-between py-1 text-[12.5px] text-[#4A5068]">
            <span>Taxa de entrega{deliveryZoneName ? ` · ${deliveryZoneName}` : ''}</span>
            <span>{brl(deliveryFee)}</span>
          </div>
        )}
        <div className="flex justify-between pt-2 text-[15.5px] font-extrabold text-[#14161C]">
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
            className={`flex flex-col items-center gap-2 rounded-[6px] border-2 p-4 text-center transition ${
              paymentMethod === key ? 'border-brand bg-brand-100' : 'border-[#14161C]/10 bg-white'
            }`}
            onClick={() => setPaymentMethod(key)}
          >
            <Icon className="text-brand" size={21} />
            <span className="text-xs font-bold text-[#14161C]">{label}</span>
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
          <div className="mt-[5px] text-[11px] text-[#5A6072]">Total do pedido: {brl(total)}</div>
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
  deliveryCep,
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
  deliveryCep: string;
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
        <h3 className="mb-2 text-[10.5px] font-extrabold uppercase tracking-wide text-brand">
          {orderKind === 'DELIVERY' ? 'Entrega' : 'Retirada'}
        </h3>
        <div className="text-[12.5px] leading-[1.55] text-[#14161C]">{customerName} · {customerPhone}</div>
        {orderKind === 'DELIVERY' && (
          <>
            <div className="text-[12.5px] leading-[1.55] text-[#14161C]">
              {deliveryStreet}, {deliveryNumber}{deliveryComplement ? ` — ${deliveryComplement}` : ''}
            </div>
            {deliveryCep && <div className="text-[11.5px] text-[#5A6072]">CEP: {deliveryCep}</div>}
            {deliveryZoneName && <div className="text-[11.5px] text-[#5A6072]">{deliveryZoneName}</div>}
          </>
        )}
      </div>

      <div className={`${CARD} p-3.5`}>
        <h3 className="mb-2 text-[10.5px] font-extrabold uppercase tracking-wide text-brand">Itens</h3>
        {draft.map((item, i) => (
          <div key={i} className="text-[12.5px] leading-[1.55] text-[#14161C]">
            {item.quantity}× {item.product.name} — {brl(draftItemUnitPrice(item) * item.quantity)}
          </div>
        ))}
      </div>

      <div className={`${CARD} p-3.5`}>
        <h3 className="mb-2 text-[10.5px] font-extrabold uppercase tracking-wide text-brand">Pagamento</h3>
        <div className="text-[12.5px] leading-[1.55] text-[#14161C]">
          {paymentLabel}
          {paymentMethod === 'CASH' && changeFor ? ` · troco pra ${brl(Number(changeFor))}` : ''}
        </div>
      </div>

      <div className="border-t-2 border-[#14161C]/[0.12] pt-3.5">
        <div className="flex justify-between py-1 text-[12.5px] text-[#4A5068]">
          <span>Subtotal</span>
          <span>{brl(subtotal)}</span>
        </div>
        {orderKind === 'DELIVERY' && (
          <div className="flex justify-between py-1 text-[12.5px] text-[#4A5068]">
            <span>Taxa de entrega</span>
            <span>{brl(deliveryFee)}</span>
          </div>
        )}
        <div className="flex justify-between pt-2 text-[15.5px] font-extrabold text-[#14161C]">
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
      <div className="flex h-[62px] w-[62px] items-center justify-center rounded-[6px] border-2 border-brand text-brand">
        <Check size={28} strokeWidth={2.6} />
      </div>
      <h1 className="mt-1 text-[18px] font-extrabold text-[#14161C]">Pedido recebido!</h1>
      {orderNumber && (
        <div className="text-[12.5px] text-[#5A6072]">
          Número do pedido <b className="text-[14.5px] text-[#14161C]">#{orderNumber}</b>
        </div>
      )}
      <p className="max-w-[26ch] text-[12.5px] leading-[1.5] text-[#4A5068]">
        {orderKind === 'DELIVERY'
          ? 'O restaurante já foi avisado. Assim que aceitar, seu pedido entra em preparo.'
          : 'O restaurante já foi avisado. Assim que aceitar, seu pedido entra em preparo — vá até o balcão no horário combinado.'}
      </p>
      {estimatedReadyAt && (
        <div className="mx-auto flex w-fit items-center gap-2 rounded-[6px] bg-brand-100 px-4 py-2 text-xs font-medium text-brand">
          <Clock size={16} />
          {orderKind === 'DELIVERY' ? `Previsão de chegada: até ${formatClock(estimatedReadyAt)}` : `Previsão pra retirar: até ${formatClock(estimatedReadyAt)}`}
        </div>
      )}
      {orderId && (
        <Link to={`/pedido/${slug}/rastreio/${orderId}`} className={`${PRIMARY_CTA} mt-3`}>
          Acompanhar pedido
        </Link>
      )}
      <button className="mt-[18px] text-[12.5px] font-bold text-brand underline decoration-brand/35 underline-offset-2" onClick={onNewOrder}>
        Fazer novo pedido
      </button>
    </div>
  );
}
