import { env } from '../../config/env';
import { AppError } from '../../utils/errors';

/**
 * Fina camada sobre as APIs REST do Google Maps (Places New + Distance Matrix legada) —
 * primeira chamada HTTP a um serviço externo neste backend. Usa o `fetch` nativo do
 * Node 22 (sem nova dependência), com timeout via AbortController. Erros do Google nunca
 * vazam pro cliente final — sempre viram um AppError genérico em português.
 */

const AUTOCOMPLETE_URL = 'https://places.googleapis.com/v1/places:autocomplete';
const PLACE_DETAILS_URL = 'https://places.googleapis.com/v1/places';
const DISTANCE_MATRIX_URL = 'https://maps.googleapis.com/maps/api/distancematrix/json';
const TIMEOUT_MS = 5_000;

export interface PlaceSuggestion {
  placeId: string;
  description: string;
}

export interface PlaceDetails {
  lat: number;
  lng: number;
  formattedAddress: string;
}

interface AutocompleteResponse {
  suggestions?: { placePrediction?: { placeId: string; text: { text: string } } }[];
}
interface PlaceDetailsResponse {
  location?: { latitude: number; longitude: number };
  formattedAddress?: string;
}
interface DistanceMatrixResponse {
  rows?: { elements?: { status: string; distance?: { value: number } }[] }[];
}

function apiKey(): string {
  if (!env.googleMaps.apiKey) {
    throw new AppError('Busca de endereço não está configurada para este restaurante.', 503, 'MAPS_NOT_CONFIGURED');
  }
  return env.googleMaps.apiKey;
}

async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fn(controller.signal);
  } catch {
    throw new AppError('Não foi possível consultar o endereço agora. Tente novamente.', 502, 'MAPS_UPSTREAM_ERROR');
  } finally {
    clearTimeout(timer);
  }
}

export const googleMapsClient = {
  async autocompleteAddress(input: string, sessionToken: string): Promise<PlaceSuggestion[]> {
    const key = apiKey();
    return withTimeout(async (signal) => {
      const res = await fetch(AUTOCOMPLETE_URL, {
        method: 'POST',
        signal,
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text',
        },
        body: JSON.stringify({ input, sessionToken }),
      });
      if (!res.ok) throw new Error(`autocomplete ${res.status}`);
      const data = (await res.json()) as AutocompleteResponse;
      const suggestions = data.suggestions ?? [];
      return suggestions
        .filter((s): s is Required<AutocompleteResponse>['suggestions'][number] => !!s.placePrediction)
        .map((s) => ({
          placeId: s.placePrediction!.placeId,
          description: s.placePrediction!.text.text,
        }));
    });
  },

  async getPlaceDetails(placeId: string, sessionToken: string): Promise<PlaceDetails> {
    const key = apiKey();
    return withTimeout(async (signal) => {
      const url = `${PLACE_DETAILS_URL}/${encodeURIComponent(placeId)}?sessionToken=${encodeURIComponent(sessionToken)}`;
      const res = await fetch(url, {
        signal,
        headers: {
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': 'location,formattedAddress',
        },
      });
      if (!res.ok) throw new Error(`place details ${res.status}`);
      const data = (await res.json()) as PlaceDetailsResponse;
      if (!data.location) throw new Error('place details missing location');
      return {
        lat: data.location.latitude,
        lng: data.location.longitude,
        formattedAddress: data.formattedAddress ?? '',
      };
    });
  },

  async distanceKm(origin: { lat: number; lng: number }, destination: { lat: number; lng: number }): Promise<number> {
    const key = apiKey();
    return withTimeout(async (signal) => {
      const params = new URLSearchParams({
        origins: `${origin.lat},${origin.lng}`,
        destinations: `${destination.lat},${destination.lng}`,
        units: 'metric',
        key,
      });
      const res = await fetch(`${DISTANCE_MATRIX_URL}?${params.toString()}`, { signal });
      if (!res.ok) throw new Error(`distance matrix ${res.status}`);
      const data = (await res.json()) as DistanceMatrixResponse;
      const element = data.rows?.[0]?.elements?.[0];
      if (!element || element.status !== 'OK' || !element.distance) throw new Error('distance matrix element not OK');
      return element.distance.value / 1000;
    });
  },
};
