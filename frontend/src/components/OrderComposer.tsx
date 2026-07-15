import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Minus, X, Search, Pencil } from 'lucide-react';
import api from '../lib/api';
import { brl } from '../lib/format';
import { JuiceBuilder } from './JuiceBuilder';
import { DRINK_NOTE_PRESETS, FOOD_NOTE_PRESETS, toggleNotePreset } from '../lib/notePresets';
import type { Additional, Category, Product } from '../types';

export interface DraftItem {
  product: Product;
  quantity: number;
  notes: string;
  additionalIds: string[];
  /** Sum of the selected additionals' unit price, captured at selection time so the cart can show a running total without re-fetching every product's additionals. */
  additionalsTotal: number;
}

/** Price of one unit of this draft line (base product + its additionals). */
export function draftItemUnitPrice(item: DraftItem): number {
  return item.product.price + item.additionalsTotal;
}

/** Product grid + item drafting used by the waiter to build an order. */
export function OrderComposer({
  draft,
  setDraft,
}: {
  draft: DraftItem[];
  setDraft: (items: DraftItem[]) => void;
}) {
  const [topGroup, setTopGroup] = useState<'COMIDAS' | 'BEBIDAS'>('COMIDAS');
  const [activeCat, setActiveCat] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [configuring, setConfiguring] = useState<Product | null>(null);

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api.get<Category[]>('/catalog/categories')).data,
  });
  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: async () => (await api.get<Product[]>('/catalog/products', { params: { available: true } })).data,
  });

  const term = search.trim().toLowerCase();
  const searching = term.length > 0;

  // Categorias de bebida (estação do bar de sucos) vs. comida (cozinha + sem estação) —
  // divide as ~15 categorias em dois grupos pequenos em vez de uma parede única de pills.
  const drinkCategories = useMemo(() => categories.filter((c) => c.station === 'JUICE_BAR'), [categories]);
  const foodCategories = useMemo(() => categories.filter((c) => c.station !== 'JUICE_BAR'), [categories]);
  const groupCategories = topGroup === 'BEBIDAS' ? drinkCategories : foodCategories;

  // Buscando: procura em TODAS as categorias (comida e bebida) por nome ou descrição.
  // Sem busca: filtra pelo grupo (comida/bebida) e, dentro dele, pela categoria selecionada.
  const filtered = useMemo(() => {
    if (searching) {
      return products.filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          (p.description ?? '').toLowerCase().includes(term),
      );
    }
    if (activeCat === 'all') {
      const groupIds = new Set(groupCategories.map((c) => c.id));
      return products.filter((p) => groupIds.has(p.categoryId));
    }
    return products.filter((p) => p.categoryId === activeCat);
  }, [products, activeCat, term, searching, groupCategories]);

  const simpleIndex = (productId: string) =>
    draft.findIndex((d) => d.product.id === productId && d.additionalIds.length === 0 && !d.notes);
  const simpleQty = (productId: string) => draft[simpleIndex(productId)]?.quantity ?? 0;

  const addSimple = (product: Product) => {
    const idx = simpleIndex(product.id);
    if (idx >= 0) {
      const next = [...draft];
      next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
      setDraft(next);
    } else {
      setDraft([...draft, { product, quantity: 1, notes: '', additionalIds: [], additionalsTotal: 0 }]);
    }
  };

  const decSimple = (product: Product) => {
    const idx = simpleIndex(product.id);
    if (idx < 0) return;
    const next = [...draft];
    if (next[idx].quantity > 1) next[idx] = { ...next[idx], quantity: next[idx].quantity - 1 };
    else next.splice(idx, 1);
    setDraft(next);
  };

  const addFromBuilder = (item: DraftItem) => setDraft([...draft, item]);

  // Categorias com produtos nomeados "Fruta (Base)" usam o montador guiado
  // (fruta -> base -> adicionais) em vez da grade — evita listar dezenas de
  // combinações como botões separados.
  const activeCategory = categories.find((c) => c.id === activeCat);
  const useBuilder = activeCategory?.name.toLowerCase() === 'sucos' && !searching;
  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? '';

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Catalog */}
      <div>
        {/* Busca instantânea por nome/descrição do produto */}
        <div className="relative mb-3">
          <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-10 pr-9 text-[15px] text-gray-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            placeholder="Pesquisar produto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-600"
              onClick={() => setSearch('')}
              title="Limpar"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {!searching && (
          <>
            {/* Grupo principal: comidas vs. bebidas — reduz a lista de categorias visíveis de uma vez */}
            <div className="mb-2 grid grid-cols-2 gap-2">
              <button
                className={`h-11 rounded-xl text-[15px] font-bold transition ${topGroup === 'COMIDAS' ? 'bg-brand text-white shadow-sm' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'}`}
                onClick={() => { setTopGroup('COMIDAS'); setActiveCat('all'); }}
              >
                🍽️ Comidas
              </button>
              <button
                className={`h-11 rounded-xl text-[15px] font-bold transition ${topGroup === 'BEBIDAS' ? 'bg-brand text-white shadow-sm' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'}`}
                onClick={() => { setTopGroup('BEBIDAS'); setActiveCat('all'); }}
              >
                🥤 Bebidas
              </button>
            </div>

            <div className="mb-2 flex flex-wrap gap-2">
              <button
                className={`h-9 rounded-full px-4 text-[13px] font-semibold transition ${activeCat === 'all' ? 'bg-brand text-white' : 'border border-gray-200 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200'}`}
                onClick={() => setActiveCat('all')}
              >
                Todos
              </button>
              {groupCategories.map((c) => (
                <button
                  key={c.id}
                  className={`h-9 rounded-full px-4 text-[13px] font-semibold transition ${activeCat === c.id ? 'bg-brand text-white' : 'border border-gray-200 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200'}`}
                  onClick={() => setActiveCat(c.id)}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </>
        )}
        {useBuilder ? (
          <div className="max-h-[55vh] overflow-y-auto pr-1">
            <JuiceBuilder products={filtered} categoryId={activeCat} onAdd={addFromBuilder} />
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">
            {searching
              ? `Nenhum produto encontrado para "${search}".`
              : activeCat === 'all'
                ? `Nenhum produto em ${topGroup === 'BEBIDAS' ? 'Bebidas' : 'Comidas'}.`
                : 'Nenhum produto nesta categoria.'}
          </p>
        ) : (
          <div className="max-h-[55vh] overflow-y-auto pr-1">
            {filtered.map((p) => {
              const qty = simpleQty(p.id);
              return (
                <div
                  key={p.id}
                  onClick={() => addSimple(p)}
                  className="flex cursor-pointer items-center gap-3 border-b border-gray-100 py-3.5 transition hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50"
                >
                  <div className="min-w-0 flex-1">
                    {searching && (
                      <span className="mb-0.5 block w-fit rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:bg-gray-800">
                        {categoryName(p.categoryId)}
                      </span>
                    )}
                    <div className="text-[15px] font-semibold leading-tight text-gray-900 dark:text-gray-50">{p.name}</div>
                    {p.description && (
                      <div className="mt-0.5 line-clamp-2 text-xs leading-snug text-gray-500">{p.description}</div>
                    )}
                    <div className="mt-0.5 text-sm font-bold text-brand">{brl(p.price)}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    {qty > 0 && (
                      <button
                        onClick={() => setConfiguring(p)}
                        className="text-gray-400 hover:text-brand"
                        title="Observações / adicionais"
                      >
                        <Pencil size={14} />
                      </button>
                    )}
                    {qty === 0 ? (
                      <span className="flex h-8 w-8 items-center justify-center rounded-full border-[1.5px] border-brand text-lg font-semibold leading-none text-brand">
                        +
                      </span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => decSimple(p)}
                          className="flex h-7 w-7 items-center justify-center rounded-full border-[1.5px] border-brand text-brand"
                        >
                          <Minus size={13} />
                        </button>
                        <span className="min-w-[16px] text-center text-sm font-bold">{qty}</span>
                        <button
                          onClick={() => addSimple(p)}
                          className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-white"
                        >
                          <Plus size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Draft cart */}
      <div>
        <h4 className="mb-2 text-sm font-medium text-gray-600 dark:text-gray-300">Itens do pedido</h4>
        {draft.length === 0 && <p className="text-sm text-gray-400">Toque em um produto para adicionar.</p>}
        <div className="space-y-2">
          {draft.map((item, i) => (
            <div key={i} className="card p-3">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{item.product.name}</div>
                  {item.additionalIds.length > 0 && (
                    <div className="text-xs text-gray-500">+ {item.additionalIds.length} adicional(is)</div>
                  )}
                  <div className="text-xs font-semibold text-brand">{brl(draftItemUnitPrice(item) * item.quantity)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button className="btn-secondary !px-2 !py-1" onClick={() => {
                    const next = [...draft];
                    if (next[i].quantity > 1) next[i] = { ...next[i], quantity: next[i].quantity - 1 };
                    else next.splice(i, 1);
                    setDraft(next);
                  }}>
                    <Minus size={14} />
                  </button>
                  <span className="w-6 text-center text-sm font-semibold">{item.quantity}</span>
                  <button className="btn-secondary !px-2 !py-1" onClick={() => {
                    const next = [...draft];
                    next[i] = { ...next[i], quantity: next[i].quantity + 1 };
                    setDraft(next);
                  }}>
                    <Plus size={14} />
                  </button>
                  <button className="btn-secondary !px-2 !py-1" onClick={() => setConfiguring(item.product)}>
                    Obs
                  </button>
                  <button className="text-red-500" onClick={() => setDraft(draft.filter((_, j) => j !== i))}>
                    <X size={16} />
                  </button>
                </div>
              </div>
              {item.notes && <div className="mt-1 text-xs italic text-gray-500">“{item.notes}”</div>}
            </div>
          ))}
        </div>
      </div>

      {configuring && (
        <ItemConfigModal
          product={configuring}
          current={draft.find((d) => d.product.id === configuring.id)}
          onClose={() => setConfiguring(null)}
          onSave={(notes, additionalIds, additionalsTotal) => {
            const idx = draft.findIndex((d) => d.product.id === configuring.id);
            const next = [...draft];
            if (idx >= 0) next[idx] = { ...next[idx], notes, additionalIds, additionalsTotal };
            setDraft(next);
            setConfiguring(null);
          }}
        />
      )}
    </div>
  );
}

function ItemConfigModal({
  product,
  current,
  onClose,
  onSave,
}: {
  product: Product;
  current?: DraftItem;
  onClose: () => void;
  onSave: (notes: string, additionalIds: string[], additionalsTotal: number) => void;
}) {
  const [notes, setNotes] = useState(current?.notes ?? '');
  const [selected, setSelected] = useState<string[]>(current?.additionalIds ?? []);

  const { data: additionals = [] } = useQuery({
    queryKey: ['additionals', product.categoryId],
    queryFn: async () =>
      (await api.get<Additional[]>('/catalog/additionals', { params: { categoryId: product.categoryId, active: true } }))
        .data,
  });

  const selectedTotal = additionals.filter((a) => selected.includes(a.id)).reduce((sum, a) => sum + a.price, 0);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card max-h-[85vh] w-full max-w-md overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 font-semibold">{product.name}</h3>
        {additionals.length > 0 && (
          <div className="mb-4">
            <div className="label">Adicionais</div>
            <div className="flex flex-wrap gap-2">
              {additionals.map((a) => {
                const on = selected.includes(a.id);
                return (
                  <button
                    key={a.id}
                    onClick={() => setSelected(on ? selected.filter((x) => x !== a.id) : [...selected, a.id])}
                    className={`rounded-md border px-3 py-1.5 text-xs ${on ? 'border-brand bg-brand text-white' : 'border-gray-300 dark:border-gray-700'}`}
                  >
                    {a.name} <span className="opacity-70">+{brl(a.price)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div className="mb-4">
          <label className="label">Observações</label>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {(product.category?.station === 'JUICE_BAR' ? DRINK_NOTE_PRESETS : FOOD_NOTE_PRESETS).map((preset) => {
              const on = notes.toLowerCase().split(',').map((p) => p.trim()).includes(preset.toLowerCase());
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setNotes(toggleNotePreset(notes, preset))}
                  className={`rounded-full border px-2.5 py-1 text-xs ${on ? 'border-brand bg-brand text-white' : 'border-gray-300 text-gray-600 dark:border-gray-700 dark:text-gray-300'}`}
                >
                  {preset}
                </button>
              );
            })}
          </div>
          <textarea
            className="input"
            rows={2}
            placeholder="Sem cebola, bem passado, muito gelo..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={() => onSave(notes, selected, selectedTotal)}>Salvar</button>
        </div>
      </div>
    </div>
  );
}
