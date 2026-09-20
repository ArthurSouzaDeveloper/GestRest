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
      items: [{ name: 'Pastel de Carne', description: null, unitPrice: 10, quantity: 1, additionals: [] }],
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
      items: [{ name: 'Pastel de Carne', description: null, unitPrice: 10, quantity: 1, additionals: [] }],
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
          description: null,
          unitPrice: 8,
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
      customerPhone: null,
      deliveryAddress: null,
      placedAt: PLACED_AT,
      items: [
        { name: 'Pastéis de Coração e Limão', description: null, unitPrice: 10, quantity: 1, additionals: [] },
      ],
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
      customerPhone: null,
      deliveryAddress: null,
      placedAt: PLACED_AT,
      items: [{ name: 'X', description: null, unitPrice: 10, quantity: 1, additionals: [] }],
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
      items: [{ name: 'X', description: null, unitPrice: 10, quantity: 1, additionals: [] }],
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
      items: [{ name: 'X', description: null, unitPrice: 10, quantity: 1, additionals: [] }],
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
      items: [{ name: 'X', description: null, unitPrice: 10, quantity: 1, additionals: [] }],
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
      items: [{ name: 'X', description: null, unitPrice: 10, quantity: 1, additionals: [] }],
    });
    const text = bytes.toString('ascii');
    const expected = PLACED_AT.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    expect(text).toContain(expected);
  });

  it('nunca imprime categoria do produto — nem na cozinha, nem nos suqueiros', () => {
    const kitchen = renderTicket({
      station: Station.KITCHEN,
      tableNumber: 4,
      orderType: OrderType.DINE_IN,
      orderNumber: 9,
      customerName: null,
      customerPhone: null,
      deliveryAddress: null,
      placedAt: PLACED_AT,
      items: [{ name: 'Mussarela', description: null, unitPrice: 10, quantity: 1, additionals: [] }],
    }).toString('ascii');
    expect(kitchen).toContain('1x Mussarela');
    expect(kitchen).not.toContain('[');
    expect(kitchen).not.toContain('PASTEIS');
    expect(kitchen).not.toContain('PIZZA');

    const juiceBar = renderTicket({
      station: Station.JUICE_BAR,
      tableNumber: 4,
      orderType: OrderType.DINE_IN,
      orderNumber: 9,
      customerName: null,
      customerPhone: null,
      deliveryAddress: null,
      placedAt: PLACED_AT,
      items: [{ name: 'Manga (Agua)', description: null, unitPrice: 10, quantity: 1, additionals: [] }],
    }).toString('ascii');
    expect(juiceBar).toContain('1x Manga (Agua)');
    expect(juiceBar).not.toContain('[');
    expect(juiceBar).not.toContain('SUCOS');
  });

  it('imprime a descrição do produto quando existe, logo abaixo do nome', () => {
    const comDescricao = renderTicket({
      station: Station.KITCHEN,
      tableNumber: 4,
      orderType: OrderType.DINE_IN,
      orderNumber: 9,
      customerName: null,
      customerPhone: null,
      deliveryAddress: null,
      placedAt: PLACED_AT,
      items: [
        {
          name: 'Frango Premium',
          description: 'Frango, geleia de pimenta, bacon, queijo e cream cheese.',
          unitPrice: 22,
          quantity: 1,
          additionals: [],
        },
      ],
    }).toString('ascii');
    expect(comDescricao).toContain('1x Frango Premium');
    expect(comDescricao).toContain('Frango, geleia de pimenta, bacon, queijo e cream cheese.');

    const semDescricao = renderTicket({
      station: Station.KITCHEN,
      tableNumber: 4,
      orderType: OrderType.DINE_IN,
      orderNumber: 9,
      customerName: null,
      customerPhone: null,
      deliveryAddress: null,
      placedAt: PLACED_AT,
      items: [{ name: 'Mussarela', description: null, unitPrice: 10, quantity: 1, additionals: [] }],
    }).toString('ascii');
    expect(semDescricao).toContain('1x Mussarela');
  });

  it('imprime o preço unitário de cada item, em reais, sem usar caractere não-ASCII', () => {
    const bytes = renderTicket({
      station: Station.KITCHEN,
      tableNumber: 6,
      orderType: OrderType.DINE_IN,
      orderNumber: 10,
      customerName: null,
      customerPhone: null,
      deliveryAddress: null,
      placedAt: PLACED_AT,
      items: [
        { name: 'Carne', description: null, unitPrice: 12, quantity: 3, additionals: [] },
        { name: 'Chocolate', description: null, unitPrice: 15.5, quantity: 1, additionals: [] },
      ],
    });
    const text = bytes.toString('ascii');
    expect(text).toContain('R$ 12,00 / un.');
    expect(text).toContain('R$ 15,50 / un.');
    // eslint-disable-next-line no-control-regex
    expect(text).not.toMatch(/[^\x00-\x7F]/);
  });

  it('marca a 2a via com destaque quando copyLabel é passado; não marca nada quando ausente', () => {
    const semVia = renderTicket({
      station: Station.KITCHEN,
      tableNumber: null,
      orderType: OrderType.PICKUP,
      orderNumber: 5,
      customerName: null,
      customerPhone: null,
      deliveryAddress: null,
      placedAt: PLACED_AT,
      items: [{ name: 'X', description: null, unitPrice: 10, quantity: 1, additionals: [] }],
    }).toString('ascii');
    expect(semVia).not.toContain('VIA');

    const comVia = renderTicket({
      station: Station.KITCHEN,
      tableNumber: null,
      orderType: OrderType.PICKUP,
      orderNumber: 5,
      customerName: null,
      customerPhone: null,
      deliveryAddress: null,
      placedAt: PLACED_AT,
      copyLabel: '2a VIA',
      items: [{ name: 'X', description: null, unitPrice: 10, quantity: 1, additionals: [] }],
    }).toString('ascii');
    expect(comVia).toContain('*** 2a VIA ***');
  });
});
