import { describe, expect, it } from 'vitest';
import { isDeliveryClosed, isOrderingClosed } from './deliveryHours';

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

describe('abertura da loja às 18h (fuso de São Paulo)', () => {
  it('17:59 em SP ainda não aceita pedido', () => {
    expect(isOrderingClosed(new Date('2026-10-30T20:59:00Z'))).toBe(true);
  });
  it('18:00 em ponto em SP já aceita pedido', () => {
    expect(isOrderingClosed(new Date('2026-10-30T21:00:00Z'))).toBe(false);
  });
  it('23:30 em SP continua aberta (só retirada)', () => {
    expect(isOrderingClosed(new Date('2026-10-31T02:30:00Z'))).toBe(false);
  });
  it('madrugada (05:59 em SP) ainda aceita pedido', () => {
    expect(isOrderingClosed(new Date('2026-10-30T08:59:00Z'))).toBe(false);
  });
  it('06:00 em SP fecha até as 18h', () => {
    expect(isOrderingClosed(new Date('2026-10-30T09:00:00Z'))).toBe(true);
  });
  it('meio-dia em SP está fechada', () => {
    expect(isOrderingClosed(new Date('2026-10-30T15:00:00Z'))).toBe(true);
  });
});
