export type Role = 'SUPERADMIN' | 'ADMIN' | 'MANAGER' | 'WAITER' | 'JUICER' | 'COOK' | 'CASHIER';

export interface RestaurantRef {
  id: string;
  slug: string;
  name: string;
}
export type Station = 'KITCHEN' | 'JUICE_BAR' | 'NONE';
export type TableStatus =
  | 'FREE'
  | 'OCCUPIED'
  | 'IN_PRODUCTION'
  | 'READY_FOR_PAYMENT'
  | 'CLOSED';
export type OrderStatus =
  | 'PENDING'
  | 'OPEN'
  | 'IN_PRODUCTION'
  | 'READY_FOR_PAYMENT'
  | 'PAID'
  | 'CANCELLED';
// DINE_IN = comanda de mesa (garçom). DELIVERY/PICKUP vêm do site público de pedidos.
export type OrderType = 'DINE_IN' | 'DELIVERY' | 'PICKUP';
export type ProductionStatus = 'WAITING' | 'PREPARING' | 'DONE' | 'CANCELLED';
export type PaymentMethod = 'PIX' | 'CASH' | 'CREDIT' | 'DEBIT' | 'MEAL_VOUCHER';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  active?: boolean;
  restaurant?: RestaurantRef | null;
}

export interface RestaurantSummary {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  createdAt: string;
  counts: { users: number; orders: number; products: number };
}

export interface Category {
  id: string;
  name: string;
  station: Station;
  sortOrder: number;
}

export interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  avgPrepMin: number;
  available: boolean;
  categoryId: string;
  category?: Category;
}

export interface Additional {
  id: string;
  name: string;
  price: number;
  active: boolean;
  categoryId?: string;
}

export interface TableComandaSummary {
  id: string;
  number: number;
  status: OrderStatus;
  openedAt: string;
  peopleCount: number;
  customer: { name: string } | null;
}

export interface RestaurantTable {
  id: string;
  number: number;
  status: TableStatus;
  seats: number;
  orders?: TableComandaSummary[];
}

export interface DeliveryZone {
  id: string;
  name: string;
  fee: number;
  active: boolean;
}

export interface OrderItemAdditional {
  id: string;
  name: string;
  price: number;
}

export interface OrderItem {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  notes?: string;
  station: Station;
  status: ProductionStatus;
  product: Product;
  additionals: OrderItemAdditional[];
}

export interface OrderTotals {
  subtotal: number;
  serviceFee: number;
  discount: number;
  deliveryFee: number;
  total: number;
  paid: number;
  remaining: number;
}

export interface Order {
  id: string;
  number: number;
  orderType: OrderType;
  // Pedido online (DELIVERY/PICKUP) não tem mesa nem garçom.
  tableId?: string;
  table?: RestaurantTable;
  waiter?: { id: string; name: string };
  status: OrderStatus;
  peopleCount: number;
  notes?: string;
  discount: number;
  serviceRate: number;
  version: number;
  openedAt: string;
  customer?: { id: string; name: string; phone?: string };
  items: OrderItem[];
  totals: OrderTotals;
  // Campos de delivery/retirada — só preenchidos quando orderType != 'DINE_IN'.
  deliveryZoneId?: string;
  deliveryZone?: DeliveryZone | null;
  deliveryFee: number;
  deliveryStreet?: string;
  deliveryNumber?: string;
  deliveryComplement?: string;
  declaredPaymentMethod?: PaymentMethod;
  changeFor?: number | null;
  acceptedAt?: string | null;
  /** Previsão travada no momento da confirmação (site público) — cálculo em eta.service.ts. */
  estimatedReadyAt?: string | null;
}

export interface EtaEstimate {
  minutes: number;
  activeOrders: number;
}

export interface ProductionTicket {
  id: string;
  orderId: string;
  tableNumber: number | null;
  orderType: OrderType;
  orderNumber: number;
  customerName: string | null;
  productName: string;
  avgPrepMin: number;
  quantity: number;
  notes?: string;
  additionals: string[];
  status: ProductionStatus;
  createdAt: string;
  waitingMin: number;
  critical: boolean;
}

export interface DashboardSummary {
  tables: { free: number; occupied: number; inProduction: number; readyForPayment: number };
  orders: { waitingItems: number; producingItems: number; finishedToday: number; cancelledToday: number };
  revenue: { daily: number; weekly: number; monthly: number };
  avgPrepMin: number;
  topProducts: { name: string; quantity: number }[];
  topWaiters: { name: string; orders: number }[];
}
