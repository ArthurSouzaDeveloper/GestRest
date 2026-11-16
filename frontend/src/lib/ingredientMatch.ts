/**
 * Ajuda a cadastrar insumos sem revisar o cardápio inteiro na mão.
 *
 * - `matchIngredient` acha onde o insumo aparece: no NOME do produto (ex.: "Morango
 *   (Laranja)", pastel "Milho") ou só na DESCRIÇÃO/receita (ex.: Caipira: "frango, creme
 *   de milho, queijo...") ou num nome que já é a receita ("Frango, Mussarela, Milho e
 *   Ervilha"). Quem tem no nome é o próprio item, então some do cardápio;
 *   quem só tem na receita costuma dar pra tirar (sai "SEM MILHO" na cozinha).
 * - A busca é por palavra inteira, sem acento e aceitando plural: "ovo" acha "ovo
 *   frito" mas não "Ovomaltine"; "tomate" acha "tomates".
 * - `suggestIngredients` lista os insumos mais prováveis do próprio cardápio (nomes dos
 *   adicionais e das bases dos sucos), ordenados por quantos itens levam cada um.
 */
import type { Additional, Product } from '../types';

/** Sem acento e minúsculo, pra "laranja" achar "Laranja" e "LARANJA". */
export const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Regex de palavra inteira (com plural simples) pro termo já normalizado. */
function wordRe(term: string) {
  // "tomates" também acha "tomate" (o plural do texto já é aceito pelo (s|es)? do fim).
  const singular = term.length > 3 && term.endsWith('s') ? term.slice(0, -1) : term;
  const words = singular.trim().split(/\s+/).map(escapeRe).join('\\s+');
  return new RegExp(`(^|[^a-z0-9])${words}(s|es)?($|[^a-z0-9])`);
}

export type MatchSource = 'name' | 'description';

export interface IngredientMatches {
  /** id do produto → onde o insumo apareceu. */
  products: Map<string, MatchSource>;
  additionalIds: Set<string>;
}

export function matchIngredient(name: string, products: Product[], additionals: Additional[]): IngredientMatches {
  const term = norm(name).trim();
  const out: IngredientMatches = { products: new Map(), additionalIds: new Set() };
  if (term.length < 2) return out;
  const re = wordRe(term);
  for (const p of products) {
    const n = norm(p.name);
    // Nome que é a própria receita ("Frango, Mussarela, Milho e Ervilha") conta como
    // receita: o insumo é um entre vários, então dá pra tirar.
    const nameIsRecipe = n.replace(/\([^()]*\)/g, '').includes(',');
    if (re.test(n)) out.products.set(p.id, nameIsRecipe ? 'description' : 'name');
    else if (p.description && re.test(norm(p.description))) out.products.set(p.id, 'description');
  }
  for (const a of additionals) if (re.test(norm(a.name))) out.additionalIds.add(a.id);
  return out;
}

/** "Vinagrete 200ml" → "Vinagrete"; "Bis (2 unidades) — Preto ou Branco" → "Bis". */
function cleanCandidate(raw: string) {
  return raw
    .split(/[—–(]/)[0]
    .replace(/\b\d+\s*(ml|l|g|kg|un|unidades?)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface IngredientSuggestion {
  name: string;
  /** Quantos produtos + sabores/adicionais seriam marcados. */
  count: number;
}

/** Aparecem como "base" dos sucos mas não fazem sentido como insumo em falta. */
const NOT_INGREDIENTS = new Set(['agua']);

export function suggestIngredients(
  products: Product[],
  additionals: Additional[],
  existingNames: string[],
  limit = 12,
): IngredientSuggestion[] {
  const taken = new Set([...NOT_INGREDIENTS, ...existingNames.map((n) => norm(n).trim())]);
  const candidates = new Map<string, string>(); // normalizado → como mostrar
  const add = (raw: string) => {
    const name = cleanCandidate(raw);
    const key = norm(name);
    if (name.length < 3 || name.length > 24 || taken.has(key) || candidates.has(key)) return;
    candidates.set(key, name);
  };
  for (const a of additionals) add(a.name);
  // Bases dos sucos: "Morango (Laranja)" → "Laranja".
  for (const p of products) {
    const base = p.name.match(/\(([^()]+)\)\s*$/)?.[1];
    if (base && !base.includes(',')) add(base);
  }

  const scored: IngredientSuggestion[] = [];
  for (const name of candidates.values()) {
    const m = matchIngredient(name, products, additionals);
    // Só vale sugerir se aparece em produto (não só no próprio adicional).
    if (m.products.size === 0) continue;
    scored.push({ name, count: m.products.size + m.additionalIds.size });
  }
  return scored.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'pt-BR')).slice(0, limit);
}
