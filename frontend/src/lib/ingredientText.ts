/**
 * Itens da receita: "140g salmão, cream cheese e gergelim" → ["Salmão", "Cream cheese", "Gergelim"].
 * Mesma regra do script de sugestão do backend (backend/src/application/services/
 * ingredientSuggestions.ts); é uma cópia pequena de propósito, porque os pacotes não
 * compartilham código.
 */
export function extractIngredientsFromDescription(description?: string | null): string[] {
  if (!description) return [];
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  // Tudo depois de um travessão é observação ("— servido no prato com talheres").
  const main = description.split(/[—–]/)[0].replace(/\([^)]*\)/g, ' ');
  const out = new Map<string, string>();
  for (const raw of main.split(/,|;|\s+e\s+/i)) {
    const item = raw
      .replace(/^\s*\d+([.,]\d+)?\s*(g|kg|ml|l|un|unidades?)\b\s*(de\s+)?/i, '')
      .replace(/^com\s+/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    const key = norm(item);
    // Frases longas costumam ser instrução ("3 bolas de açaí em cima do pastel"), não insumo.
    if (key.length < 3 || item.split(' ').length > 3 || key === 'agua' || key === 'puro') continue;
    if (!out.has(key)) out.set(key, item.charAt(0).toUpperCase() + item.slice(1));
  }
  return [...out.values()];
}
