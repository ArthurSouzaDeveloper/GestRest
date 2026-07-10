import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { Card, PageHeader, Spinner } from '../components/ui';

interface AuditRow {
  id: string;
  action: string;
  entity?: string;
  entityId?: string;
  ip?: string;
  createdAt: string;
  user?: { name: string; role: string };
}

const ACTION_LABELS: Record<string, string> = {
  ORDER_CREATED: 'Pedido criado',
  ORDER_UPDATED: 'Pedido editado',
  ORDER_CANCELLED: 'Pedido cancelado',
  ITEM_ADDED: 'Item adicionado',
  ITEM_UPDATED: 'Item editado',
  ITEM_REMOVED: 'Item removido',
  STATUS_CHANGED: 'Status alterado',
  PAYMENT_RECEIVED: 'Pagamento recebido',
  TABLE_OPENED: 'Mesa aberta',
  TABLE_CLOSED: 'Mesa fechada',
  LOGIN: 'Login',
  USER_CREATED: 'Usuário criado',
};

export default function Audit() {
  const { data = [], isLoading } = useQuery({
    queryKey: ['audit'],
    queryFn: async () => (await api.get<AuditRow[]>('/audit', { params: { take: 100 } })).data,
    refetchInterval: 15000,
  });

  if (isLoading) return <Spinner />;

  return (
    <div>
      <PageHeader title="Auditoria" subtitle="Registro de todas as ações do sistema" />
      <Card className="!p-0">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-gray-100 text-left text-xs uppercase text-gray-400 dark:border-gray-800">
            <tr>
              <th className="p-3">Data/Hora</th>
              <th className="p-3">Usuário</th>
              <th className="p-3">Ação</th>
              <th className="p-3">Entidade</th>
              <th className="p-3">IP</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.id} className="border-b border-gray-50 dark:border-gray-800">
                <td className="p-3 text-gray-500">{new Date(row.createdAt).toLocaleString('pt-BR')}</td>
                <td className="p-3">{row.user?.name ?? '—'}</td>
                <td className="p-3 font-medium">{ACTION_LABELS[row.action] ?? row.action}</td>
                <td className="p-3 text-gray-500">{row.entity ?? '—'}</td>
                <td className="p-3 text-gray-400">{row.ip ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Card>
    </div>
  );
}
