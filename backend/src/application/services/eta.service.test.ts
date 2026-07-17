import { describe, expect, it } from 'vitest';
import { etaService } from './eta.service';

describe('etaService.extraForQueue', () => {
  it('adds nothing while the queue is small (up to 5 active orders)', () => {
    expect(etaService.extraForQueue(0)).toBe(0);
    expect(etaService.extraForQueue(5)).toBe(0);
  });

  it('adds 15min once the queue passes 5 and up to 10', () => {
    expect(etaService.extraForQueue(6)).toBe(15);
    expect(etaService.extraForQueue(10)).toBe(15);
  });

  it('adds 30min once the queue passes 10 and up to 20', () => {
    expect(etaService.extraForQueue(11)).toBe(30);
    expect(etaService.extraForQueue(20)).toBe(30);
  });

  it('caps at 45min extra once the queue passes 20', () => {
    expect(etaService.extraForQueue(21)).toBe(45);
    expect(etaService.extraForQueue(1000)).toBe(45);
  });
});
