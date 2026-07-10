import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { brl } from '../lib/format';
import { Card, PageHeader, Spinner } from '../components/ui';
import type { DashboardSummary } from '../types';

/** Consolidated reports view. Export buttons are stubbed for the CSV/PDF/Excel roadmap. */
export default function Reports() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.get<DashboardSummary>('/dashboard')).data,
  });

  if (isLoading || !data) return <Spinner />;

  const exportCsv = () => {
    const rows = [['Produto', 'Quantidade'], ...data.topProducts.map((p) => [p.name, String(p.quantity)])];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'relatorio-produtos.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader
        title="Relatórios"
        subtitle="Análise de vendas e desempenho"
        action={<button className="btn-secondary" onClick={exportCsv}>Exportar CSV</button>}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card><div className="text-sm text-gray-500">Faturamento Diário</div><div className="mt-1 text-2xl font-semibold text-green-600">{brl(data.revenue.daily)}</div></Card>
        <Card><div className="text-sm text-gray-500">Faturamento Semanal</div><div className="mt-1 text-2xl font-semibold">{brl(data.revenue.weekly)}</div></Card>
        <Card><div className="text-sm text-gray-500">Faturamento Mensal</div><div className="mt-1 text-2xl font-semibold">{brl(data.revenue.monthly)}</div></Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 font-medium">Produtos mais vendidos</h3>
          <table className="w-full text-sm">
            <tbody>
              {data.topProducts.map((p) => (
                <tr key={p.name} className="border-b border-gray-50 dark:border-gray-800">
                  <td className="py-2">{p.name}</td>
                  <td className="py-2 text-right font-medium">{p.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card>
          <h3 className="mb-3 font-medium">Garçons — pedidos fechados</h3>
          <table className="w-full text-sm">
            <tbody>
              {data.topWaiters.map((w) => (
                <tr key={w.name} className="border-b border-gray-50 dark:border-gray-800">
                  <td className="py-2">{w.name}</td>
                  <td className="py-2 text-right font-medium">{w.orders}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
