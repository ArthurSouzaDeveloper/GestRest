import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Plus, X } from 'lucide-react';
import api from '../lib/api';
import { brl } from '../lib/format';
import type { Additional, Product } from '../types';
import { EXTRA_FRUIT_PRICE, type DraftItem } from './OrderComposer';

/** Matches product names built by the menu importer, e.g. "Morango (Frapê)". */
export const FRUIT_BASE_RE = /^(.+) \(([^)]+)\)$/;

/** Máximo de frutas combináveis num só suco/frapê — espelha o limite do backend (zod). */
const MAX_FRUITS = 4;

/** Linha de item com borda ao redor inteira (não só uma linha dividindo o próximo item) —
 * pedido explícito do cliente, aplicado em toda lista selecionável deste componente. Usado
 * só na tela interna (staff) — o site público usa PUBLIC_ITEM_ROW abaixo. */
const ITEM_ROW = 'rounded-xl border border-gray-200 px-3.5 dark:border-gray-700';

/** Linha de item só pro site público (variant="public") — fundo branco sólido e texto
 * preto em negrito, pedido explícito do cliente: a lista de frutas/bases estava com fundo
 * lavanda "sem contraste" com a página, diferente dos cards de comida (brancos, texto
 * preto). A Etapa 3 (monte seu suco) já tinha o próprio visual branco; isto estende o
 * mesmo tratamento pras Etapas 1/2 e pra sub-tela de "adicionar fruta". */
const PUBLIC_ITEM_ROW = 'rounded-2xl bg-white px-4 transition active:scale-[0.99]';
const PUBLIC_ITEM_TEXT = 'text-[15px] font-bold text-[#1E1024]';

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
 * Guided "monte seu suco" flow: fruta -> base -> adicionais (2 toques), em vez de uma
 * grade enorme com uma combinação por botão. Usado para categorias cujos produtos seguem
 * a convenção de nome "Fruta (Base)" (ex.: importador do cardápio de sucos). Categorias
 * sem esse padrão devem usar a grade normal.
 *
 * Combinar mais de 1 fruta é uma ação opcional ("+ Adicionar outra fruta" na revisão) em
 * vez do fluxo padrão — a maioria dos pedidos é de 1 fruta só, então o caminho rápido
 * (toque na fruta, toque na base, revisar) fica intacto pra esse caso comum. Regra do
 * dono do restaurante ao combinar: preço = o da combinação fruta+base mais cara entre as
 * escolhidas + R$1,00 por fruta adicional (a partir da 2ª). O preço mostrado aqui é só
 * uma prévia; o valor cobrado de verdade é sempre recalculado no backend a partir dos
 * productId reais (nunca confiado do cliente).
 */
export function JuiceBuilder({
  products,
  categoryId,
  onAdd,
  basePath = '/catalog',
  variant = 'staff',
}: {
  products: Product[];
  categoryId: string;
  onAdd: (item: DraftItem) => void;
  /** Same purpose as OrderComposer's basePath — passed through from there. */
  basePath?: string;
  /** 'public' aplica o visual "Fresco" do site do cliente só na Etapa 3 (monte seu suco) —
   * mesma convenção de OrderComposer, propagada por ela. Default 'staff' preserva a tela
   * interna de sempre. */
  variant?: 'staff' | 'public';
}) {
  const isPublic = variant === 'public';
  const { fruits, standalone } = useMemo(() => groupByFruit(products), [products]);
  const [selectedFruits, setSelectedFruits] = useState<FruitEntry[]>([]);
  const [base, setBase] = useState<string | null>(null);
  const [addingFruit, setAddingFruit] = useState(false);
  const [standaloneChosen, setStandaloneChosen] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [selectedAdditionals, setSelectedAdditionals] = useState<string[]>([]);
  // Adicionais começam fechados — pedido explícito do cliente: depois de escolher fruta+
  // base, a lista de adicionais tomava a tela toda e empurrava "Adicionar ao pedido" pra
  // fora da área visível sem rolar. Minimizado por padrão, com um botão pra abrir só quem
  // quiser customizar o suco.
  const [showAdditionals, setShowAdditionals] = useState(false);

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

  // Outras frutas que dá pra somar ao combo atual: têm a mesma base já escolhida e ainda
  // não foram adicionadas — a base não muda ao combinar, só o preço.
  const candidatesToAdd = useMemo(() => {
    if (!base || standaloneChosen) return [];
    return fruits.filter((f) => !selectedFruits.some((sf) => sf.fruit === f.fruit) && f.bases.some((b) => b.base === base));
  }, [fruits, selectedFruits, base, standaloneChosen]);

  const { data: additionals = [] } = useQuery({
    queryKey: ['additionals', categoryId, basePath],
    queryFn: async () =>
      (await api.get<Additional[]>(`${basePath}/additionals`, { params: { categoryId, active: true } })).data,
    enabled: effectiveProducts.length > 0,
  });

  const reset = () => {
    setSelectedFruits([]);
    setBase(null);
    setAddingFruit(false);
    setStandaloneChosen(null);
    setQuantity(1);
    setNotes('');
    setSelectedAdditionals([]);
    setShowAdditionals(false);
  };

  const removeFruit = (fruitName: string) => {
    if (selectedFruits.length <= 1) return;
    setSelectedFruits(selectedFruits.filter((f) => f.fruit !== fruitName));
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

  // Sub-tela: adicionar mais uma fruta ao combo (só as que têm a base já escolhida).
  if (addingFruit) {
    return (
      <div className="space-y-4">
        <button className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700" onClick={() => setAddingFruit(false)}>
          <ChevronLeft size={16} /> Voltar
        </button>
        <div className="text-sm font-medium text-gray-600 dark:text-gray-300">
          Adicionar fruta ({base}) — soma {brl(EXTRA_FRUIT_PRICE)}
        </div>
        {candidatesToAdd.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhuma outra fruta disponível nessa base.</p>
        ) : (
          <div className="space-y-2">
            {candidatesToAdd.map((f) => (
              <button
                key={f.fruit}
                onClick={() => {
                  setSelectedFruits([...selectedFruits, f]);
                  setAddingFruit(false);
                }}
                className={
                  isPublic
                    ? `flex w-full items-center justify-between py-3.5 text-left ${PUBLIC_ITEM_TEXT} ${PUBLIC_ITEM_ROW}`
                    : `flex w-full items-center justify-between py-3.5 text-left text-[15px] font-medium text-gray-900 transition hover:border-brand hover:text-brand dark:text-gray-100 ${ITEM_ROW}`
                }
              >
                {f.fruit}
                <ChevronRight size={18} className={isPublic ? 'text-[#C9A9D6]' : 'text-gray-300'} />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Etapa 3: fruta + base escolhidas — quantidade, adicionais, observações.
  if (effectiveProducts.length > 0 && primary) {
    if (isPublic) {
      // Visual "Fresco" do site do cliente — mesma hierarquia da tela interna (resumo,
      // adicionar fruta, quantidade, adicionais, observações, confirmar), mas em cards
      // brancos arredondados sobre o fundo lavanda da página em vez da lista "crua" da tela
      // interna. Mantém os mesmos comportamentos já ajustados a pedido do cliente: adicionais
      // minimizados com toggle (não a lista inteira aberta), sem sugestões de observação
      // (só texto livre) e botão de confirmar fixo (sticky) no fim da tela.
      return (
        <div className="space-y-3.5">
          <button
            className="flex items-center gap-1 text-[13px] font-bold text-brand"
            onClick={() => (standaloneChosen ? setStandaloneChosen(null) : setBase(null))}
          >
            <ChevronLeft size={15} /> {standaloneChosen ? 'Voltar' : 'Trocar base'}
          </button>

          <div className="rounded-3xl bg-white p-4">
            <div className="text-[11px] font-bold uppercase tracking-wide text-[#6B4A78]">Seu suco</div>
            {isCombo ? (
              <>
                <div className="mt-0.5 flex items-baseline justify-between gap-2">
                  <span className="font-display text-[18px] font-extrabold text-[#1E1024]">
                    {selectedFruits.map((f) => f.fruit).join(' + ')}
                  </span>
                  <span className="shrink-0 font-display text-[18px] font-extrabold text-brand">{brl(totalUnitPrice)}</span>
                </div>
                <div className="mt-0.5 text-[12.5px] text-[#6B4A78]">Base: {base}</div>
                <ul className="mt-2 space-y-1">
                  {effectiveProducts.map((p) => {
                    const fruitName = p.name.match(FRUIT_BASE_RE)?.[1] ?? p.name;
                    return (
                      <li key={p.id} className="flex items-center justify-between text-[12.5px] text-[#6B4A78]">
                        <span>
                          {fruitName} — {brl(p.price)}
                          {p.id === primary.id && <span className="font-bold text-brand"> (preço base)</span>}
                        </span>
                        <button onClick={() => removeFruit(fruitName)} className="-m-1.5 p-1.5 text-[#C9A9D6] hover:text-red-500" title="Remover fruta">
                          <X size={13} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <div className="mt-0.5 flex items-baseline justify-between">
                <span className="font-display text-[20px] font-extrabold text-[#1E1024]">{primary.name}</span>
                <span className="font-display text-[20px] font-extrabold text-brand">{brl(primary.price)}</span>
              </div>
            )}
          </div>

          {!standaloneChosen && candidatesToAdd.length > 0 && selectedFruits.length < MAX_FRUITS && (
            <button
              className="flex w-full items-center justify-center gap-2 rounded-[20px] border-2 border-dashed border-brand-100 p-3.5 text-[14px] font-bold text-brand"
              onClick={() => setAddingFruit(true)}
            >
              <Plus size={15} /> Adicionar outra fruta (+{brl(EXTRA_FRUIT_PRICE)})
            </button>
          )}

          <div className="flex items-center justify-between rounded-[20px] bg-white px-[18px] py-3.5">
            <span className="text-[15px] font-bold text-[#1E1024]">Quantidade</span>
            <div className="flex items-center gap-3.5 rounded-full bg-brand-50 p-1">
              <button
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[18px] font-bold text-[#1E1024]"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              >
                –
              </button>
              <span className="min-w-[14px] text-center text-[16px] font-extrabold text-[#1E1024]">{quantity}</span>
              <button
                className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-[18px] font-bold text-white"
                onClick={() => setQuantity((q) => q + 1)}
              >
                +
              </button>
            </div>
          </div>

          {additionals.length > 0 && (
            <div>
              {/* Mesmo toggle minimizado/expansível pedido pelo cliente (ver tela interna
                  abaixo) — só com o visual em cards brancos do site público. */}
              <button
                type="button"
                onClick={() => setShowAdditionals((v) => !v)}
                className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-[13.5px] font-bold transition ${
                  showAdditionals ? 'bg-white text-brand' : 'bg-white text-[#6B4A78]'
                }`}
              >
                {showAdditionals ? 'Adicionais' : 'Adicionais (opcional)'}
                {showAdditionals ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {showAdditionals && (
                <div className="mt-2 flex flex-col gap-2">
                  {additionals.map((a) => {
                    const on = selectedAdditionals.includes(a.id);
                    return (
                      <button
                        key={a.id}
                        onClick={() =>
                          setSelectedAdditionals(on ? selectedAdditionals.filter((x) => x !== a.id) : [...selectedAdditionals, a.id])
                        }
                        className={`flex w-full items-center justify-between rounded-2xl border-2 bg-white px-4 py-3 text-left transition ${on ? 'border-brand' : 'border-white'}`}
                      >
                        <span className="text-[14px] font-bold text-[#1E1024]">{a.name}</span>
                        <span className="flex items-center gap-2.5">
                          <span className="text-[12px] text-[#6B4A78]">+{brl(a.price)}</span>
                          <span
                            className={`flex h-[22px] w-[22px] items-center justify-center rounded-[7px] ${on ? 'bg-brand' : 'border-2 border-brand-100'}`}
                          >
                            {on && <Check size={13} strokeWidth={3.5} className="text-white" />}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div>
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#6B4A78]">Observações (opcional)</div>
            <textarea
              className="w-full rounded-2xl border-2 border-brand-100 bg-white px-4 py-3 text-[14px] text-[#1E1024] outline-none transition focus:border-brand"
              rows={2}
              placeholder="Sem açúcar, muito gelo, pouco gelo..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="sticky bottom-0 -mx-1 bg-brand-50 px-1 pb-1 pt-2">
            <button
              className="flex w-full items-center justify-center gap-2 rounded-full bg-brand px-6 py-4 text-[16px] font-extrabold text-white shadow-[0_6px_0_var(--brand-700,#5e0f78)] transition active:translate-y-[3px] active:shadow-[0_3px_0_var(--brand-700,#5e0f78)]"
              onClick={confirm}
            >
              <Check size={17} /> Adicionar ao pedido
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <button
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          onClick={() => (standaloneChosen ? setStandaloneChosen(null) : setBase(null))}
        >
          <ChevronLeft size={16} /> {standaloneChosen ? 'Voltar' : 'Trocar base'}
        </button>
        <div className="border-b border-gray-200 pb-3.5 dark:border-gray-800">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Seu suco</div>
          {isCombo ? (
            <>
              <div className="mt-0.5 text-[15px] font-semibold text-gray-900 dark:text-gray-100">
                {selectedFruits.map((f) => f.fruit).join(' + ')} <span className="font-normal text-gray-400">({base})</span>
              </div>
              <ul className="mt-1.5 space-y-0.5 text-xs text-gray-500">
                {effectiveProducts.map((p) => {
                  const fruitName = p.name.match(FRUIT_BASE_RE)?.[1] ?? p.name;
                  return (
                    <li key={p.id} className="flex items-center gap-1.5">
                      <span>
                        {fruitName} — {brl(p.price)}
                        {p.id === primary.id && <span className="text-brand"> (preço base)</span>}
                      </span>
                      <button onClick={() => removeFruit(fruitName)} className="-m-1.5 p-1.5 text-gray-400 hover:text-red-500" title="Remover fruta">
                        <X size={12} />
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-1.5 text-sm text-brand">
                {brl(primary.price)} + {brl(comboExtra)} fruta extra = <strong>{brl(totalUnitPrice)}</strong>
              </div>
            </>
          ) : (
            <div className="mt-0.5 flex items-baseline justify-between">
              <span className="text-[15px] font-semibold text-gray-900 dark:text-gray-100">{primary.name}</span>
              <span className="text-sm text-brand">{brl(primary.price)}</span>
            </div>
          )}
        </div>

        {!standaloneChosen && candidatesToAdd.length > 0 && selectedFruits.length < MAX_FRUITS && (
          <button
            className="-mx-1 flex items-center gap-1.5 px-1 py-2 text-sm font-medium text-brand"
            onClick={() => setAddingFruit(true)}
          >
            <Plus size={14} /> Adicionar outra fruta (+{brl(EXTRA_FRUIT_PRICE)})
          </button>
        )}

        <div className="flex items-center justify-between border-b border-gray-200 py-2.5 dark:border-gray-800">
          <span className="text-[15px] font-semibold text-gray-900 dark:text-gray-100">Quantidade</span>
          <div className="flex items-center gap-2">
            <button
              className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-300 text-base font-bold text-gray-700 active:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:active:bg-gray-800"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            >
              –
            </button>
            <span className="w-6 text-center text-base font-bold text-gray-900 dark:text-gray-100">{quantity}</span>
            <button
              className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-base font-bold text-white active:bg-brand-600"
              onClick={() => setQuantity((q) => q + 1)}
            >
              +
            </button>
          </div>
        </div>

        {additionals.length > 0 && (
          <div>
            {/* Botão fica visível aberto ou fechado — pedido explícito do cliente: depois de
                clicar pra ver os adicionais, precisa dar pra minimizar de novo clicando nele
                outra vez, não só abrir uma vez sem volta. */}
            <button
              type="button"
              onClick={() => setShowAdditionals((v) => !v)}
              className={`flex w-full items-center justify-between rounded-2xl border px-3.5 py-3 text-left text-[13.5px] font-semibold transition ${
                showAdditionals
                  ? 'border-brand text-brand'
                  : 'border-gray-200 text-gray-600 hover:border-brand hover:text-brand dark:border-gray-700 dark:text-gray-300'
              }`}
            >
              {showAdditionals ? 'Adicionais' : 'Adicionais (opcional)'}
              {showAdditionals ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {showAdditionals && (
              <div className="mt-2 space-y-2">
                {additionals.map((a) => {
                  const on = selectedAdditionals.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      onClick={() =>
                        setSelectedAdditionals(on ? selectedAdditionals.filter((x) => x !== a.id) : [...selectedAdditionals, a.id])
                      }
                      className={`flex w-full items-center justify-between py-3 text-left ${ITEM_ROW}`}
                    >
                      <span className="text-[14px] font-medium text-gray-900 dark:text-gray-100">{a.name}</span>
                      <span className="flex items-center gap-3">
                        <span className="text-xs text-gray-400">+{brl(a.price)}</span>
                        <span
                          className={`flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border ${on ? 'border-brand bg-brand' : 'border-gray-300 dark:border-gray-600'}`}
                        >
                          {on && <Check size={12} strokeWidth={3.5} className="text-white" />}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div>
          <label className="label">Observações (opcional)</label>
          <textarea
            className="input"
            rows={2}
            placeholder="Sem açúcar, muito gelo, pouco gelo..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="sticky bottom-0 -mx-1 bg-white px-1 pb-1 pt-2 dark:bg-gray-900">
          <button className="btn-primary w-full !py-3" onClick={confirm}>
            <Check size={16} /> Adicionar ao pedido
          </button>
        </div>
      </div>
    );
  }

  // Etapa 2: fruta(s) escolhida(s) — selecionar a base (comum a todas elas).
  if (selectedFruits.length > 0) {
    return (
      <div className="space-y-4">
        <button className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700" onClick={() => setSelectedFruits([])}>
          <ChevronLeft size={16} /> Trocar fruta
        </button>
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          {selectedFruits.map((f) => f.fruit).join(' + ')} — escolha a base
        </div>
        {commonBases.length === 0 ? (
          <p className="text-sm text-gray-500">
            Essas frutas não têm nenhuma base em comum. Volte e escolha outra combinação.
          </p>
        ) : (
          <div className="space-y-2">
            {commonBases.map((baseName) => {
              const preview = selectedFruits.map((f) => f.bases.find((b) => b.base === baseName)!.product);
              const previewPrice = Math.max(...preview.map((p) => p.price)) + (preview.length > 1 ? EXTRA_FRUIT_PRICE * (preview.length - 1) : 0);
              return (
                <button
                  key={baseName}
                  onClick={() => setBase(baseName)}
                  className={
                    isPublic
                      ? `flex w-full items-center justify-between py-3.5 text-left ${PUBLIC_ITEM_ROW}`
                      : `flex w-full items-center justify-between py-3.5 text-left transition hover:border-brand hover:text-brand ${ITEM_ROW}`
                  }
                >
                  <span className={isPublic ? PUBLIC_ITEM_TEXT : 'text-[15px] font-medium text-gray-900 dark:text-gray-100'}>{baseName}</span>
                  <span className="flex items-center gap-2.5">
                    <span className={isPublic ? PUBLIC_ITEM_TEXT : 'text-sm text-gray-400'}>{brl(previewPrice)}</span>
                    <ChevronRight size={18} className={isPublic ? 'text-[#C9A9D6]' : 'text-gray-300'} />
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Etapa 1: escolher a fruta — um toque já avança pra escolha da base (fluxo rápido).
  // Combinar com outra fruta é oferecido depois, na revisão (etapa 3).
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Escolha a fruta</div>
        {/* Sem scroll próprio aqui de propósito — pedido explícito do cliente: isso criava
            uma "caixa" branca de altura fixa (38vh) dentro do scroll já existente do
            catálogo (ver OrderComposer.tsx), cortando a visualização dos sabores mesmo
            quando sobrava espaço. A lista agora flui livre dentro do scroll do catálogo,
            igual já funciona na aba de comidas. */}
        <div className="space-y-2">
          {fruits.map((f) => (
            <button
              key={f.fruit}
              onClick={() => setSelectedFruits([f])}
              className={
                isPublic
                  ? `flex w-full items-center justify-between py-3.5 text-left ${PUBLIC_ITEM_TEXT} ${PUBLIC_ITEM_ROW}`
                  : `flex w-full items-center justify-between py-3.5 text-left text-[15px] font-medium text-gray-900 transition hover:border-brand hover:text-brand dark:text-gray-100 ${ITEM_ROW}`
              }
            >
              {f.fruit}
              <ChevronRight size={18} className={isPublic ? 'text-[#C9A9D6]' : 'text-gray-300'} />
            </button>
          ))}
        </div>
      </div>

      {standalone.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Sabores especiais</div>
          <div className="space-y-2">
            {standalone.map((p) => (
              <button
                key={p.id}
                onClick={() => setStandaloneChosen(p)}
                className={
                  isPublic
                    ? `flex w-full items-center justify-between py-3 text-left ${PUBLIC_ITEM_ROW}`
                    : `flex w-full items-center justify-between py-3 text-left transition hover:border-brand hover:text-brand ${ITEM_ROW}`
                }
              >
                <span>
                  <span className={isPublic ? `block ${PUBLIC_ITEM_TEXT}` : 'block text-[15px] font-medium text-gray-900 dark:text-gray-100'}>{p.name}</span>
                  <span className={isPublic ? `mt-0.5 block ${PUBLIC_ITEM_TEXT}` : 'mt-0.5 block text-xs text-gray-400'}>{brl(p.price)}</span>
                </span>
                <ChevronRight size={18} className={isPublic ? 'text-[#C9A9D6]' : 'text-gray-300'} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
