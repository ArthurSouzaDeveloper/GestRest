import { describe, expect, it } from 'vitest';
import { OrderType, Station } from '@prisma/client';
import { renderTicket } from './escpos.helpers';

const PLACED_AT = new Date('2026-09-17T12:00:00Z');

describe('renderTicket', () => {
  it('começa com o comando de inicialização da impressora (ESC @)', () => {
    const bytes = renderTicket({
      station: Station.KITCHEN,
      tableNumber: 5,
      orderType: OrderType.DINE_IN,
      orderNumber: 12,
      customerName: null,
      customerPhone: null,
      deliveryAddress: null,
      placedAt: PLACED_AT,
      items: [{ name: 'Pastel de Carne', category: 'Pastéis Salgados', quantity: 1, additionals: [] }],
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
      customerPhone: null,
      deliveryAddress: null,
      placedAt: PLACED_AT,
      items: [{ name: 'Pastel de Carne', category: 'Pastéis Salgados', quantity: 1, additionals: [] }],
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
      customerPhone: null,
      deliveryAddress: null,
      placedAt: PLACED_AT,
      items: [
        {
          name: 'Suco de Laranja',
          category: 'Sucos',
          quantity: 2,
          additionals: ['Adoçante'],
          notes: 'sem gelo',
        },
      ],
    });
    const text = bytes.toString('ascii');
    expect(text).toContain('SUQUEIROS');
    expect(text).toContain('ENTREGA - PEDIDO #42');
    expect(text).toContain('Maria');
    expect(text).toContain('2x [SUCOS]');
    expect(text).toContain('Suco de Laranja');
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
      customerPhone: null,
      deliveryAddress: null,
      placedAt: PLACED_AT,
      items: [
        { name: 'Pastéis de Coração e Limão', category: 'Pastéis Doces', quantity: 1, additionals: [] },
      ],
    });
    const text = bytes.toString('ascii');
    expect(text).toContain('Pasteis de Coracao e Limao');
    expect(text).toContain('PASTEIS DOCES');
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
      customerPhone: null,
      deliveryAddress: null,
      placedAt: PLACED_AT,
      items: [{ name: 'X', category: 'Y', quantity: 1, additionals: [] }],
    }).toString('ascii');
    expect(comMesa).toContain('MESA 7');

    const retirada = renderTicket({
      station: Station.KITCHEN,
      tableNumber: null,
      orderType: OrderType.PICKUP,
      orderNumber: 1,
      customerName: null,
      customerPhone: null,
      deliveryAddress: null,
      placedAt: PLACED_AT,
      items: [{ name: 'X', category: 'Y', quantity: 1, additionals: [] }],
    }).toString('ascii');
    expect(retirada).toContain('RETIRADA');
  });

  it('inclui telefone do cliente e endereço completo de entrega quando presentes', () => {
    const bytes = renderTicket({
      station: Station.KITCHEN,
      tableNumber: null,
      orderType: OrderType.DELIVERY,
      orderNumber: 8,
      customerName: 'Joao',
      customerPhone: '(19) 99999-8888',
      deliveryAddress: {
        street: 'Rua das Laranjeiras',
        number: '123',
        complement: 'Apto 4',
        zoneName: 'Centro - Americana',
        cep: '13470-000',
      },
      placedAt: PLACED_AT,
      items: [{ name: 'X', category: 'Y', quantity: 1, additionals: [] }],
    });
    const text = bytes.toString('ascii');
    expect(text).toContain('Tel: (19) 99999-8888');
    expect(text).toContain('Rua das Laranjeiras, 123 - Apto 4');
    expect(text).toContain('Centro - Americana');
    expect(text).toContain('CEP: 13470-000');
  });

  it('não imprime bloco de endereço quando não há entrega associada', () => {
    const bytes = renderTicket({
      station: Station.KITCHEN,
      tableNumber: 2,
      orderType: OrderType.DINE_IN,
      orderNumber: 3,
      customerName: null,
      customerPhone: null,
      deliveryAddress: null,
      placedAt: PLACED_AT,
      items: [{ name: 'X', category: 'Y', quantity: 1, additionals: [] }],
    });
    const text = bytes.toString('ascii');
    expect(text).not.toContain('CEP');
    expect(text).not.toContain('Tel:');
  });

  it('imprime o horário do pedido fixado no fuso de São Paulo, não no fuso do processo', () => {
    const bytes = renderTicket({
      station: Station.KITCHEN,
      tableNumber: 1,
      orderType: OrderType.DINE_IN,
      orderNumber: 1,
      customerName: null,
      customerPhone: null,
      deliveryAddress: null,
      placedAt: PLACED_AT,
      items: [{ name: 'X', category: 'Y', quantity: 1, additionals: [] }],
    });
    const text = bytes.toString('ascii');
    const expected = PLACED_AT.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    expect(text).toContain(expected);
  });

  it('mostra a categoria do produto pra diferenciar sabores repetidos entre pastel e mini pizza', () => {
    const pastel = renderTicket({
      station: Station.KITCHEN,
      tableNumber: 4,
      orderType: OrderType.DINE_IN,
      orderNumber: 9,
      customerName: null,
      customerPhone: null,
      deliveryAddress: null,
      placedAt: PLACED_AT,
      items: [{ name: 'Mussarela', category: 'Pastéis Salgados', quantity: 1, additionals: [] }],
    }).toString('ascii');
    expect(pastel).toContain('1x [PASTEIS SALGADOS]');
    expect(pastel).toContain('Mussarela');

    const miniPizza = renderTicket({
      station: Station.KITCHEN,
      tableNumber: 4,
      orderType: OrderType.DINE_IN,
      orderNumber: 9,
      customerName: null,
      customerPhone: null,
      deliveryAddress: null,
      placedAt: PLACED_AT,
      items: [{ name: 'Mussarela', category: 'Mini Pizza Salgada', quantity: 1, additionals: [] }],
    }).toString('ascii');
    expect(miniPizza).toContain('1x [MINI PIZZA SALGADA]');
    expect(miniPizza).toContain('Mussarela');
  });
});
