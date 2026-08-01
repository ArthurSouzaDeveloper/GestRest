import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, ExternalLink, LogOut, Trash2, Check, Palette, Upload } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import api, { apiError } from '../lib/api';
import { Card, Modal, Spinner } from '../components/ui';
import { DEFAULT_BRAND_COLOR } from '../lib/publicBrand';
import type { BrandingSettings, RestaurantSummary } from '../types';

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
  const [editingBranding, setEditingBranding] = useState<RestaurantSummary | null>(null);

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
                    className="btn-secondary !py-1.5 !px-2.5"
                    title="Identidade visual (cor e logo)"
                    onClick={() => setEditingBranding(r)}
                  >
                    <Palette size={14} />
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

      {editingBranding && (
        <EditBranding restaurant={editingBranding} onClose={() => setEditingBranding(null)} />
      )}
    </div>
  );
}

/**
 * Cor e logo do site público de pedidos daquele restaurante — só o superadmin mexe aqui
 * (pedido explícito do cliente: quem administra o restaurante não deve poder trocar
 * sozinho), então mora no console da plataforma, não na tela do restaurante.
 */
function EditBranding({ restaurant, onClose }: { restaurant: RestaurantSummary; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: settings, isLoading } = useQuery({
    queryKey: ['branding', restaurant.id],
    queryFn: async () => (await api.get<BrandingSettings>(`/superadmin/restaurants/${restaurant.id}/branding`)).data,
  });

  const [color, setColor] = useState(DEFAULT_BRAND_COLOR);
  const [colorError, setColorError] = useState('');
  const [logoError, setLogoError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (settings?.brandColor) setColor(settings.brandColor);
  }, [settings?.brandColor]);

  const refresh = () => qc.invalidateQueries({ queryKey: ['branding', restaurant.id] });

  const saveColor = useMutation({
    mutationFn: async () => api.patch(`/superadmin/restaurants/${restaurant.id}/branding`, { brandColor: color }),
    onSuccess: () => {
      setColorError('');
      refresh();
    },
    onError: (e) => setColorError(apiError(e)),
  });

  const uploadLogo = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('logo', file);
      return api.post(`/superadmin/restaurants/${restaurant.id}/branding/logo`, form);
    },
    onSuccess: () => {
      setLogoError('');
      refresh();
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    onError: (e) => setLogoError(apiError(e)),
  });

  return (
    <Modal open onClose={onClose} title={`Identidade Visual — ${restaurant.name}`}>
      {isLoading || !settings ? (
        <Spinner />
      ) : (
        <div className="space-y-5">
          <div>
            <h3 className="mb-2 text-sm font-semibold">Cor da marca</h3>
            <p className="mb-3 text-xs text-gray-500">
              Os tons claros/escuros usados no site (fundo de painel, gradiente de botão) são calculados
              automaticamente a partir dessa cor só.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="color"
                className="h-10 w-12 cursor-pointer rounded-lg border border-gray-200 dark:border-gray-800"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
              <input
                className="input w-28 font-mono uppercase"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="#9D1CC4"
                maxLength={7}
              />
              <button className="btn-primary !py-1.5 text-xs" disabled={saveColor.isPending} onClick={() => saveColor.mutate()}>
                Salvar
              </button>
            </div>
            {colorError && <p className="mt-2 text-xs text-red-600">{colorError}</p>}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold">Logo</h3>
            <p className="mb-3 text-xs text-gray-500">
              Sem logo enviada, o site mostra as iniciais do restaurante num distintivo na cor da marca. PNG,
              JPEG ou WebP, até 3 MB.
            </p>
            <div className="flex items-center gap-3">
              {settings.logoUrl ? (
                <img src={settings.logoUrl} alt="Logo atual" className="h-16 w-16 rounded-full object-cover" />
              ) : (
                <div
                  className="flex h-16 w-16 items-center justify-center rounded-full text-lg font-extrabold text-white"
                  style={{ backgroundColor: color }}
                >
                  {restaurant.name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadLogo.mutate(file);
                  }}
                />
                <button
                  className="btn-secondary !py-1.5 text-xs"
                  disabled={uploadLogo.isPending}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={14} /> {uploadLogo.isPending ? 'Enviando...' : 'Enviar logo'}
                </button>
                {logoError && <p className="mt-2 text-xs text-red-600">{logoError}</p>}
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button className="btn-secondary" onClick={onClose}>Fechar</button>
          </div>
        </div>
      )}
    </Modal>
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
      <Modal open onClose={onSaved} title="Restaurante criado">
        <div className="space-y-3 text-sm">
          <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
            <Check size={18} />
          </div>
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
