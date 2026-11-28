import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Star, Trash2 } from 'lucide-react';
import api, { apiError } from '../lib/api';
import { brl } from '../lib/format';
import { Card, Modal, PageHeader, Spinner } from '../components/ui';
import { IngredientsPanel } from '../components/IngredientsPanel';
import { ProductIngredientsField, type ProductIngredient } from '../components/ProductIngredientsField';
import type { Additional, Category, Ingredient, Product } from '../types';

export default function Products() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  // Sabor/adicional em edição: 'new' = cadastro novo.
  const [editingAdditional, setEditingAdditional] = useState<Additional | 'new' | null>(null);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products', 'admin'],
    queryFn: async () => (await api.get<Product[]>('/catalog/products')).data,
  });
  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api.get<Category[]>('/catalog/categories')).data,
  });

  // Sabores ("base" do Monte o Seu, ex.: Pernil) e adicionais ficam numa tabela separada
  // dos produtos — sem esta lista eles nunca apareciam aqui e não dava pra marcar esgotado.
  const { data: additionals = [] } = useQuery({
    queryKey: ['additionals', 'admin'],
    queryFn: async () => (await api.get<Additional[]>('/catalog/additionals')).data,
  });

  const toggleAdditional = useMutation({
    mutationFn: async (a: Additional) => api.patch(`/catalog/additionals/${a.id}`, { active: !a.active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['additionals'] }),
    onError: (e) => alert(apiError(e)),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['products'] });
    qc.invalidateQueries({ queryKey: ['products', 'admin'] });
    qc.invalidateQueries({ queryKey: ['ingredients'] });
  };

  // Atalho da lista: liga/desliga o destaque sem abrir o cadastro do produto.
  const toggleFeatured = useMutation({
    mutationFn: async (p: Product) => api.patch(`/catalog/products/${p.id}`, { featured: !p.featured }),
    onSuccess: refresh,
    onError: (e) => alert(apiError(e)),
  });

  const toggleAvailable = useMutation({
    mutationFn: async (p: Product) => api.patch(`/catalog/products/${p.id}`, { available: !p.available }),
    onSuccess: refresh,
    onError: (e) => alert(apiError(e)),
  });

  if (isLoading) return <Spinner />;

  const term = search.toLowerCase();
  const filtered = products.filter((p) => p.name.toLowerCase().includes(term));
  const categoryName = (id?: string) => categories.find((c) => c.id === id)?.name ?? 'Todas as categorias';
  const filteredAdditionals = additionals
    .filter((a) => a.name.toLowerCase().includes(term) || categoryName(a.categoryId).toLowerCase().includes(term))
    .sort(
      (a, b) =>
        categoryName(a.categoryId).localeCompare(categoryName(b.categoryId), 'pt-BR') ||
        (a.kind === b.kind ? 0 : a.kind === 'BASE' ? -1 : 1) ||
        a.name.localeCompare(b.name, 'pt-BR'),
    );

  return (
    <div>
      <PageHeader
        title="Produtos"
        action={<button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> Novo Produto</button>}
      />

      <IngredientsPanel products={products} additionals={additionals} categories={categories} />

      <input className="input mb-4 max-w-xs" placeholder="Pesquisar..." value={search} onChange={(e) => setSearch(e.target.value)} />

      <Card className="!p-0">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-gray-100 text-left text-xs uppercase text-gray-900 dark:text-gray-100 dark:border-gray-800">
            <tr>
              <th className="p-3">Nome</th>
              <th className="p-3">Categoria</th>
              <th className="p-3 text-right">Preço</th>
              <th className="p-3 text-center">Preparo</th>
              <th className="p-3 text-center">Disponível</th>
              <th className="p-3 text-center">Novidade</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-b border-gray-50 dark:border-gray-800">
                <td className="p-3 font-medium">{p.name}</td>
                <td className="p-3 text-gray-900 dark:text-gray-100">{p.category?.name}</td>
                <td className="p-3 text-right">{brl(p.price)}</td>
                <td className="p-3 text-center text-gray-900 dark:text-gray-100">{p.avgPrepMin} min</td>
                <td className="p-3 text-center">
                  <button
                    className={`rounded-full px-2 py-0.5 text-xs font-medium transition ${
                      p.available
                        ? 'bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-700'
                        : 'bg-gray-200 text-gray-900 dark:text-gray-100 hover:bg-green-100 hover:text-green-700'
                    }`}
                    disabled={toggleAvailable.isPending}
                    title={p.available ? 'Marcar como esgotado' : 'Marcar como disponível'}
                    onClick={() => toggleAvailable.mutate(p)}
                  >
                    {p.available ? 'Disponível' : 'Esgotado'}
                  </button>
                  <SoldOutBadge names={p.soldOutIngredients} />
                  {!!p.missingIngredients?.length && (
                    <span className="mt-1 block text-xs font-medium text-amber-600" title="Continua à venda, a cozinha recebe SEM ...">
                      Vende sem {p.missingIngredients.join(', ').toLowerCase()}
                    </span>
                  )}
                </td>
                <td className="p-3 text-center">
                  <button
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition ${
                      p.featured
                        ? 'bg-amber-100 text-amber-700 hover:bg-gray-200 hover:text-gray-900'
                        : 'bg-gray-100 text-gray-900 dark:text-gray-100 dark:bg-gray-800 hover:bg-amber-100 hover:text-amber-700'
                    }`}
                    disabled={toggleFeatured.isPending}
                    title={
                      p.featured
                        ? 'Tirar a novidade (volta pra ordem normal da categoria)'
                        : 'Marcar como novidade: aparece em primeiro na categoria dele até você tirar'
                    }
                    onClick={() => toggleFeatured.mutate(p)}
                  >
                    <Star size={12} className={p.featured ? 'fill-amber-500 text-amber-500' : ''} />
                    {p.featured ? 'Novidade' : 'Marcar'}
                  </button>
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

      <div className="mb-3 mt-8 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Sabores e adicionais</h2>
        <button className="btn-secondary !py-1 text-sm" onClick={() => setEditingAdditional('new')}>
          <Plus size={14} /> Novo adicional
        </button>
      </div>
      <Card className="!p-0">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-gray-100 text-left text-xs uppercase text-gray-900 dark:text-gray-100 dark:border-gray-800">
            <tr>
              <th className="p-3">Nome</th>
              <th className="p-3">Categoria</th>
              <th className="p-3">Tipo</th>
              <th className="p-3 text-right">Preço</th>
              <th className="p-3 text-center">Disponível</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {filteredAdditionals.map((a) => (
              <tr key={a.id} className="border-b border-gray-50 dark:border-gray-800">
                <td className="p-3 font-medium">{a.name}</td>
                <td className="p-3 text-gray-900 dark:text-gray-100">{categoryName(a.categoryId)}</td>
                <td className="p-3 text-gray-900 dark:text-gray-100">{a.kind === 'BASE' ? 'Sabor' : 'Adicional'}</td>
                <td className="p-3 text-right">{brl(a.price)}</td>
                <td className="p-3 text-center">
                  <button
                    className={`rounded-full px-2 py-0.5 text-xs font-medium transition ${
                      a.active
                        ? 'bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-700'
                        : 'bg-gray-200 text-gray-900 dark:text-gray-100 hover:bg-green-100 hover:text-green-700'
                    }`}
                    disabled={toggleAdditional.isPending}
                    title={a.active ? 'Marcar como esgotado' : 'Marcar como disponível'}
                    onClick={() => toggleAdditional.mutate(a)}
                  >
                    {a.active ? 'Disponível' : 'Esgotado'}
                  </button>
                  <SoldOutBadge names={a.soldOutIngredients} />
                </td>
                <td className="p-3 text-right">
                  <button className="btn-secondary !px-2 !py-1" title="Editar" onClick={() => setEditingAdditional(a)}><Pencil size={14} /></button>
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

      {editingAdditional && (
        <AdditionalForm
          additional={editingAdditional === 'new' ? null : editingAdditional}
          categories={categories}
          onClose={() => setEditingAdditional(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['additionals'] });
            qc.invalidateQueries({ queryKey: ['ingredients'] });
            setEditingAdditional(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * Excluir: o que nunca foi vendido é apagado; o que já saiu em pedido é arquivado (some
 * do painel e do cardápio, mas fica no histórico). O backend decide e devolve `archived`.
 */
function DeleteButton({ label, url, onDone, onError }: { label: string; url: string; onDone: () => void; onError: (msg: string) => void }) {
  const remove = useMutation({
    mutationFn: async () => (await api.delete<{ archived?: boolean }>(url)).data,
    onSuccess: onDone,
    onError: (e) => onError(apiError(e)),
  });
  return (
    <button
      className="btn-secondary text-red-600"
      disabled={remove.isPending}
      onClick={() => {
        if (confirm(`Excluir ${label}? Sai do painel e do cardápio. Pedidos antigos continuam com ele no histórico.`)) remove.mutate();
      }}
    >
      <Trash2 size={14} /> Excluir
    </button>
  );
}

function AdditionalForm({
  additional,
  categories,
  onClose,
  onSaved,
}: {
  additional: Additional | null;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: additional?.name ?? '',
    price: additional?.price ?? 0,
    categoryId: additional?.categoryId ?? categories[0]?.id ?? '',
    kind: additional?.kind ?? 'ADDON',
    active: additional?.active ?? true,
  });
  const [error, setError] = useState('');

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        price: Number(form.price),
        kind: form.kind,
        active: form.active,
        ...(form.categoryId ? { categoryId: form.categoryId } : {}),
      };
      if (additional) return api.patch(`/catalog/additionals/${additional.id}`, payload);
      return api.post('/catalog/additionals', payload);
    },
    onSuccess: onSaved,
    onError: (e) => setError(apiError(e)),
  });

  return (
    <Modal open onClose={onClose} title={additional ? 'Editar adicional' : 'Novo adicional'}>
      <div className="space-y-3">
        <div>
          <label className="label">Nome</label>
          <input className="input" placeholder="Ex.: Bombom Ouro Branco" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Preço (R$)</label>
            <input className="input" type="number" step="0.01" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
          </div>
          <div>
            <label className="label">Tipo</label>
            <select className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as 'ADDON' | 'BASE' })}>
              <option value="ADDON">Adicional</option>
              <option value="BASE">Sabor</option>
            </select>
          </div>
        </div>
        <div>
          <label className="label">Aparece em</label>
          <select className="input" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
            {!additional?.categoryId && additional && <option value="">Todas as categorias</option>}
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
          Disponível
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex items-center justify-between gap-2 pt-2">
          {additional ? (
            <DeleteButton label={additional.name} url={`/catalog/additionals/${additional.id}`} onDone={onSaved} onError={setError} />
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button className="btn-primary" disabled={save.isPending || !form.name.trim()} onClick={() => save.mutate()}>Salvar</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** Fora do cardápio porque um insumo acabou, mesmo marcado como disponível. */
function SoldOutBadge({ names }: { names?: string[] }) {
  if (!names?.length) return null;
  return (
    <span className="mt-1 block text-xs font-medium text-red-600" title="Volta sozinho quando o insumo for marcado em estoque">
      Sem {names.join(', ')}
    </span>
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
    isCustom: product?.isCustom ?? false,
    featured: product?.featured ?? false,
  });
  const [error, setError] = useState('');

  // Ingredientes: vêm dos insumos já ligados a este produto. `null` = o admin não mexeu,
  // então não mandamos nada (não apaga vínculo por engano).
  const { data: allIngredients = [], isSuccess: ingredientsLoaded } = useQuery({
    queryKey: ['ingredients'],
    queryFn: async () => (await api.get<Ingredient[]>('/catalog/ingredients')).data,
  });
  const [edited, setEdited] = useState<ProductIngredient[] | null>(null);
  const ingredients: ProductIngredient[] =
    edited ??
    (product
      ? allIngredients
          .filter((i) => i.productIds.includes(product.id) || i.optionalProductIds.includes(product.id))
          .map((i) => ({ name: i.name, optional: i.optionalProductIds.includes(product.id) }))
      : []);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        price: Number(form.price),
        avgPrepMin: Number(form.avgPrepMin),
        ...(edited && !form.isCustom ? { ingredients: edited } : {}),
      };
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
        {!form.isCustom && (
          <div className={ingredientsLoaded ? '' : 'pointer-events-none opacity-60'}>
            <ProductIngredientsField
              value={ingredients}
              onChange={setEdited}
              description={form.description}
              knownNames={allIngredients.map((i) => i.name)}
            />
          </div>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.available} onChange={(e) => setForm({ ...form, available: e.target.checked })} />
          Disponível
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={form.featured}
            onChange={(e) => setForm({ ...form, featured: e.target.checked })}
          />
          <span>
            Novidade no cardápio
            <span className="block text-xs text-gray-900 dark:text-gray-100">
              Aparece em primeiro na categoria dele, com o selo "Novidade". Fica assim até você desmarcar.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={form.isCustom}
            onChange={(e) => setForm({ ...form, isCustom: e.target.checked })}
          />
          <span>
            Produto montável (cliente escolhe a base)
          </span>
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex items-center justify-between gap-2 pt-2">
          {product ? (
            <DeleteButton label={product.name} url={`/catalog/products/${product.id}`} onDone={onSaved} onError={setError} />
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>Salvar</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
