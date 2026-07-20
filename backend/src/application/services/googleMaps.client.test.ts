import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('googleMapsClient', () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.GOOGLE_MAPS_API_KEY;

  beforeEach(() => {
    vi.resetModules();
    process.env.GOOGLE_MAPS_API_KEY = 'test-key';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.GOOGLE_MAPS_API_KEY = originalKey;
  });

  it('throws MAPS_NOT_CONFIGURED when no API key is set, without ever calling fetch', async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    const { googleMapsClient } = await import('./googleMaps.client');

    await expect(googleMapsClient.distanceKm({ lat: 0, lng: 0 }, { lat: 1, lng: 1 })).rejects.toMatchObject({
      code: 'MAPS_NOT_CONFIGURED',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('parses distanceKm from a successful Distance Matrix response (meters -> km)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ rows: [{ elements: [{ status: 'OK', distance: { value: 4200 } }] }] }),
    }) as unknown as typeof fetch;
    const { googleMapsClient } = await import('./googleMaps.client');

    const km = await googleMapsClient.distanceKm({ lat: -22.74, lng: -47.36 }, { lat: -22.75, lng: -47.37 });
    expect(km).toBe(4.2);
  });

  it('wraps a failed Distance Matrix element (e.g. ZERO_RESULTS) into a generic AppError', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ rows: [{ elements: [{ status: 'ZERO_RESULTS' }] }] }),
    }) as unknown as typeof fetch;
    const { googleMapsClient } = await import('./googleMaps.client');

    await expect(googleMapsClient.distanceKm({ lat: 0, lng: 0 }, { lat: 1, lng: 1 })).rejects.toMatchObject({
      code: 'MAPS_UPSTREAM_ERROR',
    });
  });

  it('parses placeId + description from an autocomplete response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        suggestions: [
          { placePrediction: { placeId: 'abc123', text: { text: 'Rua das Flores, 100' } } },
          {},
        ],
      }),
    }) as unknown as typeof fetch;
    const { googleMapsClient } = await import('./googleMaps.client');

    const suggestions = await googleMapsClient.autocompleteAddress('Rua das Flores', 'session-1');
    expect(suggestions).toEqual([{ placeId: 'abc123', description: 'Rua das Flores, 100' }]);
  });

  it('parses lat/lng/formattedAddress from a Place Details response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        location: { latitude: -22.75, longitude: -47.37 },
        formattedAddress: 'Rua das Flores, 100 - Centro',
      }),
    }) as unknown as typeof fetch;
    const { googleMapsClient } = await import('./googleMaps.client');

    const details = await googleMapsClient.getPlaceDetails('abc123', 'session-1');
    expect(details).toEqual({ lat: -22.75, lng: -47.37, formattedAddress: 'Rua das Flores, 100 - Centro' });
  });

  it('wraps a network failure (fetch rejects) into a generic AppError', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
    const { googleMapsClient } = await import('./googleMaps.client');

    await expect(googleMapsClient.getPlaceDetails('abc123', 'session-1')).rejects.toMatchObject({
      code: 'MAPS_UPSTREAM_ERROR',
    });
  });
});
