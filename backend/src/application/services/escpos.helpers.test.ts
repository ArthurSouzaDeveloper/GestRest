import { describe, expect, it } from 'vitest';
import { OrderType, Station } from '@prisma/client';
import { renderTicket } from './escpos.helpers';

describe('renderTicket', () => {
  it('começa com o comando de inicialização da impressora (ESC @)', () => {
    const bytes = renderTicket({
      station: Station.KITCHEN,
      tableNumber: 5,
      orderType: OrderType.DINE_IN,
      orderNumber: 12,
      customerName: null,
      items: [{ name: 'Pastel de Carne', quantity: 1, additionals: [] }],
    });
    expect(bytes.subarray(0, 2)).toEqual(Buffer.from([0x1b, 0x40]));
  });

  it('termina com alimentação de papel + corte parcial (GS V 1)', () => {
    const bytes = renderTicket({
      station: Station.KITCHEN,
      tableNumber: 5,
      orderType: OrderType.DINE_IN,
      orderNumber: 12,
      customerName: null,
      items: [{ name: 'Pastel de Carne', quantity: 1, additionals: [] }],
    });
    expect(bytes.subarray(-3)).toEqual(Buffer.from([0x1d, 0x56, 0x01]));
  });

  it('inclui o nome da estação, mesa, número do pedido, itens e adicionais como texto', () => {
    const bytes = renderTicket({
      station: Station.JUICE_BAR,
      tableNumber: null,
      orderType: OrderType.DELIVERY,
      orderNumber: 42,
      customerName: 'Maria',
      items: [
        { name: 'Suco de Laranja', quantity: 2, additionals: ['Adoçante'], notes: 'sem gelo' },
      ],
    });
    const text = bytes.toString('ascii');
    expect(text).toContain('SUQUEIROS');
    expect(text).toContain('ENTREGA - PEDIDO #42');
    expect(text).toContain('Maria');
    expect(text).toContain('2x Suco de Laranja');
    expect(text).toContain('+ Adocante');
    expect(text).toContain('obs: sem gelo');
  });

  it('remove acentuação em vez de arriscar uma codepage não validada', () => {
    const bytes = renderTicket({
      station: Station.KITCHEN,
      tableNumber: 3,
      orderType: OrderType.DINE_IN,
      orderNumber: 1,
      customerName: null,
      items: [{ name: 'Pastéis de Coração e Limão', quantity: 1, additionals: [] }],
    });
    const text = bytes.toString('ascii');
    expect(text).toContain('Pasteis de Coracao e Limao');
    // eslint-disable-next-line no-control-regex
    expect(text).not.toMatch(/[^\x00-\x7F]/);
  });

  it('mesa presente usa "MESA N"; sem mesa usa o rótulo do tipo de pedido', () => {
    const comMesa = renderTicket({
      station: Station.KITCHEN,
      tableNumber: 7,
      orderType: OrderType.DINE_IN,
      orderNumber: 1,
      customerName: null,
      items: [{ name: 'X', quantity: 1, additionals: [] }],
    }).toString('ascii');
    expect(comMesa).toContain('MESA 7');

    const retirada = renderTicket({
      station: Station.KITCHEN,
      tableNumber: null,
      orderType: OrderType.PICKUP,
      orderNumber: 1,
      customerName: null,
      items: [{ name: 'X', quantity: 1, additionals: [] }],
    }).toString('ascii');
    expect(retirada).toContain('RETIRADA');
  });
});
