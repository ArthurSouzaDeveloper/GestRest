import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { brl } from '../lib/format';
import { Card, PageHeader, Spinner } from '../components/ui';
import { useRealtime } from '../hooks/useRealtime';
import type { DashboardSummary } from '../types';

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <Card>
      <div className="text-sm text-gray-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${accent ?? ''}`}>{value}</div>
    </Card>
  );
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-40 truncate text-gray-600 dark:text-gray-300">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded bg-gray-100 dark:bg-gray-800">
        <div className="h-full rounded bg-brand" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right font-medium">{value}</span>
    </div>
  );
}

export default function Dashboard() {
  useRealtime(['dashboard'], [['dashboard']]);
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.get<DashboardSummary>('/dashboard')).data,
    refetchInterval: 15000,
  });

  if (isLoading || !data) return <Spinner />;

  const maxProduct = Math.max(1, ...data.topProducts.map((p) => p.quantity));
  const maxWaiter = Math.max(1, ...data.topWaiters.map((w) => w.orders));

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Visão geral da operação em tempo real" />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Mesas Livres" value={data.tables.free} accent="text-gray-600" />
        <Stat label="Mesas Ocupadas" value={data.tables.occupied} accent="text-brand" />
        <Stat label="Em Produção" value={data.tables.inProduction} accent="text-yellow-600" />
        <Stat label="Prontas p/ Pagamento" value={data.tables.readyForPayment} accent="text-green-600" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Itens Aguardando" value={data.orders.waitingItems} />
        <Stat label="Itens Preparando" value={data.orders.producingItems} />
        <Stat label="Finalizados Hoje" value={data.orders.finishedToday} accent="text-green-600" />
        <Stat label="Cancelados Hoje" value={data.orders.cancelledToday} accent="text-red-600" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Stat label="Faturamento Diário" value={brl(data.revenue.daily)} accent="text-green-600" />
        <Stat label="Faturamento Semanal" value={brl(data.revenue.weekly)} />
        <Stat label="Faturamento Mensal" value={brl(data.revenue.monthly)} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 font-medium">Produtos mais vendidos</h3>
          <div className="space-y-2">
            {data.topProducts.length === 0 && <p className="text-sm text-gray-400">Sem dados ainda.</p>}
            {data.topProducts.map((p) => (
              <Bar key={p.name} label={p.name} value={p.quantity} max={maxProduct} />
            ))}
          </div>
        </Card>
        <Card>
          <h3 className="mb-3 font-medium">Garçons com mais vendas</h3>
          <div className="space-y-2">
            {data.topWaiters.length === 0 && <p className="text-sm text-gray-400">Sem dados ainda.</p>}
            {data.topWaiters.map((w) => (
              <Bar key={w.name} label={w.name} value={w.orders} max={maxWaiter} />
            ))}
          </div>
          <div className="mt-4 border-t border-gray-100 pt-3 text-sm text-gray-500 dark:border-gray-800">
            Tempo médio de produção: <span className="font-medium text-gray-800 dark:text-gray-200">{data.avgPrepMin} min</span>
          </div>
        </Card>
      </div>
    </div>
  );
}
