import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import api, { apiError } from '../lib/api';
import { Card, Modal, PageHeader, Spinner } from '../components/ui';
import type { Role, User } from '../types';

const ROLES: Role[] = ['ADMIN', 'MANAGER', 'WAITER', 'JUICER', 'COOK', 'CASHIER'];
const ROLE_LABELS: Record<Role, string> = {
  SUPERADMIN: 'Super Admin',
  ADMIN: 'Administrador',
  MANAGER: 'Gerente',
  WAITER: 'Garçom',
  JUICER: 'Suqueiro',
  COOK: 'Cozinheiro',
  CASHIER: 'Caixa',
};

export default function Users() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get<User[]>('/users')).data,
  });

  if (isLoading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Usuários"
        subtitle="Equipe e níveis de acesso"
        action={<button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> Novo Usuário</button>}
      />
      <Card className="!p-0">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="border-b border-gray-100 text-left text-xs uppercase text-gray-400 dark:border-gray-800">
            <tr>
              <th className="p-3">Nome</th>
              <th className="p-3">E-mail</th>
              <th className="p-3">Perfil</th>
              <th className="p-3 text-center">Ativo</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-gray-50 dark:border-gray-800">
                <td className="p-3 font-medium">{u.name}</td>
                <td className="p-3 text-gray-500">{u.email}</td>
                <td className="p-3">{ROLE_LABELS[u.role]}</td>
                <td className="p-3 text-center">{u.active ? '✅' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Card>
      {creating && (
        <UserForm
          onClose={() => setCreating(false)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['users'] }); setCreating(false); }}
        />
      )}
    </div>
  );
}

function UserForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'WAITER' as Role });
  const [error, setError] = useState('');

  const save = useMutation({
    mutationFn: async () => api.post('/users', form),
    onSuccess: onSaved,
    onError: (e) => setError(apiError(e)),
  });

  return (
    <Modal open onClose={onClose} title="Novo Usuário">
      <div className="space-y-3">
        <div><label className="label">Nome</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div><label className="label">E-mail</label><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        <div><label className="label">Senha</label><input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
        <div>
          <label className="label">Perfil</label>
          <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>Criar</button>
        </div>
      </div>
    </Modal>
  );
}
