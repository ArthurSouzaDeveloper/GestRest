import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Power, RotateCcw, Trash2 } from 'lucide-react';
import api, { apiError } from '../lib/api';
import { Card, Modal, PageHeader, Spinner } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import type { Role, User } from '../types';

const ROLES: Role[] = ['ADMIN', 'MANAGER', 'WAITER', 'JUICER', 'COOK', 'CASHIER', 'MOTOBOY'];
const ROLE_LABELS: Record<Role, string> = {
  SUPERADMIN: 'Super Admin',
  ADMIN: 'Administrador',
  MANAGER: 'Gerente',
  WAITER: 'Garçom',
  JUICER: 'Suqueiro',
  COOK: 'Cozinheiro',
  CASHIER: 'Caixa',
  MOTOBOY: 'Motoboy',
};

type DeletedUser = User & { deletedAt: string };

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function Users() {
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [notice, setNotice] = useState('');

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get<User[]>('/users')).data,
  });

  const { data: deleted = [] } = useQuery({
    queryKey: ['users', 'deleted'],
    queryFn: async () => (await api.get<DeletedUser[]>('/users/deleted')).data,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['users'] });
    qc.invalidateQueries({ queryKey: ['users', 'deleted'] });
  };

  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/users/${id}`)).data,
    onSuccess: (_data, id) => {
      refresh();
      const u = users.find((x) => x.id === id);
      setNotice(
        `${u?.name ?? 'Usuário'} saiu da equipe e perdeu o acesso ao sistema. O cadastro ficou guardado em "Usuários excluídos" e pode ser reativado quando você quiser.`,
      );
    },
    onError: (e) => alert(apiError(e)),
  });

  const restore = useMutation({
    mutationFn: async (id: string) => (await api.post(`/users/${id}/restore`)).data,
    onSuccess: (_data, id) => {
      refresh();
      const u = deleted.find((x) => x.id === id);
      setNotice(`${u?.name ?? 'Usuário'} voltou para a equipe e já pode entrar no sistema.`);
    },
    onError: (e) => alert(apiError(e)),
  });

  const toggleActive = useMutation({
    mutationFn: async (u: User) => (await api.patch(`/users/${u.id}`, { active: !u.active })).data,
    onSuccess: (_data, u) => {
      refresh();
      setNotice(
        u.active
          ? `${u.name} foi desativado: continua na equipe, mas não consegue entrar no sistema até ser ativado de novo.`
          : `${u.name} foi ativado e já pode entrar no sistema.`,
      );
    },
    onError: (e) => alert(apiError(e)),
  });

  const handleRemove = (u: User) => {
    if (
      window.confirm(
        `Excluir ${u.name} da equipe?\n\nEle perde o acesso na hora, mas o cadastro fica guardado em "Usuários excluídos" e você pode reativá-lo depois.`,
      )
    ) {
      remove.mutate(u.id);
    }
  };

  const handleToggle = (u: User) => {
    const question = u.active
      ? `Desativar ${u.name}? Ele deixa de entrar no sistema, mas continua na lista da equipe.`
      : `Ativar ${u.name} de novo?`;
    if (window.confirm(question)) toggleActive.mutate(u);
  };

  // Só um admin mexe em outro admin (mesma regra do servidor); esconder o botão evita
  // o gerente clicar e tomar erro.
  const canManage = (u: User) => u.role !== 'ADMIN' || me?.role === 'ADMIN';

  if (isLoading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Usuários"
        action={<button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> Novo Usuário</button>}
      />
      {notice && (
        <div className="mb-4 rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800 dark:border-yellow-900 dark:bg-yellow-900/20 dark:text-yellow-200">
          {notice}
        </div>
      )}
      <Card className="!p-0">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead className="border-b border-gray-100 text-left text-xs uppercase text-gray-900 dark:text-gray-100 dark:border-gray-800">
            <tr>
              <th className="p-3">Nome</th>
              <th className="p-3">E-mail</th>
              <th className="p-3">Perfil</th>
              <th className="p-3 text-center">Ativo</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-gray-50 dark:border-gray-800">
                <td className="p-3 font-medium">{u.name}</td>
                <td className="p-3 text-gray-900 dark:text-gray-100">{u.email}</td>
                <td className="p-3">{ROLE_LABELS[u.role]}</td>
                <td className="p-3 text-center">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      u.active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-900 dark:text-gray-100'
                    }`}
                  >
                    {u.active ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="p-3">
                  <div className="flex items-center justify-end gap-3">
                    {canManage(u) && (
                      <button
                        className="text-gray-900 dark:text-gray-100 hover:text-brand"
                        title="Editar"
                        onClick={() => setEditing(u)}
                      >
                        <Pencil size={16} />
                      </button>
                    )}
                    {u.id !== me?.id && canManage(u) && (
                      <>
                        <button
                          className="text-gray-900 dark:text-gray-100 hover:text-brand"
                          title={u.active ? 'Desativar' : 'Ativar'}
                          onClick={() => handleToggle(u)}
                        >
                          <Power size={16} />
                        </button>
                        <button
                          className="text-gray-900 dark:text-gray-100 hover:text-red-600"
                          title="Excluir da equipe"
                          onClick={() => handleRemove(u)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Card>

      <h2 className="mb-3 mt-8 text-lg font-semibold">Usuários excluídos</h2>
      <Card className={deleted.length > 0 ? '!p-0' : undefined}>
        {deleted.length === 0 ? (
          <p className="text-sm text-gray-900 dark:text-gray-100">
            Nenhum usuário excluído. Quem você excluir da equipe aparece aqui e pode voltar a qualquer momento.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="border-b border-gray-100 text-left text-xs uppercase text-gray-900 dark:text-gray-100 dark:border-gray-800">
                <tr>
                  <th className="p-3">Nome</th>
                  <th className="p-3">E-mail</th>
                  <th className="p-3">Perfil</th>
                  <th className="p-3">Excluído em</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {deleted.map((u) => (
                  <tr key={u.id} className="border-b border-gray-50 dark:border-gray-800">
                    <td className="p-3 font-medium">{u.name}</td>
                    <td className="p-3 text-gray-900 dark:text-gray-100">{u.email}</td>
                    <td className="p-3">{ROLE_LABELS[u.role]}</td>
                    <td className="p-3">{formatDate(u.deletedAt)}</td>
                    <td className="p-3 text-right">
                      {canManage(u) && (
                        <button
                          className="btn-secondary"
                          disabled={restore.isPending}
                          onClick={() => restore.mutate(u.id)}
                        >
                          <RotateCcw size={14} /> Reativar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {creating && (
        <UserForm
          onClose={() => setCreating(false)}
          onSaved={() => { refresh(); setCreating(false); }}
        />
      )}
      {editing && (
        <EditUserForm
          user={editing}
          canChangeRole={editing.id !== me?.id}
          onClose={() => setEditing(null)}
          onSaved={() => { refresh(); setEditing(null); }}
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

function EditUserForm({
  user,
  canChangeRole,
  onClose,
  onSaved,
}: {
  user: User;
  canChangeRole: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState<Role>(user.role);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const save = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {};
      if (name !== user.name) body.name = name;
      if (canChangeRole && role !== user.role) body.role = role;
      if (password) body.password = password;
      return api.patch(`/users/${user.id}`, body);
    },
    onSuccess: onSaved,
    onError: (e) => setError(apiError(e)),
  });

  return (
    <Modal open onClose={onClose} title={`Editar ${user.name}`}>
      <div className="space-y-3">
        <div><label className="label">Nome</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div>
          <label className="label">E-mail</label>
          <input className="input" value={user.email} disabled />
          <p className="mt-1 text-xs text-gray-900 dark:text-gray-100">O e-mail de acesso não pode ser trocado.</p>
        </div>
        <div>
          <label className="label">Perfil</label>
          <select
            className="input"
            value={role}
            disabled={!canChangeRole}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
          {!canChangeRole && (
            <p className="mt-1 text-xs text-gray-900 dark:text-gray-100">Você não pode mudar o seu próprio perfil.</p>
          )}
        </div>
        <div>
          <label className="label">Nova senha</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <p className="mt-1 text-xs text-gray-900 dark:text-gray-100">Deixe em branco para manter a senha atual.</p>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>Salvar</button>
        </div>
      </div>
    </Modal>
  );
}
