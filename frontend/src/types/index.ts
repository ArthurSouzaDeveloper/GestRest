export type Role = 'ADMIN' | 'MANAGER' | 'WAITER' | 'JUICER' | 'COOK' | 'CASHIER';
export type Station = 'KITCHEN' | 'JUICE_BAR' | 'NONE';
export type TableStatus =
  | 'FREE'
  | 'OCCUPIED'
  | 'IN_PRODUCTION'
  | 'READY_FOR_PAYMENT'
  | 'CLOSED';
export type OrderStatus =
  | 'OPEN'
  | 'IN_PRODUCTION'
  | 'READY_FOR_PAYMENT'
  | 'PAID'
  | 'CANCELLED';
export type ProductionStatus = 'WAITING' | 'PREPARING' | 'DONE' | 'CANCELLED';
export type PaymentMethod = 'PIX' | 'CASH' | 'CREDIT' | 'DEBIT' | 'MEAL_VOUCHER';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  active?: boolean;
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

export interface RestaurantTable {
  id: string;
  number: number;
  status: TableStatus;
  seats: number;
  orders?: { id: string; status: OrderStatus }[];
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
  total: number;
  paid: number;
  remaining: number;
}

export interface Order {
  id: string;
  number: number;
  tableId: string;
  status: OrderStatus;
  peopleCount: number;
  notes?: string;
  discount: number;
  serviceRate: number;
  version: number;
  openedAt: string;
  table: RestaurantTable;
  customer?: { id: string; name: string };
  waiter: { id: string; name: string };
  items: OrderItem[];
  totals: OrderTotals;
}

export interface ProductionTicket {
  id: string;
  orderId: string;
  tableNumber: number;
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
