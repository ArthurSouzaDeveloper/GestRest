import { describe, expect, it } from 'vitest';
import { AdditionalKind } from '@prisma/client';
import { assertCustomProductBase, computeTotals, type OrderWithRelations } from './order.helpers';

function makeOrder(overrides: Partial<OrderWithRelations> = {}): OrderWithRelations {
  const base = {
    discount: 0 as never,
    serviceRate: 10 as never,
    deliveryFee: 0 as never,
    payments: [] as never,
    items: [
      {
        quantity: 2,
        unitPrice: 10 as never,
        status: 'DONE',
        additionals: [{ price: 2.5 as never }],
      },
      {
        quantity: 1,
        unitPrice: 15 as never,
        status: 'WAITING',
        additionals: [] as never,
      },
    ],
  } as unknown as OrderWithRelations;
  return { ...base, ...overrides };
}

describe('computeTotals', () => {
  it('sums items + additionals and applies 10% service fee', () => {
    const t = computeTotals(makeOrder());
    // (10 + 2.5) * 2 = 25 ; + 15 = 40 subtotal
    expect(t.subtotal).toBe(40);
    expect(t.serviceFee).toBe(4); // 10% of 40
    expect(t.total).toBe(44);
    expect(t.remaining).toBe(44);
  });

  it('ignores cancelled items', () => {
    const order = makeOrder();
    order.items[1] = { ...order.items[1], status: 'CANCELLED' } as never;
    const t = computeTotals(order);
    expect(t.subtotal).toBe(25);
  });

  it('applies discount before the service fee', () => {
    const order = makeOrder({ discount: 10 as never });
    const t = computeTotals(order);
    expect(t.subtotal).toBe(40);
    expect(t.discount).toBe(10);
    expect(t.serviceFee).toBe(3); // 10% of (40 - 10)
    expect(t.total).toBe(33);
  });

  it('computes remaining after partial payment', () => {
    const order = makeOrder({ payments: [{ amount: 20 as never }] as never });
    const t = computeTotals(order);
    expect(t.paid).toBe(20);
    expect(t.remaining).toBe(24);
  });

  it('adds the delivery fee (online order) to the total, after the service fee', () => {
    const order = makeOrder({ deliveryFee: 5 as never });
    const t = computeTotals(order);
    // 40 subtotal + 4 service fee + 5 delivery fee
    expect(t.deliveryFee).toBe(5);
    expect(t.total).toBe(49);
  });
});

describe('assertCustomProductBase', () => {
  const BASE = { kind: AdditionalKind.BASE };
  const ADDON = { kind: AdditionalKind.ADDON };
  const custom = { isCustom: true, name: 'Monte o Seu Pastel' };
  const regular = { isCustom: false, name: 'Pastel de Frango' };

  it('accepts a custom product with exactly one base (plus any addons)', () => {
    expect(() => assertCustomProductBase(custom, [BASE])).not.toThrow();
    expect(() => assertCustomProductBase(custom, [BASE, ADDON, ADDON])).not.toThrow();
  });

  it('rejects a custom product without a base — would be a R$0 item', () => {
    expect(() => assertCustomProductBase(custom, [])).toThrow(/sabor-base/);
    expect(() => assertCustomProductBase(custom, [ADDON])).toThrow(/sabor-base/);
  });

  it('rejects a custom product with two bases — would charge two dishes in one', () => {
    expect(() => assertCustomProductBase(custom, [BASE, BASE])).toThrow(/sabor-base/);
  });

  it('accepts a regular product with addons only, rejects it with a base attached', () => {
    expect(() => assertCustomProductBase(regular, [ADDON, ADDON])).not.toThrow();
    expect(() => assertCustomProductBase(regular, [])).not.toThrow();
    expect(() => assertCustomProductBase(regular, [BASE])).toThrow(/não aceita/);
  });
});
