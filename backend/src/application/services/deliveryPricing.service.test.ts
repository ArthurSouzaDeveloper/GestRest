import { describe, expect, it } from 'vitest';
import { resolveBand } from './deliveryPricing.service';

describe('resolveBand', () => {
  const bands = [
    { maxDistanceKm: 6, fee: 8 },
    { maxDistanceKm: 3, fee: 5 },
    { maxDistanceKm: 10, fee: 12 },
  ];

  it('picks the smallest band whose max distance covers the given distance', () => {
    expect(resolveBand(bands, 1)?.fee).toBe(5);
    expect(resolveBand(bands, 3)?.fee).toBe(5);
    expect(resolveBand(bands, 3.01)?.fee).toBe(8);
    expect(resolveBand(bands, 6)?.fee).toBe(8);
    expect(resolveBand(bands, 9)?.fee).toBe(12);
    expect(resolveBand(bands, 10)?.fee).toBe(12);
  });

  it('returns undefined when the distance exceeds every band (out of delivery range)', () => {
    expect(resolveBand(bands, 10.01)).toBeUndefined();
  });

  it('returns undefined when there are no bands configured', () => {
    expect(resolveBand([], 1)).toBeUndefined();
  });

  it('does not mutate the input array order', () => {
    const input = [{ maxDistanceKm: 6, fee: 8 }, { maxDistanceKm: 3, fee: 5 }];
    resolveBand(input, 1);
    expect(input[0].maxDistanceKm).toBe(6);
  });
});
