import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, ExternalLink, LogOut, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import api, { apiError } from '../lib/api';
import { Card, Modal, Spinner } from '../components/ui';
import type { RestaurantSummary } from '../types';

export default function SuperAdmin() {
  const { user, login, logout } = useAuth();

  if (user && user.role === 'SUPERADMIN') return <Console onLogout={logout} name={user.name} />;
  if (user) {
    // Logado, mas não é superadmin.
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-gray-600">Esta área é exclusiva do super administrador.</p>
        <a href="/" className="btn-primary">Ir para o sistema</a>
      </div>
    );
  }
  return <SuperLogin login={login} />;
}

function SuperLogin({ login }: { login: (e: string, p: string) => Promise<void> }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-900 p-4">
      <div className="card w-full max-w-sm p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gray-800 text-lg font-bold text-white">
            GR
          </div>
          <h1 className="text-xl font-semibold">Painel da Plataforma</h1>
          <p className="text-sm text-gray-500">Super administrador · GestRest</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">E-mail</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
          </div>
          <div>
            <label className="label">Senha</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className="btn-primary w-full" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}

function Console({ onLogout, name }: { onLogout: () => void; name: string }) {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);

  const { data: restaurants = [], isLoading } = useQuery({
    queryKey: ['restaurants'],
    queryFn: async () => (await api.get<RestaurantSummary[]>('/superadmin/restaurants')).data,
  });

  const toggle = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) =>
      api.patch(`/superadmin/restaurants/${id}`, { active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['restaurants'] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/superadmin/restaurants/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['restaurants'] }),
    onError: (e) => alert(apiError(e)),
  });

  const handleRemove = (r: RestaurantSummary) => {
    const confirmMsg = `Excluir "${r.name}" definitivamente? Isso apaga o cardápio, ${r.counts.users} usuário(s), ${r.counts.orders} pedido(s) e todo o histórico. Essa ação não pode ser desfeita.`;
    if (window.confirm(confirmMsg)) remove.mutate(r.id);
  };

  const origin = window.location.origin;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-5 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gray-800 text-sm font-bold text-white">GR</div>
          <span className="font-semibold">GestRest · Plataforma</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{name}</span>
          <button className="btn-secondary" onClick={onLogout} title="Sair"><LogOut size={16} /></button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl p-6">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Restaurantes</h1>
            <p className="mt-1 text-sm text-gray-500">Cada restaurante tem seu próprio link, equipe e cardápio.</p>
          </div>
          <button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> Novo Restaurante</button>
        </div>

        {isLoading ? (
          <Spinner />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {restaurants.map((r) => (
              <Card key={r.id}>
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <h3 className="font-semibold">{r.name}</h3>
                    <a
                      href={`${origin}/r/${r.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-0.5 inline-flex items-center gap-1 text-sm text-brand hover:underline"
                    >
                      /r/{r.slug} <ExternalLink size={12} />
                    </a>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}
                  >
                    {r.active ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                <div className="mt-3 flex gap-4 text-xs text-gray-500">
                  <span>{r.counts.users} usuários</span>
                  <span>{r.counts.products} produtos</span>
                  <span>{r.counts.orders} pedidos</span>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    className="btn-secondary flex-1 !py-1.5 text-xs"
                    onClick={() => toggle.mutate({ id: r.id, active: !r.active })}
                  >
                    {r.active ? 'Desativar' : 'Ativar'}
                  </button>
                  <button
                    className="btn-secondary !py-1.5 !px-2.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                    title="Excluir restaurante"
                    onClick={() => handleRemove(r)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>

      {creating && (
        <CreateRestaurant
          origin={origin}
          onClose={() => setCreating(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['restaurants'] });
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}

function CreateRestaurant({
  origin,
  onClose,
  onSaved,
}: {
  origin: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: '',
    slug: '',
    adminName: '',
    adminEmail: '',
    adminPassword: '',
    tablesCount: 10,
  });
  const [error, setError] = useState('');
  const [created, setCreated] = useState<{ slug: string } | null>(null);

  const slugPreview = (form.slug || form.name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const save = useMutation({
    mutationFn: async () =>
      (await api.post('/superadmin/restaurants', { ...form, tablesCount: Number(form.tablesCount) })).data,
    onSuccess: (data: { slug: string }) => setCreated(data),
    onError: (e) => setError(apiError(e)),
  });

  if (created) {
    return (
      <Modal open onClose={onSaved} title="Restaurante criado 🎉">
        <div className="space-y-3 text-sm">
          <p>O restaurante foi criado. Compartilhe o link de acesso com a equipe:</p>
          <div className="rounded-md bg-gray-100 p-3 font-mono text-brand dark:bg-gray-800">
            {origin}/r/{created.slug}
          </div>
          <p className="text-gray-500">O administrador já pode entrar com o e-mail e senha que você definiu e montar o cardápio.</p>
          <div className="flex justify-end">
            <button className="btn-primary" onClick={onSaved}>Concluir</button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title="Novo Restaurante">
      <div className="space-y-3">
        <div>
          <label className="label">Nome do restaurante</label>
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="label">Link (slug) — opcional</label>
          <input className="input" placeholder="gerado do nome" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
          {slugPreview && <p className="mt-1 text-xs text-gray-500">{origin}/r/{slugPreview}</p>}
        </div>
        <hr className="border-gray-100 dark:border-gray-800" />
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Administrador do restaurante</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Nome</label>
            <input className="input" value={form.adminName} onChange={(e) => setForm({ ...form, adminName: e.target.value })} />
          </div>
          <div>
            <label className="label">Mesas</label>
            <input className="input" type="number" min={1} value={form.tablesCount} onChange={(e) => setForm({ ...form, tablesCount: Number(e.target.value) })} />
          </div>
        </div>
        <div>
          <label className="label">E-mail</label>
          <input className="input" type="email" value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} />
        </div>
        <div>
          <label className="label">Senha</label>
          <input className="input" type="password" value={form.adminPassword} onChange={(e) => setForm({ ...form, adminPassword: e.target.value })} />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button
            className="btn-primary"
            disabled={save.isPending || !form.name || !form.adminEmail || !form.adminPassword}
            onClick={() => { setError(''); save.mutate(); }}
          >
            {save.isPending ? 'Criando...' : 'Criar Restaurante'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
