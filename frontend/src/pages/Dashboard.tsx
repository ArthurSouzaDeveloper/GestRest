import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { brl } from '../lib/format';
import { Card, PageHeader, Spinner } from '../components/ui';
import { useRealtime } from '../hooks/useRealtime';
import { OnlineOrdersCard } from '../components/OnlineOrdersPauseControl';
import type { DashboardSummary } from '../types';

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <Card>
      <div className="text-sm text-gray-900 dark:text-gray-100">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${accent ?? ''}`}>{value}</div>
    </Card>
  );
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-40 truncate text-gray-900 dark:text-gray-300">{label}</span>
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
      <PageHeader title="Dashboard" />

      <OnlineOrdersCard />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Faturamento hoje" value={brl(data.revenue.daily)} accent="text-green-600" />
        <Stat label="Mesas ocupadas" value={`${data.tables.occupied} de ${data.tables.free + data.tables.occupied}`} accent="text-brand" />
        <Stat label="Itens na cozinha" value={data.orders.waitingItems + data.orders.producingItems} accent="text-yellow-600" />
        <Stat label="Finalizados hoje" value={data.orders.finishedToday} />
      </div>

      <p className="mt-3 text-sm text-gray-900 dark:text-gray-100">
        Semana {brl(data.revenue.weekly)} · Mês {brl(data.revenue.monthly)} · Tempo médio {data.avgPrepMin} min
        {data.orders.cancelledToday > 0 && <> · Cancelados hoje {data.orders.cancelledToday}</>}
      </p>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 font-medium">Produtos mais vendidos</h3>
          <div className="space-y-2">
            {data.topProducts.length === 0 && <p className="text-sm text-gray-900 dark:text-gray-100">Sem dados ainda.</p>}
            {data.topProducts.map((p) => (
              <Bar key={p.name} label={p.name} value={p.quantity} max={maxProduct} />
            ))}
          </div>
        </Card>
        <Card>
          <h3 className="mb-3 font-medium">Garçons com mais vendas</h3>
          <div className="space-y-2">
            {data.topWaiters.length === 0 && <p className="text-sm text-gray-900 dark:text-gray-100">Sem dados ainda.</p>}
            {data.topWaiters.map((w) => (
              <Bar key={w.name} label={w.name} value={w.orders} max={maxWaiter} />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
