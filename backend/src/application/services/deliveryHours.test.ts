import { describe, expect, it } from 'vitest';
import { isDeliveryClosed, isOrderingClosed } from './deliveryHours';

// Horários em UTC; São Paulo é UTC-3 (sem horário de verão desde 2019).
// 18:00 SP = 21:00Z · 23:00 SP = 02:00Z · 23:15 SP = 02:15Z
describe('entrega das 18h às 23h (fuso de São Paulo)', () => {
  it('17:59 em SP ainda não aceita entrega', () => {
    expect(isDeliveryClosed(new Date('2026-10-30T20:59:00Z'))).toBe(true);
  });
  it('18:00 em ponto aceita entrega', () => {
    expect(isDeliveryClosed(new Date('2026-10-30T21:00:00Z'))).toBe(false);
  });
  it('22:59 em SP ainda aceita entrega', () => {
    expect(isDeliveryClosed(new Date('2026-10-31T01:59:00Z'))).toBe(false);
  });
  it('23:00 em SP fecha a entrega', () => {
    expect(isDeliveryClosed(new Date('2026-10-31T02:00:00Z'))).toBe(true);
  });
  it('madrugada e manhã continuam sem entrega', () => {
    expect(isDeliveryClosed(new Date('2026-10-31T05:30:00Z'))).toBe(true);
    expect(isDeliveryClosed(new Date('2026-10-31T15:00:00Z'))).toBe(true);
  });
});

describe('retirada das 18h às 23:15 (fuso de São Paulo)', () => {
  it('17:59 em SP ainda não aceita pedido', () => {
    expect(isOrderingClosed(new Date('2026-10-30T20:59:00Z'))).toBe(true);
  });
  it('18:00 em ponto já aceita pedido', () => {
    expect(isOrderingClosed(new Date('2026-10-30T21:00:00Z'))).toBe(false);
  });
  it('23:00 a 23:14 em SP ainda aceita retirada', () => {
    expect(isOrderingClosed(new Date('2026-10-31T02:00:00Z'))).toBe(false);
    expect(isOrderingClosed(new Date('2026-10-31T02:14:00Z'))).toBe(false);
  });
  it('23:15 em SP fecha tudo', () => {
    expect(isOrderingClosed(new Date('2026-10-31T02:15:00Z'))).toBe(true);
  });
  it('madrugada (02:30 em SP) e meio-dia continuam fechados', () => {
    expect(isOrderingClosed(new Date('2026-10-31T05:30:00Z'))).toBe(true);
    expect(isOrderingClosed(new Date('2026-10-31T15:00:00Z'))).toBe(true);
  });
  it('não depende do relógio do servidor: 21:00Z é 18h em SP', () => {
    expect(isOrderingClosed(new Date('2026-11-01T21:30:00Z'))).toBe(false);
  });
});
