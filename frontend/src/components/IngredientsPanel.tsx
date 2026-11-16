import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import api, { apiError } from '../lib/api';
import { Card, Modal } from './ui';
import { matchIngredient, norm, suggestIngredients, type MatchSource } from '../lib/ingredientMatch';
import type { Additional, Category, Ingredient, Product } from '../types';

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
            const count = i.productIds.length + i.optionalProductIds.length + i.additionalIds.length;
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
                      if (i.inStock && !confirm(`Marcar ${i.name} em falta? Os itens ligados saem do cardápio ou ficam "sem ${i.name.toLowerCase()}".`)) return;
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
          existingNames={ingredients.map((i) => i.name)}
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
  existingNames,
  products,
  additionals,
  categories,
  onClose,
  onSaved,
}: {
  ingredient: Ingredient | null;
  existingNames: string[];
  products: Product[];
  additionals: Additional[];
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(ingredient?.name ?? '');
  // Todos os produtos ligados (essenciais + "dá pra tirar"); `optionalIds` diz quais
  // continuam à venda sem o insumo quando ele acaba (ex.: Milho no Especial da Casa).
  const [productIds, setProductIds] = useState<Set<string>>(
    new Set([...(ingredient?.productIds ?? []), ...(ingredient?.optionalProductIds ?? [])]),
  );
  const [optionalIds, setOptionalIds] = useState<Set<string>>(new Set(ingredient?.optionalProductIds ?? []));
  const [additionalIds, setAdditionalIds] = useState<Set<string>>(new Set(ingredient?.additionalIds ?? []));
  // Onde o "Marcar pelo nome" achou cada produto, pra mostrar o porquê na lista.
  const [matchedBy, setMatchedBy] = useState<Map<string, MatchSource>>(new Map());
  const [summary, setSummary] = useState('');
  const [filter, setFilter] = useState('');
  const [onlyLinked, setOnlyLinked] = useState(!!ingredient);
  const [error, setError] = useState('');

  const categoryName = (id?: string) => categories.find((c) => c.id === id)?.name ?? 'Todas as categorias';

  const suggestions = useMemo(
    () => (ingredient ? [] : suggestIngredients(products, additionals, existingNames)),
    [ingredient, products, additionals, existingNames],
  );

  // Marca tudo que leva o insumo. No nome (ex.: "Morango (Laranja)") → some do cardápio;
  // só na descrição/receita (ex.: Caipira leva milho) → dá pra tirar. Não desmarca nada
  // e não muda o tipo do que já estava marcado. O admin confere e ajusta.
  const autoMark = (rawName: string) => {
    const m = matchIngredient(rawName, products, additionals);
    const newOptional = new Set(optionalIds);
    let byName = 0;
    let byDescription = 0;
    for (const [id, source] of m.products) {
      if (productIds.has(id)) continue;
      if (source === 'description') {
        newOptional.add(id);
        byDescription++;
      } else byName++;
    }
    const newAdditionals = [...m.additionalIds].filter((id) => !additionalIds.has(id)).length;
    setProductIds(new Set([...productIds, ...m.products.keys()]));
    setOptionalIds(newOptional);
    setAdditionalIds(new Set([...additionalIds, ...m.additionalIds]));
    setMatchedBy(new Map([...matchedBy, ...m.products]));
    setOnlyLinked(true);
    setFilter('');
    const parts = [
      byName && `${byName} pelo nome (somem do cardápio)`,
      byDescription && `${byDescription} pela receita (dá pra tirar)`,
      newAdditionals && `${newAdditionals} ${newAdditionals === 1 ? 'sabor/adicional' : 'sabores/adicionais'}`,
    ].filter(Boolean);
    setSummary(
      parts.length
        ? `Marcamos ${parts.join(', ')}. Confira a lista abaixo e desmarque o que não leva de verdade.`
        : 'Nada novo com esse nome. Desmarque "Só os marcados" e marque na mão o que leva.',
    );
  };

  const term = norm(filter);
  const visibleProducts = products
    .filter((p) => (!onlyLinked || productIds.has(p.id)) && (norm(p.name).includes(term) || norm(p.category?.name ?? '').includes(term)))
    .sort((a, b) => (a.category?.name ?? '').localeCompare(b.category?.name ?? '', 'pt-BR') || a.name.localeCompare(b.name, 'pt-BR'));
  const visibleAdditionals = additionals
    .filter((a) => (!onlyLinked || additionalIds.has(a.id)) && (norm(a.name).includes(term) || norm(categoryName(a.categoryId)).includes(term)))
    .sort((a, b) => categoryName(a.categoryId).localeCompare(categoryName(b.categoryId), 'pt-BR') || a.name.localeCompare(b.name, 'pt-BR'));

  // Produtos agrupados por categoria (já vêm ordenados), pra marcar/desmarcar o grupo todo.
  const groups: { name: string; items: Product[] }[] = [];
  for (const p of visibleProducts) {
    const g = p.category?.name ?? 'Sem categoria';
    if (groups[groups.length - 1]?.name !== g) groups.push({ name: g, items: [] });
    groups[groups.length - 1].items.push(p);
  }

  const flip = (set: Set<string>, setter: (s: Set<string>) => void, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  };

  const setGroup = (items: Product[], on: boolean) => {
    const next = new Set(productIds);
    for (const p of items) {
      if (on) next.add(p.id);
      else next.delete(p.id);
    }
    setProductIds(next);
  };

  const setGroupOptional = (items: Product[], optional: boolean) => {
    const next = new Set(optionalIds);
    for (const p of items) {
      if (!productIds.has(p.id)) continue;
      if (optional) next.add(p.id);
      else next.delete(p.id);
    }
    setOptionalIds(next);
  };

  const save = useMutation({
    mutationFn: async () => {
      const linked = [...productIds];
      const payload = {
        name: name.trim(),
        productIds: linked.filter((id) => !optionalIds.has(id)),
        optionalProductIds: linked.filter((id) => optionalIds.has(id)),
        additionalIds: [...additionalIds],
      };
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
  const upper = name.trim().toUpperCase() || 'INSUMO';

  return (
    <Modal open onClose={onClose} title={ingredient ? 'Editar insumo' : 'Novo insumo'} wide>
      <div className="space-y-3">
        <div>
          <label className="label">Nome do insumo</label>
          <div className="flex gap-2">
            <input
              className="input"
              placeholder="Ex.: Laranja"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && name.trim().length >= 2) autoMark(name);
              }}
            />
            <button
              className="btn-secondary shrink-0"
              disabled={name.trim().length < 2}
              onClick={() => autoMark(name)}
              title="Marca tudo que leva esse insumo no nome ou na receita"
            >
              Marcar pelo nome
            </button>
          </div>
          {suggestions.length > 0 && (
            <div className="mt-2">
              <p className="mb-1 text-xs text-gray-500">Mais usados no seu cardápio (1 clique já marca tudo):</p>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((s) => (
                  <button
                    key={s.name}
                    type="button"
                    className={`rounded-full border px-2.5 py-0.5 text-xs transition ${
                      norm(name.trim()) === norm(s.name)
                        ? 'border-brand-500 bg-brand-50 text-brand-700'
                        : 'border-gray-200 text-gray-700 hover:border-brand-100 dark:border-gray-700 dark:text-gray-300'
                    }`}
                    onClick={() => {
                      setName(s.name);
                      autoMark(s.name);
                    }}
                  >
                    {s.name} <span className="text-gray-400">· {s.count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {summary ? (
            <p className="mt-2 rounded-md bg-blue-50 px-2 py-1.5 text-xs text-blue-800 dark:bg-blue-950 dark:text-blue-200">{summary}</p>
          ) : (
            <p className="mt-1 text-xs text-gray-500">
              "Marcar pelo nome" acha o insumo no nome do produto (esses <b>somem do cardápio</b> quando acabar) e na
              receita/descrição (esses <b>dá pra tirar</b>: continuam à venda e sai "SEM {upper}" na cozinha). Você
              confere e ajusta.
            </p>
          )}
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
            {groups.length === 0 && (
              <p className="text-sm text-gray-400">
                {onlyLinked ? 'Nada marcado. Use "Marcar pelo nome" ou desmarque "Só os marcados".' : 'Nada aqui.'}
              </p>
            )}
            {groups.map((g) => {
              const marked = g.items.filter((p) => productIds.has(p.id)).length;
              return (
                <div key={g.name} className="mb-3">
                  <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-gray-100 pb-1 dark:border-gray-800">
                    <span className="text-sm font-semibold">
                      {g.name} <span className="font-normal text-gray-400">({marked}/{g.items.length})</span>
                    </span>
                    <button type="button" className="text-xs text-brand-600 hover:underline" onClick={() => setGroup(g.items, marked < g.items.length)}>
                      {marked < g.items.length ? 'Marcar todos' : 'Desmarcar todos'}
                    </button>
                    {marked > 0 && (
                      <>
                        <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => setGroupOptional(g.items, false)}>
                          Todos somem
                        </button>
                        <button type="button" className="text-xs text-amber-700 hover:underline" onClick={() => setGroupOptional(g.items, true)}>
                          Todos dá pra tirar
                        </button>
                      </>
                    )}
                  </div>
                  {g.items.map((p) => (
                    <div key={p.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-0.5 text-sm">
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={productIds.has(p.id)} onChange={() => flip(productIds, setProductIds, p.id)} />
                        <span>{p.name}</span>
                        {productIds.has(p.id) && matchedBy.get(p.id) && (
                          <span className="rounded bg-gray-100 px-1 text-[10px] uppercase text-gray-500 dark:bg-gray-800" title={p.description}>
                            {matchedBy.get(p.id) === 'name' ? 'no nome' : 'na receita'}
                          </span>
                        )}
                      </label>
                      {productIds.has(p.id) && (
                        <select
                          className={`rounded border px-1.5 py-0.5 text-xs dark:bg-gray-900 ${
                            optionalIds.has(p.id) ? 'border-amber-300 text-amber-700' : 'border-red-200 text-red-700'
                          }`}
                          value={optionalIds.has(p.id) ? 'optional' : 'essential'}
                          onChange={(e) => {
                            const next = new Set(optionalIds);
                            if (e.target.value === 'optional') next.add(p.id);
                            else next.delete(p.id);
                            setOptionalIds(next);
                          }}
                        >
                          <option value="essential">Some do cardápio</option>
                          <option value="optional">Dá pra tirar</option>
                        </select>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
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
