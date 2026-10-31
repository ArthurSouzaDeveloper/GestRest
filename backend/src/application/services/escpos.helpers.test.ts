import { describe, expect, it } from 'vitest';
import { OrderType, PaymentMethod, Station } from '@prisma/client';
import { mergeIdenticalItems, renderTicket } from './escpos.helpers';

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
      items: [{ name: 'Pastel de Carne', description: null, quantity: 1, additionals: [] }],
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
      items: [{ name: 'Pastel de Carne', description: null, quantity: 1, additionals: [] }],
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
        { name: 'Pastel', description: null, quantity: 1, additionals: [], notes: maliciousNotes },
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
        { name: 'Pastéis de Coração e Limão', description: null, quantity: 1, additionals: [] },
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
      items: [{ name: 'X', description: null, quantity: 1, additionals: [] }],
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
      items: [{ name: 'X', description: null, quantity: 1, additionals: [] }],
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
      items: [{ name: 'X', description: null, quantity: 1, additionals: [] }],
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
      items: [{ name: 'X', description: null, quantity: 1, additionals: [] }],
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
      items: [{ name: 'X', description: null, quantity: 1, additionals: [] }],
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
      items: [{ name: 'Mussarela', description: null, quantity: 1, additionals: [] }],
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
      items: [{ name: 'Manga (Agua)', description: null, quantity: 1, additionals: [] }],
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
      items: [{ name: 'Mussarela', description: null, quantity: 1, additionals: [] }],
    }).toString('ascii');
    expect(semDescricao).toContain('1- Mussarela');
  });

  it('não imprime preço unitário de item nenhum (só o total, quando informado) e segue sem caractere não-ASCII', () => {
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
        { name: 'Carne', description: null, quantity: 3, additionals: [] },
        { name: 'Chocolate', description: null, quantity: 1, additionals: [] },
      ],
    });
    const text = bytes.toString('ascii');
    // Pedido explícito do cliente/dono: nenhum item mostra valor unitário em via nenhuma.
    expect(text).not.toContain('/ un.');
    expect(text).not.toContain('R$');
    expect(text).toContain('3- Carne');
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
        { name: 'Mussarela', typeLabel: 'Pastel', description: null, quantity: 1, additionals: [] },
        { name: 'Calabresa', typeLabel: 'Mini Pizza', description: null, quantity: 2, additionals: [] },
        { name: 'Batata Frita', typeLabel: 'Porção', description: null, quantity: 1, additionals: [] },
        { name: 'Suco de Laranja', typeLabel: null, description: null, quantity: 1, additionals: [] },
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
      items: [{ name: 'X', description: null, quantity: 1, additionals: [] }],
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
      items: [{ name: 'X', description: null, quantity: 1, additionals: [] }],
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
      items: [{ name: 'X', description: null, quantity: 1, additionals: [] }],
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
      items: [{ name: 'X', description: null, quantity: 1, additionals: [] }],
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
      items: [{ name: 'X', description: null, quantity: 1, additionals: [] }],
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
      items: [{ name: 'X', description: null, quantity: 1, additionals: [] }],
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
      crossStationNotice: ['ITENS INCLUSOS: BEBIDA'],
      items: [{ name: 'X', description: null, quantity: 1, additionals: [] }],
    }).toString('ascii');
    expect(comAviso).toContain('ITENS INCLUSOS: BEBIDA');
    // Logo abaixo do cabeçalho — antes de qualquer outra informação do pedido.
    expect(comAviso.indexOf('ITENS INCLUSOS: BEBIDA')).toBeLessThan(comAviso.indexOf('PEDIDO #1'));

    // Texto livre — usado também pras vias de cozinha/suco avisando da OUTRA estação
    // (ver printJob.service.ts), não só a via do motoboy.
    const outroTexto = renderTicket({
      station: Station.JUICE_BAR,
      tableNumber: null,
      orderType: OrderType.PICKUP,
      orderNumber: 1,
      customerName: null,
      customerPhone: null,
      deliveryAddress: null,
      placedAt: PLACED_AT,
      crossStationNotice: ['ITENS INCLUSOS: PASTEL * PORCAO'],
      items: [{ name: 'X', description: null, quantity: 1, additionals: [] }],
    }).toString('ascii');
    expect(outroTexto).toContain('ITENS INCLUSOS: PASTEL * PORCAO');

    // Mais de uma linha (o aviso da via principal é uma família por linha, ver
    // printJob.service.ts#includedItemsNotice) — cada string do array vira uma linha
    // própria, nessa ordem.
    const varias = renderTicket({
      station: Station.KITCHEN,
      tableNumber: null,
      orderType: OrderType.PICKUP,
      orderNumber: 1,
      customerName: null,
      customerPhone: null,
      deliveryAddress: null,
      placedAt: PLACED_AT,
      crossStationNotice: ['* ITENS INCLUSOS', '* SUCO', '* BEBIDA PRONTA'],
      items: [{ name: 'X', description: null, quantity: 1, additionals: [] }],
    }).toString('ascii');
    expect(varias).toContain('* ITENS INCLUSOS\n');
    expect(varias).toContain('* SUCO\n');
    expect(varias.indexOf('* SUCO')).toBeLessThan(varias.indexOf('* BEBIDA PRONTA'));
  });

  it('crossStationNoticeDetail sai logo abaixo do aviso, em tamanho de corpo (não o grande do destaque)', () => {
    const comDetalhe = renderTicket({
      station: Station.KITCHEN,
      tableNumber: null,
      orderType: OrderType.DELIVERY,
      orderNumber: 1,
      customerName: null,
      customerPhone: null,
      deliveryAddress: null,
      placedAt: PLACED_AT,
      crossStationNotice: ['* ITENS INCLUSOS', '* BEBIDA PRONTA'],
      crossStationNoticeDetail: ['(Coca-Cola 2L)', '(3 Cerveja)'],
      items: [{ name: 'X', description: null, quantity: 1, additionals: [] }],
    });
    const texto = comDetalhe.toString('ascii');
    expect(texto).toContain('(Coca-Cola 2L)\n');
    expect(texto).toContain('(3 Cerveja)\n');
    // Depois da última família do aviso e ainda antes dos dados do pedido.
    expect(texto.indexOf('(Coca-Cola 2L)')).toBeGreaterThan(texto.indexOf('* BEBIDA PRONTA'));
    expect(texto.indexOf('(3 Cerveja)')).toBeLessThan(texto.indexOf('PEDIDO #1'));
    // Sem o ESC ! 0x38 (negrito+altura+largura dupla) na frente: nome de bebida é longo e,
    // em largura dupla, quebraria a linha na impressora de 32 colunas.
    const headerMode = Buffer.from([0x1b, 0x21, 0x38]);
    const detalheIdx = comDetalhe.indexOf(Buffer.from('(Coca-Cola 2L)', 'ascii'));
    const ultimoHeaderModeAntes = comDetalhe.lastIndexOf(headerMode, detalheIdx);
    expect(comDetalhe.indexOf(Buffer.from('* BEBIDA PRONTA', 'ascii'))).toBeGreaterThan(ultimoHeaderModeAntes);
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
      items: [{ name: 'X', description: null, quantity: 1, additionals: [] }],
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
      items: [{ name: 'X', description: null, quantity: 1, additionals: [] }],
    }).toString('ascii');
    expect(comTotal).toContain('TOTAL DO PEDIDO: R$ 67,50');
    // Abaixo do último item (depois do "1- X"), não lá em cima junto da forma de
    // pagamento — pedido explícito do cliente.
    expect(comTotal.indexOf('TOTAL DO PEDIDO')).toBeGreaterThan(comTotal.indexOf('PAGAMENTO'));
    expect(comTotal.indexOf('1- X')).toBeGreaterThan(-1);
    expect(comTotal.indexOf('TOTAL DO PEDIDO')).toBeGreaterThan(comTotal.indexOf('1- X'));
  });

  it('pedido dividido isento imprime "TAXA DE ENTREGA: ISENTA (JUNTO DO PEDIDO #N)" no lugar do valor da taxa', () => {
    const base = {
      station: Station.KITCHEN,
      tableNumber: null,
      orderType: OrderType.DELIVERY,
      orderNumber: 2,
      customerName: null,
      customerPhone: null,
      deliveryAddress: null,
      placedAt: PLACED_AT,
      paymentMethod: PaymentMethod.CASH,
      orderTotal: 20,
      items: [{ name: 'X', description: null, quantity: 1, additionals: [] }],
    };
    const isento = renderTicket({ ...base, deliveryFee: 0, deliveryFeeWaivedByOrderNumber: 41 }).toString('ascii');
    expect(isento).toContain('TAXA DE ENTREGA: ISENTA');
    expect(isento).toContain('(JUNTO DO PEDIDO #41)');
    expect(isento.indexOf('TAXA DE ENTREGA')).toBeGreaterThan(isento.indexOf('TOTAL DO PEDIDO'));

    const normal = renderTicket({ ...base, deliveryFee: 5 }).toString('ascii');
    expect(normal).toContain('TAXA DE ENTREGA: R$ 5,00');
    expect(normal).not.toContain('ISENTA');
  });

  it('itemSeparator imprime uma linha divisória depois de cada item (nome+adicionais+obs); sem a opção, não imprime nada extra', () => {
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
        { name: 'Carne', description: null, quantity: 1, additionals: [] },
        { name: 'Chocolate', description: null, quantity: 1, additionals: [] },
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
        { name: 'Carne', description: null, quantity: 1, additionals: ['Catupiry'], notes: 'sem cebola' },
        { name: 'Chocolate', description: null, quantity: 1, additionals: [] },
      ],
    }).toString('ascii');
    // Uma linha por item (2 itens = 2 separadores), cada um depois de tudo daquele item.
    // Prefixo \x1b!\x00 (e não o traço puro) porque a troca pro tamanho normal (ESC ! 0x00,
    // ver teste de bytes abaixo) vira bytes de controle colados na mesma linha, antes do
    // traço em si — sem o prefixo, a moldura do ticket (linha de 32 traços) também bateria,
    // já que contém 28 traços seguidos. endsWith (e não ===) porque, sem linha de preço
    // entre o item e o separador, o BODY_MODE_ON do item anterior também fica colado nela.
    const prefixedItemSeparatorLine = '\x1b!\x00' + itemSeparatorLine;
    expect(comSeparador.split('\n').filter((l) => l.endsWith(prefixedItemSeparatorLine))).toHaveLength(2);
    const separatorAfterObs = comSeparador.indexOf('obs: sem cebola');
    const separatorLine = comSeparador.indexOf(itemSeparatorLine, separatorAfterObs);
    expect(separatorLine).toBeGreaterThan(separatorAfterObs);

    // O traço em si sai em tamanho NORMAL (ESC ! 0x00), não no tamanho dobrado do resto do
    // corpo — pedido explícito do cliente/dono pra economizar papel sem diminuir a fonte
    // do texto de verdade (nome/descrição/preço). Volta pro tamanho de corpo (ESC ! 0x18)
    // logo depois, pro próximo item continuar grande.
    const comSeparadorBytes = renderTicket({
      station: Station.KITCHEN,
      tableNumber: null,
      orderType: OrderType.DINE_IN,
      orderNumber: 1,
      customerName: null,
      customerPhone: null,
      deliveryAddress: null,
      placedAt: PLACED_AT,
      itemSeparator: true,
      items: [{ name: 'Carne', description: null, quantity: 1, additionals: [] }],
    });
    const normalModeBeforeDash = Buffer.from([0x1b, 0x21, 0x00, ...Buffer.from('-'.repeat(28), 'ascii')]);
    const bodyModeAfterDash = Buffer.from([...Buffer.from('-'.repeat(28), 'ascii'), 0x0a, 0x1b, 0x21, 0x18]);
    expect(comSeparadorBytes.includes(normalModeBeforeDash)).toBe(true);
    expect(comSeparadorBytes.includes(bodyModeAfterDash)).toBe(true);
  });
});

describe('mergeIdenticalItems', () => {
  it('junta itens iguais pedidos em momentos diferentes e soma a quantidade, mantendo a ordem', () => {
    const merged = mergeIdenticalItems([
      { name: 'Xadrez', description: null, quantity: 1, additionals: [] },
      { name: 'CHEDDAR, FRANGO', description: null, quantity: 1, additionals: [] },
      { name: 'CATUPIRY, FRANGO', description: null, quantity: 1, additionals: [] },
      { name: 'FRANGO, CHEDDAR', description: null, quantity: 2, additionals: [] },
    ]);
    expect(merged.map((i) => `${i.quantity}- ${i.name}`)).toEqual([
      '1- Xadrez',
      '3- CHEDDAR, FRANGO',
      '1- CATUPIRY, FRANGO',
    ]);
  });

  it('não junta itens com observação ou adicionais diferentes', () => {
    const merged = mergeIdenticalItems([
      { name: 'CARNE', description: null, quantity: 1, additionals: [] },
      { name: 'CARNE', description: null, quantity: 1, notes: 'Acrescentar brocolis', additionals: [] },
      { name: 'CARNE', description: null, quantity: 1, additionals: ['Barbecue'] },
      { name: 'CARNE', description: null, quantity: 1, notes: '  ', additionals: [] },
      { name: 'CARNE', description: null, quantity: 1, additionals: ['Barbecue'] },
    ]);
    expect(merged.map((i) => [i.quantity, i.notes ?? null, i.additionals])).toEqual([
      [2, null, []],
      [1, 'Acrescentar brocolis', []],
      [2, null, ['Barbecue']],
    ]);
  });

  it('não altera os itens de entrada', () => {
    const items = [
      { name: 'CARNE', description: null, quantity: 1, additionals: [] },
      { name: 'CARNE', description: null, quantity: 1, additionals: [] },
    ];
    mergeIdenticalItems(items);
    expect(items[0].quantity).toBe(1);
  });

  it('a via impressa sai com uma linha só para os itens iguais', () => {
    const text = renderTicket({
      station: Station.KITCHEN,
      tableNumber: null,
      orderType: OrderType.PICKUP,
      orderNumber: 4,
      customerName: null,
      customerPhone: null,
      deliveryAddress: null,
      placedAt: PLACED_AT,
      items: [
        { name: 'CHEDDAR, FRANGO', description: null, quantity: 1, additionals: [] },
        { name: 'CARNE', description: null, quantity: 1, additionals: [] },
        { name: 'CHEDDAR, FRANGO', description: null, quantity: 1, additionals: [] },
      ],
    }).toString('latin1');
    expect(text).toContain('2- CHEDDAR, FRANGO');
    expect(text).not.toContain('1- CHEDDAR, FRANGO');
  });
});
