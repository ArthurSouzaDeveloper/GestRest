import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import api, { apiError } from '../lib/api';
import { Card, Modal } from './ui';
import type { Additional, Category, Ingredient, Product } from '../types';

/** Sem acento e minúsculo, pra "laranja" achar "Laranja" e "LARANJA". */
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Insumos (ex.: Laranja): um insumo liga vários produtos e sabores. "Em falta" tira do
 * cardápio (site, garçom e caixa) tudo que leva o insumo; "Em estoque" devolve, sem
 * reativar o que estava esgotado por conta própria.
 */
export function IngredientsPanel({
  products,
  additionals,
  categories,
}: {
  products: Product[];
  additionals: Additional[];
  categories: Category[];
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Ingredient | 'new' | null>(null);

  const { data: ingredients = [] } = useQuery({
    queryKey: ['ingredients'],
    queryFn: async () => (await api.get<Ingredient[]>('/catalog/ingredients')).data,
  });

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ['ingredients'] });
    qc.invalidateQueries({ queryKey: ['products'] });
    qc.invalidateQueries({ queryKey: ['additionals'] });
  };

  const toggle = useMutation({
    mutationFn: async (i: Ingredient) => api.patch(`/catalog/ingredients/${i.id}`, { inStock: !i.inStock }),
    onSuccess: refreshAll,
    onError: (e) => alert(apiError(e)),
  });

  return (
    <div className="mb-8">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Insumos</h2>
        <button className="btn-secondary !py-1 text-sm" onClick={() => setEditing('new')}>
          <Plus size={14} /> Novo insumo
        </button>
      </div>
      <p className="mb-3 text-sm text-gray-500">
        Acabou um ingrediente (ex.: laranja)? Marque "Em falta" e tudo que leva ele sai do cardápio. Quando chegar, marque
        "Em estoque" e volta tudo, menos o que você já tinha esgotado por conta própria.
      </p>
      {ingredients.length === 0 ? (
        <Card className="text-sm text-gray-500">Nenhum insumo cadastrado ainda.</Card>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ingredients.map((i) => {
            const count = i.productIds.length + i.additionalIds.length;
            return (
              <Card key={i.id} className="flex items-center justify-between gap-3 !p-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{i.name}</p>
                  <p className="text-xs text-gray-500">
                    {count} {count === 1 ? 'item ligado' : 'itens ligados'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                      i.inStock
                        ? 'bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-700'
                        : 'bg-red-100 text-red-700 hover:bg-green-100 hover:text-green-700'
                    }`}
                    disabled={toggle.isPending}
                    title={i.inStock ? 'Marcar como em falta' : 'Marcar como em estoque'}
                    onClick={() => {
                      if (i.inStock && !confirm(`Marcar ${i.name} em falta? ${count} itens saem do cardápio.`)) return;
                      toggle.mutate(i);
                    }}
                  >
                    {i.inStock ? 'Em estoque' : 'Em falta'}
                  </button>
                  <button className="btn-secondary !px-2 !py-1" onClick={() => setEditing(i)} title="Editar">
                    <Pencil size={14} />
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {editing && (
        <IngredientForm
          ingredient={editing === 'new' ? null : editing}
          products={products}
          additionals={additionals}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={() => {
            refreshAll();
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function IngredientForm({
  ingredient,
  products,
  additionals,
  categories,
  onClose,
  onSaved,
}: {
  ingredient: Ingredient | null;
  products: Product[];
  additionals: Additional[];
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(ingredient?.name ?? '');
  const [productIds, setProductIds] = useState<Set<string>>(new Set(ingredient?.productIds ?? []));
  const [additionalIds, setAdditionalIds] = useState<Set<string>>(new Set(ingredient?.additionalIds ?? []));
  const [filter, setFilter] = useState('');
  const [onlyLinked, setOnlyLinked] = useState(false);
  const [error, setError] = useState('');

  const categoryName = (id?: string) => categories.find((c) => c.id === id)?.name ?? 'Todas as categorias';

  // Sugestão: tudo cujo nome tem o nome do insumo (ex.: "Morango (Laranja)", "Suco de
  // Laranja"). O admin desmarca o que não leva de verdade (ex.: "Fanta Laranja Lata").
  const suggest = () => {
    const term = norm(name.trim());
    if (term.length < 2) return;
    setProductIds((prev) => new Set([...prev, ...products.filter((p) => norm(p.name).includes(term)).map((p) => p.id)]));
    setAdditionalIds(
      (prev) => new Set([...prev, ...additionals.filter((a) => norm(a.name).includes(term)).map((a) => a.id)]),
    );
  };

  const term = norm(filter);
  const visibleProducts = products
        .filter((p) => (!onlyLinked || productIds.has(p.id)) && (norm(p.name).includes(term) || norm(p.category?.name ?? '').includes(term)))
        .sort((a, b) => (a.category?.name ?? '').localeCompare(b.category?.name ?? '', 'pt-BR') || a.name.localeCompare(b.name, 'pt-BR'));
  const visibleAdditionals = additionals
        .filter((a) => (!onlyLinked || additionalIds.has(a.id)) && (norm(a.name).includes(term) || norm(categoryName(a.categoryId)).includes(term)))
        .sort((a, b) => categoryName(a.categoryId).localeCompare(categoryName(b.categoryId), 'pt-BR') || a.name.localeCompare(b.name, 'pt-BR'));

  const flip = (set: Set<string>, setter: (s: Set<string>) => void, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload = { name: name.trim(), productIds: [...productIds], additionalIds: [...additionalIds] };
      if (ingredient) return api.patch(`/catalog/ingredients/${ingredient.id}`, payload);
      return api.post('/catalog/ingredients', payload);
    },
    onSuccess: onSaved,
    onError: (e) => setError(apiError(e)),
  });

  const remove = useMutation({
    mutationFn: async () => api.delete(`/catalog/ingredients/${ingredient!.id}`),
    onSuccess: onSaved,
    onError: (e) => setError(apiError(e)),
  });

  const total = productIds.size + additionalIds.size;

  return (
    <Modal open onClose={onClose} title={ingredient ? 'Editar insumo' : 'Novo insumo'} wide>
      <div className="space-y-3">
        <div>
          <label className="label">Nome do insumo</label>
          <div className="flex gap-2">
            <input className="input" placeholder="Ex.: Laranja" value={name} onChange={(e) => setName(e.target.value)} />
            <button className="btn-secondary shrink-0" disabled={name.trim().length < 2} onClick={suggest} title="Marca tudo que tem esse nome">
              Marcar pelo nome
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            "Marcar pelo nome" marca tudo que tem o nome do insumo. Confira a lista e desmarque o que não leva de verdade, e
            marque o que leva sem ter no nome (ex.: Salada de Frutas).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input className="input max-w-xs" placeholder="Filtrar lista..." value={filter} onChange={(e) => setFilter(e.target.value)} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={onlyLinked} onChange={(e) => setOnlyLinked(e.target.checked)} />
            Só os marcados ({total})
          </label>
        </div>

        <div className="max-h-[50vh] space-y-4 overflow-y-auto rounded-lg border border-gray-100 p-3 dark:border-gray-800">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase text-gray-400">Produtos ({productIds.size})</p>
            {visibleProducts.length === 0 && <p className="text-sm text-gray-400">Nada aqui.</p>}
            {visibleProducts.map((p) => (
              <label key={p.id} className="flex items-center gap-2 py-0.5 text-sm">
                <input type="checkbox" checked={productIds.has(p.id)} onChange={() => flip(productIds, setProductIds, p.id)} />
                <span>{p.name}</span>
                <span className="text-xs text-gray-400">{p.category?.name}</span>
              </label>
            ))}
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase text-gray-400">Sabores e adicionais ({additionalIds.size})</p>
            {visibleAdditionals.length === 0 && <p className="text-sm text-gray-400">Nada aqui.</p>}
            {visibleAdditionals.map((a) => (
              <label key={a.id} className="flex items-center gap-2 py-0.5 text-sm">
                <input type="checkbox" checked={additionalIds.has(a.id)} onChange={() => flip(additionalIds, setAdditionalIds, a.id)} />
                <span>{a.name}</span>
                <span className="text-xs text-gray-400">
                  {categoryName(a.categoryId)} · {a.kind === 'BASE' ? 'Sabor' : 'Adicional'}
                </span>
              </label>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex items-center justify-between gap-2 pt-2">
          {ingredient ? (
            <button
              className="btn-secondary text-red-600"
              disabled={remove.isPending}
              onClick={() => {
                if (confirm(`Apagar o insumo ${ingredient.name}? Os produtos continuam no cardápio.`)) remove.mutate();
              }}
            >
              <Trash2 size={14} /> Apagar
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button className="btn-primary" disabled={save.isPending || name.trim().length < 2} onClick={() => save.mutate()}>
              Salvar
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
