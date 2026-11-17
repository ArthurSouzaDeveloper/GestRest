/**
 * Sugere os insumos (ingredientes) de cada produto a partir do texto do cardápio, sem tocar
 * no banco. Usado pelo script `suggest-ingredients-rei-do-suco` (modo simulação por padrão).
 *
 * Duas fontes:
 *  - A DESCRIÇÃO/receita ("frango, creme de milho, queijo e ovo"): cada item vira um insumo
 *    "dá pra tirar" (em falta, o produto continua à venda sem ele).
 *  - A BASE do suco no fim do nome ("Morango (Laranja)"): vira insumo essencial (sem a base,
 *    o suco não existe, então some do cardápio).
 *
 * A mesma ideia de "palavra inteira, sem acento" vive no frontend
 * (frontend/src/lib/ingredientMatch.ts); aqui é uma cópia pequena de propósito, porque os
 * dois pacotes não compartilham código.
 */

export const normalizeText = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Bases/opções que não são insumo de estoque ("Açaí 300ml (Puro)"). */
const NOT_INGREDIENTS = new Set(['agua', 'puro']);

/** Itens da receita: "140g salmão, cream cheese e gergelim" → ["salmão", "cream cheese", "gergelim"]. */
export function extractIngredientsFromDescription(description?: string | null): string[] {
  if (!description) return [];
  // Tudo depois de um travessão é observação ("— servido no prato com talheres").
  const main = description.split(/[—–]/)[0].replace(/\([^)]*\)/g, ' ');
  const out = new Map<string, string>();
  for (const raw of main.split(/,|;|\s+e\s+/i)) {
    const item = raw
      .replace(/^\s*\d+([.,]\d+)?\s*(g|kg|ml|l|un|unidades?)\b\s*(de\s+)?/i, '')
      .replace(/^com\s+/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    const key = normalizeText(item);
    // Frases longas costumam ser instrução ("3 bolas de açaí em cima do pastel"), não insumo.
    if (key.length < 3 || item.split(' ').length > 3 || NOT_INGREDIENTS.has(key)) continue;
    if (!out.has(key)) out.set(key, item.charAt(0).toUpperCase() + item.slice(1));
  }
  return [...out.values()];
}

/** "Morango (Laranja)" → "Laranja". Parênteses com vírgula (lista de frutas) não contam. */
export function extractJuiceBase(productName: string): string | null {
  const base = productName.match(/\(([^()]+)\)\s*$/)?.[1]?.trim();
  if (!base || base.includes(',') || NOT_INGREDIENTS.has(normalizeText(base))) return null;
  return base;
}

export interface SuggestedIngredient {
  /** Nome pra criar o insumo (primeira grafia encontrada). */
  name: string;
  /** Produtos em que é essencial (some do cardápio quando acabar). */
  essentialProductIds: string[];
  /** Produtos em que dá pra tirar. */
  optionalProductIds: string[];
  count: number;
}

export function suggestIngredientsFromMenu(
  // Montáveis ("Monte o Seu") têm só instrução na descrição, não receita: ficam de fora.
  products: { id: string; name: string; description?: string | null; isCustom?: boolean }[],
  opts: { min?: number; only?: string[] } = {},
): SuggestedIngredient[] {
  const min = opts.min ?? 2;
  const only = opts.only?.length ? new Set(opts.only.map(normalizeText)) : null;
  const byKey = new Map<string, SuggestedIngredient>();
  const touch = (name: string) => {
    const key = normalizeText(name);
    let s = byKey.get(key);
    if (!s) byKey.set(key, (s = { name, essentialProductIds: [], optionalProductIds: [], count: 0 }));
    return s;
  };

  for (const p of products) {
    if (p.isCustom) continue;
    const base = extractJuiceBase(p.name);
    if (base) touch(base).essentialProductIds.push(p.id);
    for (const item of extractIngredientsFromDescription(p.description)) {
      // Se a base do suco e a receita citam o mesmo insumo, vale o essencial.
      if (base && normalizeText(base) === normalizeText(item)) continue;
      touch(item).optionalProductIds.push(p.id);
    }
  }

  return [...byKey.entries()]
    .map(([, s]) => ({ ...s, count: s.essentialProductIds.length + s.optionalProductIds.length }))
    .filter((s) => s.count >= min && (!only || only.has(normalizeText(s.name))))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'pt-BR'));
}
