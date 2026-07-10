import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil } from 'lucide-react';
import api, { apiError } from '../lib/api';
import { brl } from '../lib/format';
import { Card, Modal, PageHeader, Spinner } from '../components/ui';
import type { Category, Product } from '../types';

export default function Products() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products', 'admin'],
    queryFn: async () => (await api.get<Product[]>('/catalog/products')).data,
  });
  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api.get<Category[]>('/catalog/categories')).data,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['products'] });
    qc.invalidateQueries({ queryKey: ['products', 'admin'] });
  };

  if (isLoading) return <Spinner />;

  const filtered = products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <PageHeader
        title="Produtos"
        subtitle="Catálogo do restaurante"
        action={<button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> Novo Produto</button>}
      />

      <input className="input mb-4 max-w-xs" placeholder="Pesquisar..." value={search} onChange={(e) => setSearch(e.target.value)} />

      <Card className="!p-0">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-gray-100 text-left text-xs uppercase text-gray-400 dark:border-gray-800">
            <tr>
              <th className="p-3">Nome</th>
              <th className="p-3">Categoria</th>
              <th className="p-3 text-right">Preço</th>
              <th className="p-3 text-center">Preparo</th>
              <th className="p-3 text-center">Disponível</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-b border-gray-50 dark:border-gray-800">
                <td className="p-3 font-medium">{p.name}</td>
                <td className="p-3 text-gray-500">{p.category?.name}</td>
                <td className="p-3 text-right">{brl(p.price)}</td>
                <td className="p-3 text-center text-gray-500">{p.avgPrepMin} min</td>
                <td className="p-3 text-center">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${p.available ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {p.available ? 'Sim' : 'Não'}
                  </span>
                </td>
                <td className="p-3 text-right">
                  <button className="btn-secondary !px-2 !py-1" onClick={() => setEditing(p)}><Pencil size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Card>

      {(creating || editing) && (
        <ProductForm
          product={editing}
          categories={categories}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { refresh(); setCreating(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

function ProductForm({
  product,
  categories,
  onClose,
  onSaved,
}: {
  product: Product | null;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: product?.name ?? '',
    price: product?.price ?? 0,
    categoryId: product?.categoryId ?? categories[0]?.id ?? '',
    avgPrepMin: product?.avgPrepMin ?? 10,
    description: product?.description ?? '',
    available: product?.available ?? true,
  });
  const [error, setError] = useState('');

  const save = useMutation({
    mutationFn: async () => {
      const payload = { ...form, price: Number(form.price), avgPrepMin: Number(form.avgPrepMin) };
      if (product) return api.patch(`/catalog/products/${product.id}`, payload);
      return api.post('/catalog/products', payload);
    },
    onSuccess: onSaved,
    onError: (e) => setError(apiError(e)),
  });

  return (
    <Modal open onClose={onClose} title={product ? 'Editar Produto' : 'Novo Produto'}>
      <div className="space-y-3">
        <div>
          <label className="label">Nome</label>
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Preço (R$)</label>
            <input className="input" type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
          </div>
          <div>
            <label className="label">Preparo (min)</label>
            <input className="input" type="number" value={form.avgPrepMin} onChange={(e) => setForm({ ...form, avgPrepMin: Number(e.target.value) })} />
          </div>
        </div>
        <div>
          <label className="label">Categoria</label>
          <select className="input" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Descrição</label>
          <textarea className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.available} onChange={(e) => setForm({ ...form, available: e.target.checked })} />
          Disponível
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>Salvar</button>
        </div>
      </div>
    </Modal>
  );
}
