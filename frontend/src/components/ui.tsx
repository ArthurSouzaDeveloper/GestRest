import { ReactNode } from 'react';
import clsx from 'clsx';
import type { OrderStatus, OrderType, PaymentMethod, ProductionStatus, TableStatus } from '../types';

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('card p-4', className)}>{children}</div>;
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex items-end justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center p-10 text-gray-400">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-brand" />
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className={clsx('card max-h-[90vh] w-full overflow-y-auto p-6', wide ? 'max-w-3xl' : 'max-w-md')}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

const productionStyles: Record<ProductionStatus, string> = {
  WAITING: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  PREPARING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  DONE: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  CANCELLED: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};
const productionLabels: Record<ProductionStatus, string> = {
  WAITING: 'Aguardando',
  PREPARING: 'Preparando',
  DONE: 'Concluído',
  CANCELLED: 'Cancelado',
};

export function ProductionBadge({ status }: { status: ProductionStatus }) {
  return (
    <span className={clsx('rounded-full px-2.5 py-0.5 text-xs font-medium', productionStyles[status])}>
      {productionLabels[status]}
    </span>
  );
}

const tableStyles: Record<TableStatus, string> = {
  FREE: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
  OCCUPIED: 'bg-brand-50 text-brand-700 border-brand-100 dark:bg-brand/20 dark:text-blue-200',
  IN_PRODUCTION: 'bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-200',
  READY_FOR_PAYMENT: 'bg-green-50 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-200',
  CLOSED: 'bg-gray-200 text-gray-500 border-gray-300',
};
export const tableLabels: Record<TableStatus, string> = {
  FREE: 'Livre',
  OCCUPIED: 'Ocupada',
  IN_PRODUCTION: 'Em Produção',
  READY_FOR_PAYMENT: 'Pronta p/ Pagamento',
  CLOSED: 'Fechada',
};
export function tableClass(status: TableStatus) {
  return tableStyles[status];
}

export const orderStatusLabels: Record<OrderStatus, string> = {
  PENDING: 'Aguardando aceite',
  OPEN: 'Aberto',
  IN_PRODUCTION: 'Em Produção',
  READY_FOR_PAYMENT: 'Pronto p/ Pagamento',
  PAID: 'Pago',
  CANCELLED: 'Cancelado',
};

export const orderTypeLabels: Record<OrderType, string> = {
  DINE_IN: 'Salão',
  DELIVERY: 'Entrega',
  PICKUP: 'Retirada',
};
const orderTypeStyles: Record<OrderType, string> = {
  DINE_IN: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  DELIVERY: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  PICKUP: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
};
export function OrderTypeBadge({ type }: { type: OrderType }) {
  return (
    <span className={clsx('rounded-full px-2.5 py-0.5 text-xs font-medium', orderTypeStyles[type])}>
      {orderTypeLabels[type]}
    </span>
  );
}

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  PIX: 'PIX',
  CASH: 'Dinheiro',
  CREDIT: 'Crédito',
  DEBIT: 'Débito',
  MEAL_VOUCHER: 'Vale Alim.',
};
