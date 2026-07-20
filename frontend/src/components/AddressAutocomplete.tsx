import { useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Loader2, MapPin } from 'lucide-react';
import api from '../lib/api';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import type { PlaceDetails, PlaceSuggestion } from '../types';

/**
 * Campo de endereço com sugestões do Google Places (New), via o proxy público
 * `/public/:slug/places/*` — a chave da API nunca chega no navegador. Reaproveitável em
 * qualquer tela que precise resolver um endereço pra lat/lng (hoje só o site público, mas
 * o mesmo componente serve pro admin quando ele também passar a usar autocomplete).
 */
export default function AddressAutocomplete({
  slug,
  placeholder,
  inputClassName,
  onSelect,
}: {
  slug: string;
  placeholder?: string;
  inputClassName?: string;
  onSelect: (place: PlaceDetails) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  // Um "sessionToken" agrupa as chamadas de autocomplete + o detalhe final que a fecha —
  // é o que dá o preço de sessão (mais barato) do Google em vez de cobrar por chamada
  // avulsa. Troca pra um novo a cada endereço resolvido, pra não misturar sessões.
  const sessionToken = useRef(crypto.randomUUID());
  const debouncedQuery = useDebouncedValue(query, 350);

  const { data: suggestions = [], isFetching } = useQuery({
    queryKey: ['places-autocomplete', slug, debouncedQuery, sessionToken.current],
    queryFn: async () =>
      (
        await api.get<PlaceSuggestion[]>(`/public/${slug}/places/autocomplete`, {
          params: { input: debouncedQuery, sessionToken: sessionToken.current },
        })
      ).data,
    enabled: open && debouncedQuery.trim().length >= 3,
  });

  const pickPlace = useMutation({
    mutationFn: async (placeId: string) =>
      (
        await api.get<PlaceDetails>(`/public/${slug}/places/details`, {
          params: { placeId, sessionToken: sessionToken.current },
        })
      ).data,
    onSuccess: (details) => {
      setQuery(details.formattedAddress);
      setOpen(false);
      sessionToken.current = crypto.randomUUID();
      onSelect(details);
    },
  });

  const showDropdown = open && debouncedQuery.trim().length >= 3 && (suggestions.length > 0 || isFetching);

  return (
    <div className="relative">
      <input
        className={inputClassName}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {showDropdown && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-[11px] border border-[#351C4D]/[0.15] bg-white shadow-lg">
          {isFetching && suggestions.length === 0 && (
            <div className="flex items-center gap-2 p-3 text-xs text-gray-400">
              <Loader2 size={13} className="animate-spin" /> Buscando endereço...
            </div>
          )}
          {suggestions.map((s) => (
            <button
              key={s.placeId}
              type="button"
              disabled={pickPlace.isPending}
              className="flex w-full items-start gap-2 border-b border-gray-100 p-2.5 text-left text-[12.5px] text-[#351C4D] last:border-b-0 hover:bg-gray-50 disabled:opacity-50"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pickPlace.mutate(s.placeId)}
            >
              <MapPin size={13} className="mt-0.5 shrink-0 text-[#6D2E9E]" />
              {s.description}
            </button>
          ))}
        </div>
      )}
      {pickPlace.isError && <p className="mt-1 text-[11px] text-red-600">Não foi possível buscar esse endereço. Tente de novo.</p>}
    </div>
  );
}
