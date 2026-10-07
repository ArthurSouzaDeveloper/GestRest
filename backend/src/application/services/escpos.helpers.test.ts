import { describe, expect, it } from 'vitest';
import { OrderType, PaymentMethod, Station } from '@prisma/client';
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
    expect(text).toContain('2- Suco de Laranja');
    expect(text).toContain('+ Adocante');
    expect(text).toContain('obs: sem gelo');
  });

  it('remove bytes de controle injetados em campos do cliente — não deixa um pedido malicioso mandar comando real pra impressora (achado de auditoria de segurança)', () => {
    // ESC p (0x1B 0x70) é o comando real de abrir a gaveta de dinheiro em impressoras
    // ESC/POS — se um ESC cru sobrevivesse num campo de texto livre (nome, observação,
    // endereço) de um pedido público, um cliente malicioso podia embutir esse comando e
    // fazer a impressora executar ele de verdade. "Maria" sem o bloco injetado continua
    // aparecendo normalmente — só o byte de controle em si é removido.
    const maliciousName = 'Maria\x1bp\x00\x19\xfa-Sobrenome';
    const maliciousNotes = 'sem cebola\x1dV\x00 cortar tudo';
    const bytes = renderTicket({
      station: Station.KITCHEN,
      tableNumber: null,
      orderType: OrderType.DELIVERY,
      orderNumber: 1,
      customerName: maliciousName,
      customerPhone: null,
      deliveryAddress: null,
      placedAt: PLACED_AT,
      items: [
        { name: 'Pastel', description: null, unitPrice: 10, quantity: 1, additionals: [], notes: maliciousNotes },
      ],
    });
    // Nem o ESC p (abrir gaveta) nem o GS V (corte de papel) injetados sobrevivem.
    expect(bytes.includes(Buffer.from([0x1b, 0x70]))).toBe(false);
    expect(bytes.includes(Buffer.from([0x1d, 0x56, 0x00]))).toBe(false);
    // O texto legítimo ao redor do byte malicioso continua no ticket, só sem o controle.
    const text = bytes.toString('ascii');
    expect(text).toContain('Mariap');
    expect(text).toContain('-Sobrenome');
    expect(text).toContain('sem cebolaV cortar tudo');
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
    expect(kitchen).toContain('1- Mussarela');
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
    expect(juiceBar).toContain('1- Manga (Agua)');
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
    expect(comDescricao).toContain('1- Frango Premium');
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
    expect(semDescricao).toContain('1- Mussarela');
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

  it('prefixa o tipo do prato (pastel/mini pizza/porção) quando informado, mas não inventa um pra quem não tem', () => {
    const bytes = renderTicket({
      station: Station.KITCHEN,
      tableNumber: 4,
      orderType: OrderType.DINE_IN,
      orderNumber: 9,
      customerName: null,
      customerPhone: null,
      deliveryAddress: null,
      placedAt: PLACED_AT,
      items: [
        { name: 'Mussarela', typeLabel: 'Pastel', description: null, unitPrice: 10, quantity: 1, additionals: [] },
        { name: 'Calabresa', typeLabel: 'Mini Pizza', description: null, unitPrice: 12, quantity: 2, additionals: [] },
        { name: 'Batata Frita', typeLabel: 'Porção', description: null, unitPrice: 18, quantity: 1, additionals: [] },
        { name: 'Suco de Laranja', typeLabel: null, description: null, unitPrice: 8, quantity: 1, additionals: [] },
      ],
    }).toString('ascii');
    expect(bytes).toContain('1- Pastel - Mussarela');
    expect(bytes).toContain('2- Mini Pizza - Calabresa');
    expect(bytes).toContain('1- Porcao - Batata Frita');
    expect(bytes).toContain('1- Suco de Laranja');
    expect(bytes).not.toContain('null - Suco de Laranja');
  });

  it('marca a via combinada com um tracejado + rótulo (tamanho normal, sem gastar papel) quando copyLabel é passado; nada quando ausente', () => {
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
      copyLabel: 'SEGUNDA VIA MOTOBOY',
      items: [{ name: 'X', description: null, unitPrice: 10, quantity: 1, additionals: [] }],
    }).toString('ascii');
    expect(comVia).toContain('SEGUNDA VIA MOTOBOY');
    expect(comVia).not.toContain('***');
  });

  it('headerOverride substitui o nome da estação no topo (usado na via combinada do motoboy)', () => {
    const semOverride = renderTicket({
      station: Station.KITCHEN,
      tableNumber: null,
      orderType: OrderType.DELIVERY,
      orderNumber: 1,
      customerName: null,
      customerPhone: null,
      deliveryAddress: null,
      placedAt: PLACED_AT,
      items: [{ name: 'X', description: null, unitPrice: 10, quantity: 1, additionals: [] }],
    }).toString('ascii');
    expect(semOverride).toContain('COZINHA');

    const comOverride = renderTicket({
      station: Station.KITCHEN,
      tableNumber: null,
      orderType: OrderType.DELIVERY,
      orderNumber: 1,
      customerName: null,
      customerPhone: null,
      deliveryAddress: null,
      placedAt: PLACED_AT,
      headerOverride: 'PEDIDO COMPLETO',
      items: [{ name: 'X', description: null, unitPrice: 10, quantity: 1, additionals: [] }],
    }).toString('ascii');
    expect(comOverride).toContain('PEDIDO COMPLETO');
    expect(comOverride).not.toContain('COZINHA');
  });

  it('headerOverride vazio ("") omite a linha de cabeçalho por completo, economizando papel', () => {
    const bytes = renderTicket({
      station: Station.KITCHEN,
      tableNumber: null,
      orderType: OrderType.DELIVERY,
      orderNumber: 1,
      customerName: null,
      customerPhone: null,
      deliveryAddress: null,
      placedAt: PLACED_AT,
      headerOverride: '',
      items: [{ name: 'X', description: null, unitPrice: 10, quantity: 1, additionals: [] }],
    }).toString('ascii');
    expect(bytes).not.toContain('COZINHA');
    // Sem cabeçalho, a primeira coisa impressa (depois da inicialização da impressora) já
    // é a linha do pedido — não sobra uma linha em branco no lugar do cabeçalho.
    expect(bytes.indexOf('PEDIDO #1')).toBeLessThan(20);
  });

  it('crossStationNotice liga um aviso em destaque logo abaixo do cabeçalho; ausente, não imprime nada', () => {
    const semAviso = renderTicket({
      station: Station.KITCHEN,
      tableNumber: null,
      orderType: OrderType.DELIVERY,
      orderNumber: 1,
      customerName: null,
      customerPhone: null,
      deliveryAddress: null,
      placedAt: PLACED_AT,
      items: [{ name: 'X', description: null, unitPrice: 10, quantity: 1, additionals: [] }],
    }).toString('ascii');
    expect(semAviso).not.toContain('====');

    const comAviso = renderTicket({
      station: Station.KITCHEN,
      tableNumber: null,
      orderType: OrderType.DELIVERY,
      orderNumber: 1,
      customerName: null,
      customerPhone: null,
      deliveryAddress: null,
      placedAt: PLACED_AT,
      crossStationNotice: 'PEDIDO COM BEBIDAS',
      items: [{ name: 'X', description: null, unitPrice: 10, quantity: 1, additionals: [] }],
    }).toString('ascii');
    expect(comAviso).toContain('PEDIDO COM BEBIDAS');
    // Logo abaixo do cabeçalho — antes de qualquer outra informação do pedido.
    expect(comAviso.indexOf('PEDIDO COM BEBIDAS')).toBeLessThan(comAviso.indexOf('PEDIDO #1'));

    // Texto livre — usado também pras vias de cozinha/suco avisando da OUTRA estação
    // (ver printJob.service.ts), não só "PEDIDO COM BEBIDAS" da via do motoboy.
    const outroTexto = renderTicket({
      station: Station.JUICE_BAR,
      tableNumber: null,
      orderType: OrderType.PICKUP,
      orderNumber: 1,
      customerName: null,
      customerPhone: null,
      deliveryAddress: null,
      placedAt: PLACED_AT,
      crossStationNotice: 'PEDIDO TAMBEM TEM: PASTEL, PORCAO',
      items: [{ name: 'X', description: null, unitPrice: 10, quantity: 1, additionals: [] }],
    }).toString('ascii');
    expect(outroTexto).toContain('PEDIDO TAMBEM TEM: PASTEL, PORCAO');
  });

  it('orderTotal imprime "TOTAL DO PEDIDO" abaixo do último item (não junto dos dados do cliente no topo); ausente, não imprime nada', () => {
    const semTotal = renderTicket({
      station: Station.KITCHEN,
      tableNumber: null,
      orderType: OrderType.DELIVERY,
      orderNumber: 1,
      customerName: null,
      customerPhone: null,
      deliveryAddress: null,
      placedAt: PLACED_AT,
      paymentMethod: PaymentMethod.PIX,
      items: [{ name: 'X', description: null, unitPrice: 10, quantity: 1, additionals: [] }],
    }).toString('ascii');
    expect(semTotal).not.toContain('TOTAL DO PEDIDO');

    const comTotal = renderTicket({
      station: Station.KITCHEN,
      tableNumber: null,
      orderType: OrderType.DELIVERY,
      orderNumber: 1,
      customerName: null,
      customerPhone: null,
      deliveryAddress: null,
      placedAt: PLACED_AT,
      paymentMethod: PaymentMethod.PIX,
      orderTotal: 67.5,
      items: [{ name: 'X', description: null, unitPrice: 10, quantity: 1, additionals: [] }],
    }).toString('ascii');
    expect(comTotal).toContain('TOTAL DO PEDIDO: R$ 67,50');
    // Abaixo do último item (depois do nome "X" do item e do seu preço), não lá em cima
    // junto da forma de pagamento — pedido explícito do cliente.
    expect(comTotal.indexOf('TOTAL DO PEDIDO')).toBeGreaterThan(comTotal.indexOf('PAGAMENTO'));
    expect(comTotal.indexOf('TOTAL DO PEDIDO')).toBeGreaterThan(comTotal.indexOf('R$ 10,00 / un.'));
  });

  it('itemSeparator imprime uma linha divisória depois de cada item (nome+preço+adicionais+obs); sem a opção, não imprime nada extra', () => {
    const semSeparador = renderTicket({
      station: Station.KITCHEN,
      tableNumber: null,
      orderType: OrderType.DINE_IN,
      orderNumber: 1,
      customerName: null,
      customerPhone: null,
      deliveryAddress: null,
      placedAt: PLACED_AT,
      items: [
        { name: 'Carne', description: null, unitPrice: 10, quantity: 1, additionals: [] },
        { name: 'Chocolate', description: null, unitPrice: 12, quantity: 1, additionals: [] },
      ],
    }).toString('ascii');
    // Conta LINHAS exatas (não substring) pra não confundir com a moldura do ticket
    // (abre/fecha com uma linha de 32 traços, mais longa que a do item, mas que também
    // "contém" a de 28 como substring).
    const itemSeparatorLine = '-'.repeat(28);
    expect(semSeparador.split('\n').filter((l) => l === itemSeparatorLine)).toHaveLength(0);

    const comSeparador = renderTicket({
      station: Station.KITCHEN,
      tableNumber: null,
      orderType: OrderType.DINE_IN,
      orderNumber: 1,
      customerName: null,
      customerPhone: null,
      deliveryAddress: null,
      placedAt: PLACED_AT,
      itemSeparator: true,
      items: [
        { name: 'Carne', description: null, unitPrice: 10, quantity: 1, additionals: ['Catupiry'], notes: 'sem cebola' },
        { name: 'Chocolate', description: null, unitPrice: 12, quantity: 1, additionals: [] },
      ],
    }).toString('ascii');
    // Uma linha por item (2 itens = 2 separadores), cada um depois de tudo daquele item.
    expect(comSeparador.split('\n').filter((l) => l === itemSeparatorLine)).toHaveLength(2);
    const separatorAfterObs = comSeparador.indexOf('obs: sem cebola');
    const separatorLine = comSeparador.indexOf(itemSeparatorLine, separatorAfterObs);
    expect(separatorLine).toBeGreaterThan(separatorAfterObs);
  });
});
