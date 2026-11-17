import { useState } from 'react';
import { X } from 'lucide-react';
import { extractIngredientsFromDescription } from '../lib/ingredientText';
import { norm } from '../lib/ingredientMatch';

export interface ProductIngredient {
  name: string;
  /** "Dá pra tirar": em falta, o produto continua à venda sem ele. Senão, some do cardápio. */
  optional: boolean;
}

/**
 * Ingredientes do produto, no próprio cadastro dele. O admin digita (ou escolhe um insumo
 * que já existe) e o insumo é criado/reaproveitado ao salvar. "Sugerir pela descrição" lê
 * a receita ("frango, milho e ovo") e já propõe tudo como "dá pra tirar".
 */
export function ProductIngredientsField({
  value,
  onChange,
  description,
  knownNames,
}: {
  value: ProductIngredient[];
  onChange: (next: ProductIngredient[]) => void;
  description: string;
  knownNames: string[];
}) {
  const [draft, setDraft] = useState('');
  const has = (name: string) => value.some((i) => norm(i.name) === norm(name));

  const add = (name: string, optional = false) => {
    const clean = name.trim();
    if (clean.length < 2 || has(clean)) return;
    // Mantém a grafia do insumo que já existe ("milho" → "Milho").
    const known = knownNames.find((k) => norm(k) === norm(clean));
    onChange([...value, { name: known ?? clean, optional }]);
  };

  const fromDescription = extractIngredientsFromDescription(description).filter((n) => !has(n));

  return (
    <div>
      <label className="label">Ingredientes</label>
      <p className="mb-2 text-xs text-gray-500">
        Se um ingrediente acabar, o produto pode <b>sumir do cardápio</b> (não existe sem ele) ou <b>dá pra tirar</b>
        (continua à venda e sai "SEM ..." na cozinha).
      </p>
      {value.length > 0 && (
        <ul className="mb-2 space-y-1">
          {value.map((i) => (
            <li key={i.name} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{i.name}</span>
              <select
                className={`rounded border px-1.5 py-0.5 text-xs dark:bg-gray-900 ${
                  i.optional ? 'border-amber-300 text-amber-700' : 'border-red-200 text-red-700'
                }`}
                value={i.optional ? 'optional' : 'essential'}
                onChange={(e) =>
                  onChange(value.map((x) => (x.name === i.name ? { ...x, optional: e.target.value === 'optional' } : x)))
                }
              >
                <option value="essential">Some do cardápio</option>
                <option value="optional">Dá pra tirar</option>
              </select>
              <button type="button" className="text-gray-400 hover:text-red-600" title="Tirar da lista" onClick={() => onChange(value.filter((x) => x.name !== i.name))}>
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          className="input"
          list="known-ingredients"
          placeholder="Ex.: Milho"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add(draft);
              setDraft('');
            }
          }}
        />
        <datalist id="known-ingredients">
          {knownNames.filter((n) => !has(n)).map((n) => <option key={n} value={n} />)}
        </datalist>
        <button type="button" className="btn-secondary shrink-0" disabled={draft.trim().length < 2} onClick={() => { add(draft); setDraft(''); }}>
          Adicionar
        </button>
      </div>
      {fromDescription.length > 0 && (
        <button
          type="button"
          className="mt-2 text-xs text-brand-600 hover:underline"
          onClick={() => onChange([...value, ...fromDescription.map((name) => ({ name: knownNames.find((k) => norm(k) === norm(name)) ?? name, optional: true }))])}
        >
          Sugerir pela descrição: {fromDescription.join(', ')}
        </button>
      )}
    </div>
  );
}
