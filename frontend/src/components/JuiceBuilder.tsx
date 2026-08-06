import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronLeft } from 'lucide-react';
import api from '../lib/api';
import { brl } from '../lib/format';
import { DRINK_NOTE_PRESETS, toggleNotePreset } from '../lib/notePresets';
import type { Additional, Product } from '../types';
import { EXTRA_FRUIT_PRICE, type DraftItem } from './OrderComposer';

/** Matches product names built by the menu importer, e.g. "Morango (Frapê)". */
export const FRUIT_BASE_RE = /^(.+) \(([^)]+)\)$/;

/** Máximo de frutas combináveis num só suco/frapê — espelha o limite do backend (zod). */
const MAX_FRUITS = 4;

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
 * Guided "monte seu suco" flow: fruta(s) -> base -> adicionais, em vez de uma
 * grade enorme com uma combinação por botão. Usado para categorias cujos
 * produtos seguem a convenção de nome "Fruta (Base)" (ex.: importador do
 * cardápio de sucos). Categorias sem esse padrão devem usar a grade normal.
 *
 * O cliente pode combinar mais de 1 fruta no mesmo copo — regra do dono do
 * restaurante: preço = o da combinação fruta+base mais cara entre as
 * escolhidas + R$1,00 por fruta adicional (a partir da 2ª). O preço mostrado
 * aqui é só uma prévia; o valor cobrado de verdade é sempre recalculado no
 * backend a partir dos productId reais (nunca confiado do cliente).
 */
export function JuiceBuilder({
  products,
  categoryId,
  onAdd,
  basePath = '/catalog',
}: {
  products: Product[];
  categoryId: string;
  onAdd: (item: DraftItem) => void;
  /** Same purpose as OrderComposer's basePath — passed through from there. */
  basePath?: string;
}) {
  const { fruits, standalone } = useMemo(() => groupByFruit(products), [products]);
  const [selectedFruits, setSelectedFruits] = useState<FruitEntry[]>([]);
  const [pickingBase, setPickingBase] = useState(false);
  const [base, setBase] = useState<string | null>(null);
  const [standaloneChosen, setStandaloneChosen] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [selectedAdditionals, setSelectedAdditionals] = useState<string[]>([]);

  // Bases que TODAS as frutas selecionadas têm em comum — só essas fazem sentido pro combo
  // (ex.: se uma fruta não tem versão "Frapê", "Frapê" não pode ser escolhido como base).
  const commonBases = useMemo(() => {
    if (selectedFruits.length === 0) return [];
    const [first, ...rest] = selectedFruits;
    return first.bases
      .map((b) => b.base)
      .filter((baseName) => rest.every((f) => f.bases.some((b) => b.base === baseName)));
  }, [selectedFruits]);

  // 1 produto por fruta selecionada, na base escolhida.
  const comboProducts = useMemo(() => {
    if (!base) return [];
    return selectedFruits
      .map((f) => f.bases.find((b) => b.base === base)?.product)
      .filter((p): p is Product => !!p);
  }, [selectedFruits, base]);

  const effectiveProducts = standaloneChosen ? [standaloneChosen] : comboProducts;
  const isCombo = !standaloneChosen && effectiveProducts.length > 1;
  const primary = useMemo(
    () => (effectiveProducts.length ? effectiveProducts.reduce((max, p) => (p.price > max.price ? p : max)) : null),
    [effectiveProducts],
  );
  const comboExtra = isCombo ? EXTRA_FRUIT_PRICE * (effectiveProducts.length - 1) : 0;
  const totalUnitPrice = (primary?.price ?? 0) + comboExtra;

  const { data: additionals = [] } = useQuery({
    queryKey: ['additionals', categoryId, basePath],
    queryFn: async () =>
      (await api.get<Additional[]>(`${basePath}/additionals`, { params: { categoryId, active: true } })).data,
    enabled: effectiveProducts.length > 0,
  });

  const reset = () => {
    setSelectedFruits([]);
    setPickingBase(false);
    setBase(null);
    setStandaloneChosen(null);
    setQuantity(1);
    setNotes('');
    setSelectedAdditionals([]);
  };

  const toggleFruit = (f: FruitEntry) => {
    const already = selectedFruits.some((sf) => sf.fruit === f.fruit);
    if (already) {
      setSelectedFruits(selectedFruits.filter((sf) => sf.fruit !== f.fruit));
      return;
    }
    if (selectedFruits.length >= MAX_FRUITS) return;
    setSelectedFruits([...selectedFruits, f]);
  };

  const confirm = () => {
    if (!primary) return;
    const additionalsTotal = additionals
      .filter((a) => selectedAdditionals.includes(a.id))
      .reduce((sum, a) => sum + a.price, 0);
    onAdd({
      product: primary,
      quantity,
      notes,
      additionalIds: selectedAdditionals,
      additionalsTotal,
      comboProductIds: isCombo ? effectiveProducts.map((p) => p.id) : undefined,
      // Ordenado por nome (não pela ordem que o cliente tocou) — mesmo critério do backend,
      // pro rótulo no carrinho já sair igual ao que vai aparecer depois na cozinha/caixa.
      comboLabel: isCombo ? [...selectedFruits].map((f) => f.fruit).sort((a, b) => a.localeCompare(b, 'pt-BR')).join(' + ') : undefined,
    });
    reset();
  };

  // Etapa 3: fruta(s) + base escolhidas — quantidade, adicionais, observações.
  if (effectiveProducts.length > 0 && primary) {
    return (
      <div className="space-y-4">
        <button
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          onClick={() => (standaloneChosen ? setStandaloneChosen(null) : setBase(null))}
        >
          <ChevronLeft size={16} /> {standaloneChosen ? 'Voltar' : 'Trocar base'}
        </button>
        <div className="card p-3">
          {isCombo ? (
            <>
              <div className="font-medium">
                {selectedFruits.map((f) => f.fruit).join(' + ')} <span className="font-normal text-gray-500">({base})</span>
              </div>
              <ul className="mt-1.5 space-y-0.5 text-xs text-gray-500">
                {effectiveProducts.map((p) => (
                  <li key={p.id}>
                    {p.name.match(FRUIT_BASE_RE)?.[1] ?? p.name} — {brl(p.price)}
                    {p.id === primary.id && <span className="text-brand"> (preço base)</span>}
                  </li>
                ))}
              </ul>
              <div className="mt-1.5 text-sm text-brand">
                {brl(primary.price)} + {brl(comboExtra)} fruta extra = <strong>{brl(totalUnitPrice)}</strong>
              </div>
            </>
          ) : (
            <>
              <div className="font-medium">{primary.name}</div>
              <div className="text-sm text-brand">{brl(primary.price)}</div>
            </>
          )}
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
          <div className="mb-2 flex flex-wrap gap-1.5">
            {DRINK_NOTE_PRESETS.map((preset) => {
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

  // Etapa 2: fruta(s) escolhidas — selecionar a base (comum a todas elas).
  if (pickingBase) {
    return (
      <div className="space-y-4">
        <button className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700" onClick={() => setPickingBase(false)}>
          <ChevronLeft size={16} /> Trocar fruta(s)
        </button>
        <div className="text-sm font-medium text-gray-600 dark:text-gray-300">
          {selectedFruits.map((f) => f.fruit).join(' + ')} — escolha a base
        </div>
        {commonBases.length === 0 ? (
          <p className="text-sm text-gray-500">
            Essas frutas não têm nenhuma base em comum. Volte e escolha outra combinação.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {commonBases.map((baseName) => {
              const preview = selectedFruits.map((f) => f.bases.find((b) => b.base === baseName)!.product);
              const previewPrice = Math.max(...preview.map((p) => p.price)) + (preview.length > 1 ? EXTRA_FRUIT_PRICE * (preview.length - 1) : 0);
              return (
                <button
                  key={baseName}
                  onClick={() => setBase(baseName)}
                  className="card flex flex-col items-center justify-center p-4 text-center transition hover:border-brand hover:shadow"
                >
                  <span className="font-medium">{baseName}</span>
                  <span className="mt-1 text-sm text-brand">{brl(previewPrice)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Etapa 1: escolher a(s) fruta(s) — seleção múltipla, até MAX_FRUITS.
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex items-center justify-between text-sm font-medium text-gray-600 dark:text-gray-300">
          <span>1. Escolha a(s) fruta(s)</span>
          {selectedFruits.length > 0 && <span className="text-xs font-normal text-gray-400">{selectedFruits.length}/{MAX_FRUITS}</span>}
        </div>
        <p className="mb-2 text-xs text-gray-400">Pode combinar mais de uma — cada fruta a partir da 2ª soma {brl(EXTRA_FRUIT_PRICE)}.</p>
        <div className="grid max-h-[38vh] grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4">
          {fruits.map((f) => {
            const on = selectedFruits.some((sf) => sf.fruit === f.fruit);
            const disabled = !on && selectedFruits.length >= MAX_FRUITS;
            return (
              <button
                key={f.fruit}
                onClick={() => toggleFruit(f)}
                disabled={disabled}
                className={`card p-2.5 text-center text-sm font-medium transition ${disabled ? 'opacity-40' : 'hover:border-brand hover:shadow'} ${on ? 'border-brand bg-brand text-white' : ''}`}
              >
                {f.fruit}
              </button>
            );
          })}
        </div>
        {selectedFruits.length > 0 && (
          <button className="btn-primary mt-3 w-full !py-2.5" onClick={() => setPickingBase(true)}>
            Continuar
          </button>
        )}
      </div>

      {standalone.length > 0 && (
        <div>
          <div className="mb-2 text-sm font-medium text-gray-600 dark:text-gray-300">Sabores especiais</div>
          <div className="grid grid-cols-2 gap-2">
            {standalone.map((p) => (
              <button
                key={p.id}
                onClick={() => setStandaloneChosen(p)}
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
