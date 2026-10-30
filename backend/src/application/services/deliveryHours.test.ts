import { describe, expect, it } from 'vitest';
import { isDeliveryClosed } from './deliveryHours';

// Horários em UTC; São Paulo é UTC-3 (sem horário de verão desde 2019).
describe('corte noturno da entrega (fuso de São Paulo)', () => {
  it('22:59 em SP ainda aceita entrega', () => {
    expect(isDeliveryClosed(new Date('2026-10-30T01:59:00Z'))).toBe(false);
  });
  it('23:00 em SP já é só retirada', () => {
    expect(isDeliveryClosed(new Date('2026-10-30T02:00:00Z'))).toBe(true);
  });
  it('madrugada (02:30 em SP) continua só retirada', () => {
    expect(isDeliveryClosed(new Date('2026-10-30T05:30:00Z'))).toBe(true);
  });
  it('06:00 em SP volta a aceitar entrega', () => {
    expect(isDeliveryClosed(new Date('2026-10-30T09:00:00Z'))).toBe(false);
  });
  it('meio-dia em SP aceita entrega (mesmo sendo 15h em UTC)', () => {
    expect(isDeliveryClosed(new Date('2026-10-30T15:00:00Z'))).toBe(false);
  });
});
