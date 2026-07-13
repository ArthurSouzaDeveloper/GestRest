import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronLeft } from 'lucide-react';
import api from '../lib/api';
import { brl } from '../lib/format';
import type { Additional, Product } from '../types';
import type { DraftItem } from './OrderComposer';

/** Matches product names built by the menu importer, e.g. "Morango (Frapê)". */
const FRUIT_BASE_RE = /^(.+) \(([^)]+)\)$/;

interface FruitEntry {
  fruit: string;
  bases: { base: string; product: Product }[];
}

function groupByFruit(products: Product[]): { fruits: FruitEntry[]; standalone: Product[] } {
  const map = new Map<string, { base: string; product: Product }[]>();
  const standalone: Product[] = [];
  for (const p of products) {
    const m = p.name.match(FRUIT_BASE_RE);
    if (!m) {
      standalone.push(p);
      continue;
    }
    const [, fruit, base] = m;
    if (!map.has(fruit)) map.set(fruit, []);
    map.get(fruit)!.push({ base, product: p });
  }
  const fruits = [...map.entries()]
    .map(([fruit, bases]) => ({ fruit, bases }))
    .sort((a, b) => a.fruit.localeCompare(b.fruit, 'pt-BR'));
  return { fruits, standalone };
}

/**
 * Guided "monte seu suco" flow: fruta -> base -> adicionais, em vez de uma
 * grade enorme com uma combinação por botão. Usado para categorias cujos
 * produtos seguem a convenção de nome "Fruta (Base)" (ex.: importador do
 * cardápio de sucos). Categorias sem esse padrão devem usar a grade normal.
 */
export function JuiceBuilder({
  products,
  categoryId,
  onAdd,
}: {
  products: Product[];
  categoryId: string;
  onAdd: (item: DraftItem) => void;
}) {
  const { fruits, standalone } = useMemo(() => groupByFruit(products), [products]);
  const [fruit, setFruit] = useState<FruitEntry | null>(null);
  const [chosen, setChosen] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [selectedAdditionals, setSelectedAdditionals] = useState<string[]>([]);

  const { data: additionals = [] } = useQuery({
    queryKey: ['additionals', categoryId],
    queryFn: async () =>
      (await api.get<Additional[]>('/catalog/additionals', { params: { categoryId, active: true } })).data,
    enabled: !!chosen,
  });

  const reset = () => {
    setFruit(null);
    setChosen(null);
    setQuantity(1);
    setNotes('');
    setSelectedAdditionals([]);
  };

  const confirm = () => {
    if (!chosen) return;
    onAdd({ product: chosen, quantity, notes, additionalIds: selectedAdditionals });
    reset();
  };

  // Etapa 3: suco escolhido — quantidade, adicionais, observações.
  if (chosen) {
    return (
      <div className="space-y-4">
        <button className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700" onClick={() => setChosen(null)}>
          <ChevronLeft size={16} /> Trocar base
        </button>
        <div className="card p-3">
          <div className="font-medium">{chosen.name}</div>
          <div className="text-sm text-brand">{brl(chosen.price)}</div>
        </div>

        <div>
          <div className="label">Quantidade</div>
          <div className="flex items-center gap-3">
            <button className="btn-secondary !px-3" onClick={() => setQuantity((q) => Math.max(1, q - 1))}>-</button>
            <span className="w-6 text-center font-semibold">{quantity}</span>
            <button className="btn-secondary !px-3" onClick={() => setQuantity((q) => q + 1)}>+</button>
          </div>
        </div>

        {additionals.length > 0 && (
          <div>
            <div className="label">Adicionais</div>
            <div className="flex flex-wrap gap-2">
              {additionals.map((a) => {
                const on = selectedAdditionals.includes(a.id);
                return (
                  <button
                    key={a.id}
                    onClick={() =>
                      setSelectedAdditionals(on ? selectedAdditionals.filter((x) => x !== a.id) : [...selectedAdditionals, a.id])
                    }
                    className={`rounded-md border px-3 py-1.5 text-xs ${on ? 'border-brand bg-brand text-white' : 'border-gray-300 dark:border-gray-700'}`}
                  >
                    {a.name} <span className="opacity-70">+{brl(a.price)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <label className="label">Observações</label>
          <textarea
            className="input"
            rows={2}
            placeholder="Sem açúcar, muito gelo, pouco gelo..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <button className="btn-primary w-full !py-3" onClick={confirm}>
          <Check size={16} /> Adicionar ao pedido
        </button>
      </div>
    );
  }

  // Etapa 2: fruta escolhida — selecionar a base.
  if (fruit) {
    return (
      <div className="space-y-4">
        <button className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700" onClick={() => setFruit(null)}>
          <ChevronLeft size={16} /> Trocar fruta
        </button>
        <div className="text-sm font-medium text-gray-600 dark:text-gray-300">
          {fruit.fruit} — escolha a base
        </div>
        <div className="grid grid-cols-2 gap-2">
          {fruit.bases.map(({ base, product }) => (
            <button
              key={base}
              onClick={() => setChosen(product)}
              className="card flex flex-col items-center justify-center p-4 text-center transition hover:border-brand hover:shadow"
            >
              <span className="font-medium">{base}</span>
              <span className="mt-1 text-sm text-brand">{brl(product.price)}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Etapa 1: escolher a fruta.
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 text-sm font-medium text-gray-600 dark:text-gray-300">1. Escolha a fruta</div>
        <div className="grid max-h-[38vh] grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4">
          {fruits.map((f) => (
            <button
              key={f.fruit}
              onClick={() => setFruit(f)}
              className="card p-2.5 text-center text-sm font-medium transition hover:border-brand hover:shadow"
            >
              {f.fruit}
            </button>
          ))}
        </div>
      </div>

      {standalone.length > 0 && (
        <div>
          <div className="mb-2 text-sm font-medium text-gray-600 dark:text-gray-300">Sabores especiais</div>
          <div className="grid grid-cols-2 gap-2">
            {standalone.map((p) => (
              <button
                key={p.id}
                onClick={() => setChosen(p)}
                className="card flex flex-col items-start p-3 text-left transition hover:border-brand hover:shadow"
              >
                <span className="text-sm font-medium leading-tight">{p.name}</span>
                <span className="mt-1 text-xs text-gray-500">{brl(p.price)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
