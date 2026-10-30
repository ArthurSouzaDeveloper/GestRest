import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AdditionalKind, OrderStatus, PaymentMethod, PrintJobStatus, Role, Station } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { orderService } from './order.service';
import { autoAcceptService } from './autoAccept.service';
import { printerSettingsService, verifyAgentKey } from './printerSettings.service';

/**
 * Testes de integração (banco real) para a fila de impressão térmica — item novo em
 * comanda existente, aceite manual e aceite automático cada um gera o PrintJob
 * esperado; e isolamento cross-tenant da chave de acesso da ponte.
 */
describe('fila de impressão térmica (PrintJob)', () => {
  let restaurantId: string;
  let kitchenProductId: string;
  let juiceProductId: string;
  let waiterId: string;

  beforeAll(async () => {
    const restaurant = await prisma.restaurant.create({
      data: { name: 'Teste Impressão', slug: `teste-impressao-${randomUUID()}` },
    });
    restaurantId = restaurant.id;
    const kitchenCategory = await prisma.category.create({
      data: { name: 'Cozinha', station: Station.KITCHEN, restaurantId },
    });
    const juiceCategory = await prisma.category.create({
      data: { name: 'Sucos', station: Station.JUICE_BAR, restaurantId },
    });
    kitchenProductId = (
      await prisma.product.create({ data: { name: 'Pastel', price: 10, categoryId: kitchenCategory.id, restaurantId } })
    ).id;
    juiceProductId = (
      await prisma.product.create({ data: { name: 'Suco', price: 8, categoryId: juiceCategory.id, restaurantId } })
    ).id;
    waiterId = (
      await prisma.user.create({
        data: { name: 'Garçom', email: `garcom-${randomUUID()}@teste.local`, passwordHash: 'x', role: Role.WAITER, restaurantId },
      })
    ).id;
  });

  afterAll(async () => {
    // PrintJob é Cascade a partir de Order (de propósito, não é dado financeiro
    // histórico), mas OrderItem->Product continua Restrict (correção da auditoria
    // QA) — precisa limpar itens/pedidos antes do Restaurant, mesmo padrão de
    // dataIntegrity.test.ts.
    await prisma.orderItem.deleteMany({ where: { order: { restaurantId } } });
    await prisma.order.deleteMany({ where: { restaurantId } });
    await prisma.restaurant.delete({ where: { id: restaurantId } });
  });

  it('item novo numa comanda existente gera um PrintJob por estação tocada', async () => {
    const table = await prisma.restaurantTable.create({ data: { number: 501, restaurantId } });
    const order = await orderService.open({ tableId: table.id }, { userId: waiterId, tenantId: restaurantId, role: Role.WAITER });
    await orderService.addItems(
      order!.id,
      [{ productId: kitchenProductId, quantity: 1 }, { productId: juiceProductId, quantity: 2 }],
      { userId: waiterId, tenantId: restaurantId, role: Role.WAITER },
    );

    const jobs = await prisma.printJob.findMany({ where: { orderId: order!.id } });
    expect(jobs).toHaveLength(2);
    expect(jobs.map((j) => j.station).sort()).toEqual([Station.JUICE_BAR, Station.KITCHEN].sort());
    for (const job of jobs) {
      expect(job.status).toBe(PrintJobStatus.PENDING);
      expect(job.payload.length).toBeGreaterThan(0);
    }
  });

  it('imprime a descrição do produto e nunca a categoria', async () => {
    const category = await prisma.category.findFirstOrThrow({ where: { restaurantId, station: Station.KITCHEN } });
    const productWithDescription = await prisma.product.create({
      data: {
        name: 'Frango Premium',
        description: 'Frango, geleia de pimenta, bacon, queijo e cream cheese.',
        price: 22,
        categoryId: category.id,
        restaurantId,
      },
    });
    const table = await prisma.restaurantTable.create({ data: { number: 503, restaurantId } });
    const order = await orderService.open({ tableId: table.id }, { userId: waiterId, tenantId: restaurantId, role: Role.WAITER });
    await orderService.addItems(
      order!.id,
      [{ productId: productWithDescription.id, quantity: 1 }],
      { userId: waiterId, tenantId: restaurantId, role: Role.WAITER },
    );

    const job = await prisma.printJob.findFirstOrThrow({ where: { orderId: order!.id } });
    const text = job.payload.toString('ascii');
    expect(text).toContain('1- Frango Premium');
    expect(text).toContain('Frango, geleia de pimenta, bacon, queijo e cream cheese.');
    // Sem colchetes de categoria em lugar nenhum do ticket (ver renderTicket).
    expect(text).not.toContain('[');
  });

  it('cozinha sai em um papel por TIPO de prato (Pastel, Mini Pizza, Porção), cada um prefixado (salgado/doce) conforme a categoria, mas nunca em suco', async () => {
    // Nomes de categoria propositalmente "não-canônicos" (singular, sem acento, ordem
    // diferente) — a regra bate por conteúdo (contém "pastel"/"mini pizza"/"porção" +
    // "doce"/"salgado"), não por string exata, então renomear a categoria no cardápio do
    // restaurante (como aconteceu de verdade em produção) não quebra o prefixo.
    const pasteisSalgados = await prisma.category.create({
      data: { name: 'Pastel Salgado', station: Station.KITCHEN, restaurantId },
    });
    const pasteisDoces = await prisma.category.create({
      data: { name: 'PASTEIS DOCES', station: Station.KITCHEN, restaurantId },
    });
    const miniPizzaSalgada = await prisma.category.create({
      data: { name: 'Mini Pizza Salgada', station: Station.KITCHEN, restaurantId },
    });
    const miniPizzaDoce = await prisma.category.create({
      data: { name: 'Mini Pizza Doce', station: Station.KITCHEN, restaurantId },
    });
    const porcoes = await prisma.category.create({
      data: { name: 'Porções', station: Station.KITCHEN, restaurantId },
    });
    const pastelSalgado = await prisma.product.create({
      data: { name: 'Mussarela', price: 14.5, categoryId: pasteisSalgados.id, restaurantId },
    });
    const pastelDoce = await prisma.product.create({
      data: { name: 'Chocolate', price: 15, categoryId: pasteisDoces.id, restaurantId },
    });
    const miniPizzaSalgadaProduto = await prisma.product.create({
      data: { name: 'Calabresa', price: 16, categoryId: miniPizzaSalgada.id, restaurantId },
    });
    const miniPizzaDoceProduto = await prisma.product.create({
      data: { name: 'Banana com Canela', price: 16, categoryId: miniPizzaDoce.id, restaurantId },
    });
    const porcao = await prisma.product.create({
      data: { name: 'Batata Frita', price: 22, categoryId: porcoes.id, restaurantId },
    });

    const table = await prisma.restaurantTable.create({ data: { number: 511, restaurantId } });
    const order = await orderService.open({ tableId: table.id }, { userId: waiterId, tenantId: restaurantId, role: Role.WAITER });
    await orderService.addItems(
      order!.id,
      [
        { productId: pastelSalgado.id, quantity: 1 },
        { productId: pastelDoce.id, quantity: 1 },
        { productId: miniPizzaSalgadaProduto.id, quantity: 1 },
        { productId: miniPizzaDoceProduto.id, quantity: 1 },
        { productId: porcao.id, quantity: 1 },
        { productId: juiceProductId, quantity: 1 },
      ],
      { userId: waiterId, tenantId: restaurantId, role: Role.WAITER },
    );

    const jobs = await prisma.printJob.findMany({ where: { orderId: order!.id } });
    const kitchenJobs = jobs.filter((j) => j.station === Station.KITCHEN).map((j) => j.payload.toString('ascii'));
    const juiceText = jobs.find((j) => j.station === Station.JUICE_BAR)!.payload.toString('ascii');

    // 1 papel por tipo (Pastel, Mini Pizza, Porção) — pedido explícito do cliente pra
    // dividir o preparo em vez de um papel só com tudo junto.
    expect(kitchenJobs).toHaveLength(3);
    const pastelPaper = kitchenJobs.find((t) => t.includes('COZINHA - PASTEL'))!;
    const miniPizzaPaper = kitchenJobs.find((t) => t.includes('COZINHA - MINI PIZZA'))!;
    const porcaoPaper = kitchenJobs.find((t) => t.includes('COZINHA - PORCAO'))!;
    expect(pastelPaper).toBeDefined();
    expect(miniPizzaPaper).toBeDefined();
    expect(porcaoPaper).toBeDefined();

    // Sem o prefixo "Pastel Salgado -"/"Pastel Doce -" etc. (achado do cliente/dono: cada
    // papel já sai dedicado a um tipo, repetir o tipo em toda linha de sabor era
    // redundante) — só o sabor mesmo, e sem preço (ver hideItemPrice).
    expect(pastelPaper).toContain('1- Mussarela');
    expect(pastelPaper).toContain('1- Chocolate');
    expect(pastelPaper).not.toContain('/ un.');
    // O aviso cruzado no topo do papel AVISA que o pedido também tem Mini Pizza/Porção/
    // Suco (achado do cliente/dono: uma família POR LINHA, cada uma com "* " na frente,
    // no lugar da linha única "ITENS INCLUSOS: X * Y") — mas nenhum SABOR de outro tipo
    // aparece no corpo do papel. Suco de verdade (categoria "Sucos" exata) entra como
    // "SUCO", não o genérico "BEBIDA" de antes.
    expect(pastelPaper).toContain('* ITENS INCLUSOS\n');
    expect(pastelPaper).toContain('* MINI PIZZA\n');
    expect(pastelPaper).toContain('* PORCAO\n');
    expect(pastelPaper).toContain('* SUCO\n');
    expect(pastelPaper).not.toContain('ITENS INCLUSOS: ');
    expect(pastelPaper).not.toContain('Calabresa');
    expect(pastelPaper).not.toContain('Banana com Canela');
    expect(pastelPaper).not.toContain('Batata Frita');

    expect(miniPizzaPaper).toContain('1- Calabresa');
    expect(miniPizzaPaper).toContain('1- Banana com Canela');
    expect(miniPizzaPaper).not.toContain('/ un.');
    expect(miniPizzaPaper).toContain('* ITENS INCLUSOS\n');
    expect(miniPizzaPaper).toContain('* PASTEL\n');
    expect(miniPizzaPaper).toContain('* PORCAO\n');
    expect(miniPizzaPaper).toContain('* SUCO\n');
    expect(miniPizzaPaper).not.toContain('Mussarela');
    expect(miniPizzaPaper).not.toContain('Chocolate');
    expect(miniPizzaPaper).not.toContain('Batata Frita');

    expect(porcaoPaper).toContain('1- Batata Frita');
    expect(porcaoPaper).not.toContain('/ un.');
    expect(porcaoPaper).toContain('* ITENS INCLUSOS\n');
    expect(porcaoPaper).toContain('* PASTEL\n');
    expect(porcaoPaper).toContain('* MINI PIZZA\n');
    expect(porcaoPaper).toContain('* SUCO\n');
    expect(porcaoPaper).not.toContain('Mussarela');
    expect(porcaoPaper).not.toContain('Chocolate');
    expect(porcaoPaper).not.toContain('Calabresa');
    expect(porcaoPaper).not.toContain('Banana com Canela');

    // "Sucos" (categoria do juiceProductId, ver beforeAll) não bate em nenhuma das 3
    // famílias — continua sem prefixo nenhum, como já era antes desta mudança.
    expect(juiceText).toContain('1- Suco');
    expect(juiceText).not.toContain('Sucos - Suco');
  });

  it('"Sugestões da Casa" sai na MESMA via de "Pastel" (são pastéis também) — não vira um papel separado', async () => {
    // Nomes de categoria únicos neste describe (restaurantId é compartilhado por todos os
    // testes do arquivo, e Category tem @@unique([restaurantId, name])) — evita colidir
    // com "Pastéis Salgados"/"Sugestões da Casa" criados por outros testes abaixo.
    const pasteisSalgados = await prisma.category.create({
      data: { name: 'Pastéis Salgados Unificacao', station: Station.KITCHEN, restaurantId },
    });
    const sugestoesDaCasa = await prisma.category.create({
      data: { name: 'Sugestões da Casa Unificacao', station: Station.KITCHEN, restaurantId },
    });
    const pastel = await prisma.product.create({
      data: { name: 'Mussarela', price: 14.5, categoryId: pasteisSalgados.id, restaurantId },
    });
    const sugestao = await prisma.product.create({
      data: { name: '2 Queijos', description: 'mussarela e catupiry', price: 18, categoryId: sugestoesDaCasa.id, restaurantId },
    });

    const table = await prisma.restaurantTable.create({ data: { number: 531, restaurantId } });
    const order = await orderService.open({ tableId: table.id }, { userId: waiterId, tenantId: restaurantId, role: Role.WAITER });
    await orderService.addItems(
      order!.id,
      [
        { productId: pastel.id, quantity: 1 },
        { productId: sugestao.id, quantity: 1 },
      ],
      { userId: waiterId, tenantId: restaurantId, role: Role.WAITER },
    );

    const jobs = await prisma.printJob.findMany({ where: { orderId: order!.id } });
    const kitchenJobs = jobs.filter((j) => j.station === Station.KITCHEN).map((j) => j.payload.toString('ascii'));
    // 1 papel só pros dois — antes saíam em papéis separados ("COZINHA - PASTEL" e
    // "COZINHA - SUGESTAO DA CASA"), o que o cliente apontou como errado: Sugestões da
    // Casa são pastéis também e precisam sair junto com o resto dos pastéis.
    expect(kitchenJobs).toHaveLength(1);
    expect(kitchenJobs[0]).toContain('COZINHA - PASTEL');
    expect(kitchenJobs[0]).not.toContain('SUGESTAO DA CASA');
    expect(kitchenJobs[0]).toContain('1- Mussarela');
    expect(kitchenJobs[0]).toContain('1- 2 Queijos');
    expect(kitchenJobs[0]).not.toContain('/ un.');
  });

  it('com pastel no pedido: só a via de Pastel leva nome/telefone/endereço — Mini Pizza e Porção levam só o número do pedido', async () => {
    const pasteisSalgados = await prisma.category.create({
      data: { name: 'Pastel Dados Minimos', station: Station.KITCHEN, restaurantId },
    });
    const miniPizza = await prisma.category.create({
      data: { name: 'Mini Pizza Dados Minimos', station: Station.KITCHEN, restaurantId },
    });
    const porcoes = await prisma.category.create({
      data: { name: 'Porcao Dados Minimos', station: Station.KITCHEN, restaurantId },
    });
    const pastel = await prisma.product.create({
      data: { name: 'Mussarela', price: 14.5, categoryId: pasteisSalgados.id, restaurantId },
    });
    const miniPizzaProduto = await prisma.product.create({
      data: { name: 'Calabresa', price: 16, categoryId: miniPizza.id, restaurantId },
    });
    const porcao = await prisma.product.create({
      data: { name: 'Batata Frita', price: 22, categoryId: porcoes.id, restaurantId },
    });

    const zone = await prisma.deliveryZone.create({
      data: { name: 'Zona Dados Minimos', fee: 5, restaurantId },
    });
    await autoAcceptService.update(restaurantId, { enabled: true });
    const order = await orderService.openPublic(restaurantId, {
      orderType: 'DELIVERY',
      customerName: 'Cliente Dados Minimos',
      customerPhone: '11999990010',
      customerCpf: '10000037010',
      declaredPaymentMethod: PaymentMethod.CASH,
      deliveryZoneId: zone.id,
      deliveryStreet: 'Rua dos Dados',
      deliveryNumber: '77',
      items: [
        { productId: pastel.id, quantity: 1 },
        { productId: miniPizzaProduto.id, quantity: 1 },
        { productId: porcao.id, quantity: 1 },
      ],
    });
    await autoAcceptService.update(restaurantId, { enabled: false });

    const jobs = await prisma.printJob.findMany({ where: { orderId: order.id } });
    // Só os papéis da cozinha por TIPO (COZINHA - X) — exclui a via combinada extra do
    // motoboy (entrega sempre gera uma, ver enqueueForItems), que também é station
    // KITCHEN mas não entra nessa contagem por tipo.
    const kitchenJobs = jobs
      .filter((j) => j.station === Station.KITCHEN)
      .map((j) => j.payload.toString('ascii'))
      .filter((t) => t.includes('COZINHA - '));
    expect(kitchenJobs).toHaveLength(3);
    const pastelPaper = kitchenJobs.find((t) => t.includes('COZINHA - PASTEL'))!;
    const miniPizzaPaper = kitchenJobs.find((t) => t.includes('COZINHA - MINI PIZZA'))!;
    const porcaoPaper = kitchenJobs.find((t) => t.includes('COZINHA - PORCAO'))!;

    // Via principal (Pastel, menor prioridade presente): dados completos, como sempre.
    expect(pastelPaper).toContain('Cliente Dados Minimos');
    expect(pastelPaper).toContain('Tel: 11999990010');
    expect(pastelPaper).toContain('Rua dos Dados, 77');

    // Vias secundárias: só o número do pedido — sem nome/telefone/endereço (economia de
    // papel, pedido explícito do cliente — esses dados já saem na via de Pastel).
    for (const paper of [miniPizzaPaper, porcaoPaper]) {
      expect(paper).toContain(`PEDIDO #${order.number}`);
      expect(paper).not.toContain('Cliente Dados Minimos');
      expect(paper).not.toContain('Tel:');
      expect(paper).not.toContain('Rua dos Dados');
    }
  });

  it('sem pastel no pedido: a via de Mini Pizza reconhece que virou a principal e leva os dados completos — só Porção leva o número do pedido', async () => {
    // Nomes sem a substring "pastel" de propósito — kitchenSortPriority/categoryTypeLabel
    // batem por conteúdo, e um nome como "Mini Pizza Sem Pastel" conteria "pastel" e
    // seria classificado (errado) como papel de Pastel.
    const miniPizza = await prisma.category.create({
      data: { name: 'Mini Pizza Pedido Isolado', station: Station.KITCHEN, restaurantId },
    });
    const porcoes = await prisma.category.create({
      data: { name: 'Porcao Pedido Isolado', station: Station.KITCHEN, restaurantId },
    });
    const miniPizzaProduto = await prisma.product.create({
      data: { name: 'Calabresa', price: 16, categoryId: miniPizza.id, restaurantId },
    });
    const porcao = await prisma.product.create({
      data: { name: 'Batata Frita', price: 22, categoryId: porcoes.id, restaurantId },
    });

    const zone = await prisma.deliveryZone.create({
      data: { name: 'Zona Pedido Isolado', fee: 5, restaurantId },
    });
    await autoAcceptService.update(restaurantId, { enabled: true });
    const order = await orderService.openPublic(restaurantId, {
      orderType: 'DELIVERY',
      customerName: 'Cliente Sem Pastel',
      customerPhone: '11999990011',
      customerCpf: '10000040746',
      declaredPaymentMethod: PaymentMethod.CASH,
      deliveryZoneId: zone.id,
      deliveryStreet: 'Rua Sem Pastel',
      deliveryNumber: '88',
      items: [
        { productId: miniPizzaProduto.id, quantity: 1 },
        { productId: porcao.id, quantity: 1 },
      ],
    });
    await autoAcceptService.update(restaurantId, { enabled: false });

    const jobs = await prisma.printJob.findMany({ where: { orderId: order.id } });
    // Só os papéis da cozinha por TIPO — exclui a via combinada extra do motoboy (ver
    // comentário equivalente no teste "com pastel" acima).
    const kitchenJobs = jobs
      .filter((j) => j.station === Station.KITCHEN)
      .map((j) => j.payload.toString('ascii'))
      .filter((t) => t.includes('COZINHA - '));
    expect(kitchenJobs).toHaveLength(2);
    const miniPizzaPaper = kitchenJobs.find((t) => t.includes('COZINHA - MINI PIZZA'))!;
    const porcaoPaper = kitchenJobs.find((t) => t.includes('COZINHA - PORCAO'))!;

    // Sem pastel no pedido: Mini Pizza vira a via principal — dados completos.
    expect(miniPizzaPaper).toContain('Cliente Sem Pastel');
    expect(miniPizzaPaper).toContain('Tel: 11999990011');
    expect(miniPizzaPaper).toContain('Rua Sem Pastel, 88');

    // Porção continua secundária — só o número do pedido.
    expect(porcaoPaper).toContain(`PEDIDO #${order.number}`);
    expect(porcaoPaper).not.toContain('Cliente Sem Pastel');
    expect(porcaoPaper).not.toContain('Tel:');
    expect(porcaoPaper).not.toContain('Rua Sem Pastel');
  });

  it('categoria "Sugestões da Casa" imprime só o nome do prato, sem a descrição', async () => {
    const category = await prisma.category.create({
      data: { name: 'Sugestões da Casa', station: Station.KITCHEN, restaurantId },
    });
    const product = await prisma.product.create({
      data: {
        name: 'Atum do Rei',
        description: 'Atum em pedacos, mussarela e cebola.',
        price: 18,
        categoryId: category.id,
        restaurantId,
      },
    });
    const table = await prisma.restaurantTable.create({ data: { number: 521, restaurantId } });
    const order = await orderService.open({ tableId: table.id }, { userId: waiterId, tenantId: restaurantId, role: Role.WAITER });
    await orderService.addItems(
      order!.id,
      [{ productId: product.id, quantity: 1 }],
      { userId: waiterId, tenantId: restaurantId, role: Role.WAITER },
    );

    const job = await prisma.printJob.findFirstOrThrow({ where: { orderId: order!.id } });
    const text = job.payload.toString('ascii');
    expect(text).toContain('1- Atum do Rei');
    // Cozinha já sabe o recheio das Sugestões da Casa de cor — pedido do cliente pra não
    // repetir a descrição no ticket (ao contrário de uma categoria comum, ver teste acima).
    expect(text).not.toContain('Atum em pedacos');
  });

  it('"Monte o Seu Pastel" (produto isCustom) imprime só os ingredientes em CAIXA ALTA', async () => {
    const category = await prisma.category.create({
      data: { name: 'Pastéis Salgados', station: Station.KITCHEN, restaurantId },
    });
    const customProduct = await prisma.product.create({
      data: {
        name: 'Monte o Seu Pastel',
        description: 'Monte o Seu (escolha os ingredientes)',
        price: 0,
        isCustom: true,
        categoryId: category.id,
        restaurantId,
      },
    });
    const base = await prisma.additional.create({
      data: { name: 'Frango', kind: AdditionalKind.BASE, price: 12, restaurantId, categoryId: category.id },
    });
    const extra = await prisma.additional.create({
      data: { name: 'Catupiry', kind: AdditionalKind.ADDON, price: 2, restaurantId, categoryId: category.id },
    });

    const table = await prisma.restaurantTable.create({ data: { number: 522, restaurantId } });
    const order = await orderService.open({ tableId: table.id }, { userId: waiterId, tenantId: restaurantId, role: Role.WAITER });
    await orderService.addItems(
      order!.id,
      [{ productId: customProduct.id, quantity: 1, additionalIds: [base.id, extra.id] }],
      { userId: waiterId, tenantId: restaurantId, role: Role.WAITER },
    );

    const job = await prisma.printJob.findFirstOrThrow({ where: { orderId: order!.id } });
    const text = job.payload.toString('ascii');
    expect(text).toContain('FRANGO');
    expect(text).toContain('CATUPIRY');
    // Nem o nome genérico do produto, nem a descrição fixa, nem a linha "+ " separada de
    // adicional — os ingredientes viraram o próprio título do item (ver printJob.service.ts).
    expect(text).not.toContain('Monte o Seu Pastel');
    expect(text).not.toContain('escolha os ingredientes');
    expect(text).not.toContain('+ Catupiry');
    // Papel de cozinha não mostra mais preço nenhum (achado do cliente/dono, Passo 8 —
    // ver hideItemPrice), então a checagem do valor certo (R$14 = base Frango R$12 +
    // adicional Catupiry R$2, não R$0 — achado de produção original) sai do ticket e vai
    // direto no item gravado no banco.
    expect(text).not.toContain('/ un.');
    const orderItem = await prisma.orderItem.findFirstOrThrow({ where: { orderId: order!.id } });
    const additionalsTotal = (
      await prisma.orderItemAdditional.findMany({ where: { orderItemId: orderItem.id } })
    ).reduce((sum, a) => sum + Number(a.price), 0);
    expect(Number(orderItem.unitPrice) + additionalsTotal).toBe(14);
  });

  it('"Monte o Seu Pastel" rejeita um sabor-base de OUTRA categoria (achado de auditoria: substituição de preço)', async () => {
    const pasteisSalgados = await prisma.category.create({
      data: { name: 'Pastéis Salgados Preco', station: Station.KITCHEN, restaurantId },
    });
    const pasteisDoces = await prisma.category.create({
      data: { name: 'Pastéis Doces Preco', station: Station.KITCHEN, restaurantId },
    });
    const customProduct = await prisma.product.create({
      data: {
        name: 'Monte o Seu Pastel',
        price: 0,
        isCustom: true,
        categoryId: pasteisSalgados.id,
        restaurantId,
      },
    });
    // Base de uma categoria DIFERENTE da do produto (ex.: um sabor doce bem mais barato,
    // ou uma base já desativada) — a tela nunca ofereceria isso, mas uma chamada de API
    // direta podia mandar esse id antes da correção, e o item saía pelo preço errado.
    const baseOutraCategoria = await prisma.additional.create({
      data: { name: 'Chocolate Barato', kind: AdditionalKind.BASE, price: 1, restaurantId, categoryId: pasteisDoces.id },
    });
    const baseDesativada = await prisma.additional.create({
      data: {
        name: 'Base Descontinuada',
        kind: AdditionalKind.BASE,
        price: 1,
        restaurantId,
        categoryId: pasteisSalgados.id,
        active: false,
      },
    });

    const table = await prisma.restaurantTable.create({ data: { number: 523, restaurantId } });
    const order = await orderService.open({ tableId: table.id }, { userId: waiterId, tenantId: restaurantId, role: Role.WAITER });

    await expect(
      orderService.addItems(
        order!.id,
        [{ productId: customProduct.id, quantity: 1, additionalIds: [baseOutraCategoria.id] }],
        { userId: waiterId, tenantId: restaurantId, role: Role.WAITER },
      ),
    ).rejects.toThrow(/sabor-base/);

    await expect(
      orderService.addItems(
        order!.id,
        [{ productId: customProduct.id, quantity: 1, additionalIds: [baseDesativada.id] }],
        { userId: waiterId, tenantId: restaurantId, role: Role.WAITER },
      ),
    ).rejects.toThrow(/sabor-base/);
  });

  it('aceite manual de pedido online gera o PrintJob no momento do aceite, não antes', async () => {
    await autoAcceptService.update(restaurantId, { enabled: false });
    const order = await orderService.openPublic(restaurantId, {
      orderType: 'PICKUP',
      customerName: 'Cliente',
      customerPhone: '11999990000',
      customerCpf: '10000044490',
      declaredPaymentMethod: PaymentMethod.CASH,
      items: [{ productId: kitchenProductId, quantity: 1 }],
    });

    expect(await prisma.printJob.count({ where: { orderId: order.id } })).toBe(0);

    await orderService.accept(order.id, { userId: waiterId, tenantId: restaurantId, role: Role.WAITER });
    // Só entrega sai em 2 vias — retirada (como este teste) sai em 1 via só. Ver teste
    // dedicado abaixo pra checar o conteúdo da 2a via de entrega especificamente.
    const jobs = await prisma.printJob.findMany({ where: { orderId: order.id } });
    expect(jobs).toHaveLength(1);
    expect(jobs.every((j) => j.station === Station.KITCHEN)).toBe(true);
  });

  it('aceite automático já gera o PrintJob na criação do pedido', async () => {
    await autoAcceptService.update(restaurantId, { enabled: true });
    const order = await orderService.openPublic(restaurantId, {
      orderType: 'PICKUP',
      customerName: 'Cliente Auto',
      customerPhone: '11999990001',
      customerCpf: '10000048135',
      declaredPaymentMethod: PaymentMethod.CASH,
      items: [{ productId: juiceProductId, quantity: 1 }],
    });
    expect(order.status).toBe(OrderStatus.OPEN);

    // Retirada (PICKUP) sai em 1 via só — 2a via é exclusiva de entrega.
    const jobs = await prisma.printJob.findMany({ where: { orderId: order.id } });
    expect(jobs).toHaveLength(1);
    expect(jobs.every((j) => j.station === Station.JUICE_BAR)).toBe(true);
    await autoAcceptService.update(restaurantId, { enabled: false });
  });

  it('chave de impressão de um tenant não confirma (ack) job de outro tenant', async () => {
    const otherRestaurant = await prisma.restaurant.create({
      data: { name: 'Outro Restaurante', slug: `outro-${randomUUID()}` },
    });

    await autoAcceptService.update(restaurantId, { enabled: true });
    const order = await orderService.openPublic(restaurantId, {
      orderType: 'PICKUP',
      customerName: 'Cliente Isolamento',
      customerPhone: '11999990002',
      customerCpf: '10000051861',
      declaredPaymentMethod: PaymentMethod.CASH,
      items: [{ productId: kitchenProductId, quantity: 1 }],
    });
    await autoAcceptService.update(restaurantId, { enabled: false });
    const job = await prisma.printJob.findFirstOrThrow({ where: { orderId: order.id } });

    // Mesma checagem que a rota POST /print-agent/jobs/:id/ack faz — updateMany com
    // WHERE restaurantId do dono da chave, não findFirst+update.
    const wrongTenantAck = await prisma.printJob.updateMany({
      where: { id: job.id, restaurantId: otherRestaurant.id, status: PrintJobStatus.PENDING },
      data: { status: PrintJobStatus.PRINTED },
    });
    expect(wrongTenantAck.count).toBe(0);

    const stillPending = await prisma.printJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(stillPending.status).toBe(PrintJobStatus.PENDING);

    await prisma.restaurant.delete({ where: { id: otherRestaurant.id } });
  });

  it('pedido de entrega gera ticket com telefone e endereço completo do cliente', async () => {
    const zone = await prisma.deliveryZone.create({
      data: { name: 'Centro - Americana', fee: 5, restaurantId },
    });
    await autoAcceptService.update(restaurantId, { enabled: true });
    const order = await orderService.openPublic(restaurantId, {
      orderType: 'DELIVERY',
      customerName: 'Cliente Entrega',
      customerPhone: '11999990003',
      customerCpf: '10000055506',
      declaredPaymentMethod: PaymentMethod.CASH,
      deliveryZoneId: zone.id,
      deliveryStreet: 'Rua das Laranjeiras',
      deliveryNumber: '123',
      deliveryComplement: 'Apto 4',
      deliveryCep: '13470-000',
      items: [{ productId: kitchenProductId, quantity: 1 }],
    });
    await autoAcceptService.update(restaurantId, { enabled: false });

    const job = await prisma.printJob.findFirstOrThrow({ where: { orderId: order.id } });
    const text = job.payload.toString('ascii');
    expect(text).toContain('Tel: 11999990003');
    expect(text).toContain('Rua das Laranjeiras, 123 - Apto 4');
    expect(text).toContain('Centro - Americana');
    expect(text).toContain('CEP: 13470-000');
    // Papel de cozinha não mostra preço (achado do cliente/dono, Passo 8).
    expect(text).not.toContain('/ un.');
  });

  it('só entrega sai em 2 vias (a segunda marcada); retirada e mesa saem em 1 via só', async () => {
    const zone = await prisma.deliveryZone.create({
      data: { name: 'Zona 2 Vias', fee: 5, restaurantId },
    });
    await autoAcceptService.update(restaurantId, { enabled: true });
    const delivery = await orderService.openPublic(restaurantId, {
      orderType: 'DELIVERY',
      customerName: 'Cliente 2 Vias',
      customerPhone: '11999990004',
      customerCpf: '10000059250',
      declaredPaymentMethod: PaymentMethod.CASH,
      deliveryZoneId: zone.id,
      deliveryStreet: 'Rua Teste',
      deliveryNumber: '1',
      items: [{ productId: kitchenProductId, quantity: 1 }],
    });
    await autoAcceptService.update(restaurantId, { enabled: false });

    const deliveryJobs = await prisma.printJob.findMany({ where: { orderId: delivery.id } });
    expect(deliveryJobs).toHaveLength(2);
    const texts = deliveryJobs.map((j) => j.payload.toString('ascii'));
    expect(texts.filter((t) => t.includes('SEGUNDA VIA MOTOBOY'))).toHaveLength(1);
    expect(texts.filter((t) => !t.includes('SEGUNDA VIA MOTOBOY'))).toHaveLength(1);

    await autoAcceptService.update(restaurantId, { enabled: true });
    const pickup = await orderService.openPublic(restaurantId, {
      orderType: 'PICKUP',
      customerName: 'Cliente Retirada',
      customerPhone: '11999990005',
      customerCpf: '10000062987',
      declaredPaymentMethod: PaymentMethod.CASH,
      items: [{ productId: kitchenProductId, quantity: 1 }],
    });
    await autoAcceptService.update(restaurantId, { enabled: false });
    const pickupJobs = await prisma.printJob.findMany({ where: { orderId: pickup.id } });
    expect(pickupJobs).toHaveLength(1);
    expect(pickupJobs[0].payload.toString('ascii')).not.toContain('SEGUNDA VIA MOTOBOY');

    const table = await prisma.restaurantTable.create({ data: { number: 502, restaurantId } });
    const dineIn = await orderService.open({ tableId: table.id }, { userId: waiterId, tenantId: restaurantId, role: Role.WAITER });
    await orderService.addItems(
      dineIn!.id,
      [{ productId: kitchenProductId, quantity: 1 }],
      { userId: waiterId, tenantId: restaurantId, role: Role.WAITER },
    );
    const dineInJobs = await prisma.printJob.findMany({ where: { orderId: dineIn!.id } });
    expect(dineInJobs).toHaveLength(1);
    expect(dineInJobs[0].payload.toString('ascii')).not.toContain('SEGUNDA VIA MOTOBOY');
  });

  it('entrega com item de cozinha E de suco gera 3 vias: cada estação + uma via única combinada pro motoboy', async () => {
    const zone = await prisma.deliveryZone.create({
      data: { name: 'Zona Via Combinada', fee: 5, restaurantId },
    });
    await autoAcceptService.update(restaurantId, { enabled: true });
    const order = await orderService.openPublic(restaurantId, {
      orderType: 'DELIVERY',
      customerName: 'Cliente Misto',
      customerPhone: '11999990006',
      customerCpf: '10000066621',
      declaredPaymentMethod: PaymentMethod.PIX,
      deliveryZoneId: zone.id,
      deliveryStreet: 'Rua Mista',
      deliveryNumber: '10',
      items: [
        { productId: kitchenProductId, quantity: 1 }, // Pastel, R$10
        { productId: juiceProductId, quantity: 2 }, // Suco, R$8 cada
      ],
    });
    await autoAcceptService.update(restaurantId, { enabled: false });

    // Ordem de criação = ordem de impressão (o print-agent busca por createdAt asc, ver
    // printAgent.routes.ts) — pedido do cliente: cozinha, depois sucos, depois a via
    // combinada do motoboy, nessa sequência, não a ordem em que os itens foram escolhidos.
    const jobs = await prisma.printJob.findMany({ where: { orderId: order.id }, orderBy: { createdAt: 'asc' } });
    expect(jobs).toHaveLength(3);
    const [kitchenJob, juiceJob, motoboyJob] = jobs.map((j) => j.payload.toString('ascii'));

    expect(kitchenJob).toContain('COZINHA');
    expect(kitchenJob).toContain('1- Pastel');
    expect(kitchenJob).not.toContain('Suco');
    expect(kitchenJob).not.toContain('SEGUNDA VIA MOTOBOY');
    expect(kitchenJob).not.toContain('PEDIDO COM BEBIDAS');
    expect(kitchenJob).not.toContain('TOTAL DO PEDIDO');
    // Pedido também tem suco (via do suqueiros) — avisa quem só vê a via da cozinha, pra
    // não esquecer de buscar o resto do pedido (pedido explícito do cliente). Uma família
    // por linha — suco de verdade (categoria "Sucos" exata) vira "SUCO", não o genérico
    // "BEBIDA" de antes.
    expect(kitchenJob).toContain('* ITENS INCLUSOS\n');
    expect(kitchenJob).toContain('* SUCO\n');

    expect(juiceJob).toContain('SUQUEIROS');
    expect(juiceJob).toContain('2- Suco');
    expect(juiceJob).not.toContain('Pastel');
    expect(juiceJob).not.toContain('SEGUNDA VIA MOTOBOY');
    expect(juiceJob).not.toContain('PEDIDO COM BEBIDAS');
    expect(juiceJob).not.toContain('TOTAL DO PEDIDO');
    // Mesmo aviso na direção contrária — categoria de teste é "Cozinha" (genérica, ver
    // beforeAll), então cai no fallback "COMIDA" (não bate pastel/mini pizza/porção).
    expect(juiceJob).toContain('* ITENS INCLUSOS\n');
    expect(juiceJob).toContain('* COMIDA\n');

    // A via do motoboy não estampa "COZINHA" nem "SUQUEIROS" no topo (reúne as duas), nem
    // um cabeçalho grande próprio (removido a pedido do cliente pra economizar papel) —
    // traz só a CONTAGEM por família (achado do cliente/dono: a via estava detalhada
    // demais, o motoboy só precisa saber se tem e quantos de cada tipo), avisa que tem
    // bebida e mostra o total (10 do pastel + 2×8 dos sucos + 5 de taxa de entrega, sem
    // serviço em online). Categoria de cozinha do fixture é "Cozinha" (genérica, sem bater
    // pastel/mini pizza/porção por nome) — cai no fallback "COMIDA" (ver motoboySummaryItems).
    expect(motoboyJob).toContain('SEGUNDA VIA MOTOBOY');
    expect(motoboyJob).toContain('ITENS INCLUSOS: BEBIDA');
    expect(motoboyJob).toContain('TOTAL DO PEDIDO: R$ 31,00');
    // Logo abaixo do total — pedido explícito do cliente/dono: motoboy confere quanto do
    // valor é frete sem abrir o sistema.
    expect(motoboyJob.indexOf('TAXA DE ENTREGA: R$ 5,00')).toBeGreaterThan(motoboyJob.indexOf('TOTAL DO PEDIDO'));
    expect(motoboyJob).toContain('1- COMIDA');
    expect(motoboyJob).toContain('2- SUCO');
    // Sem o preço/descrição por item que a via de cozinha/suco mostra — só a contagem.
    expect(motoboyJob).not.toContain('R$ 10,00 / un.');
    expect(motoboyJob).not.toContain('R$ 8,00 / un.');
    expect(motoboyJob).not.toContain('COZINHA');
    expect(motoboyJob).not.toContain('SUQUEIROS');
  });

  it('via do motoboy agrupa por família (Pastel, Mini Pizza, Porção, Suco, Bebidas Prontas) com a quantidade de cada, achado do cliente/dono', async () => {
    const pasteis = await prisma.category.create({
      data: { name: 'Pastéis Salgados Motoboy', station: Station.KITCHEN, restaurantId },
    });
    const miniPizza = await prisma.category.create({
      data: { name: 'Mini Pizza Salgada Motoboy', station: Station.KITCHEN, restaurantId },
    });
    const porcoes = await prisma.category.create({ data: { name: 'Porções Motoboy', station: Station.KITCHEN, restaurantId } });
    const acai = await prisma.category.create({ data: { name: 'Açaí e Cupuaçu Motoboy', station: Station.JUICE_BAR, restaurantId } });

    const pastel = await prisma.product.create({ data: { name: 'Calabresa', price: 14, categoryId: pasteis.id, restaurantId } });
    const pastel2 = await prisma.product.create({ data: { name: 'Frango', price: 14, categoryId: pasteis.id, restaurantId } });
    const pizza = await prisma.product.create({ data: { name: 'Marguerita', price: 16, categoryId: miniPizza.id, restaurantId } });
    const porcao = await prisma.product.create({ data: { name: 'Batata Frita', price: 20, categoryId: porcoes.id, restaurantId } });
    const acaiProduto = await prisma.product.create({ data: { name: 'Açaí 500ml', price: 19, categoryId: acai.id, restaurantId } });

    const zone = await prisma.deliveryZone.create({ data: { name: 'Zona Resumo Motoboy', fee: 0, restaurantId } });
    await autoAcceptService.update(restaurantId, { enabled: true });
    const order = await orderService.openPublic(restaurantId, {
      orderType: 'DELIVERY',
      customerName: 'Cliente Resumo',
      customerPhone: '11999990009',
      customerCpf: '10000029696',
      declaredPaymentMethod: PaymentMethod.PIX,
      deliveryZoneId: zone.id,
      deliveryStreet: 'Rua Resumo',
      deliveryNumber: '1',
      items: [
        { productId: pastel.id, quantity: 2 },
        { productId: pastel2.id, quantity: 1 }, // soma com o de cima: 3 na família PASTEL
        { productId: pizza.id, quantity: 1 },
        { productId: porcao.id, quantity: 1 },
        { productId: juiceProductId, quantity: 2 }, // Suco
        { productId: acaiProduto.id, quantity: 1 }, // Bebidas Prontas (não é "Sucos")
      ],
    });
    await autoAcceptService.update(restaurantId, { enabled: false });

    const motoboyJob = (
      await prisma.printJob.findFirstOrThrow({ where: { orderId: order.id }, orderBy: { createdAt: 'desc' } })
    ).payload.toString('ascii');
    expect(motoboyJob).toContain('3- PASTEL');
    expect(motoboyJob).toContain('1- MINI PIZZA');
    expect(motoboyJob).toContain('1- PORCAO');
    expect(motoboyJob).toContain('2- SUCO');
    // Bebida pronta é a exceção: sai pelo NOME de cada uma, com a quantidade — "1- BEBIDAS
    // PRONTAS" não dizia o que o motoboy devia levar (pedido explícito do cliente/dono).
    expect(motoboyJob).toContain('1- Acai 500ml');
    expect(motoboyJob).not.toContain('BEBIDAS PRONTAS');
    // Nenhum nome de sabor de COZINHA/suco aparece — essas famílias seguem só na contagem.
    expect(motoboyJob).not.toContain('Calabresa');
    expect(motoboyJob).not.toContain('Frango');
    expect(motoboyJob).not.toContain('Marguerita');
  });

  it('via do motoboy soma a quantidade por bebida e lista cada uma pelo nome', async () => {
    const bebidas = await prisma.category.create({
      data: { name: 'Bebidas Soma Motoboy', station: Station.JUICE_BAR, restaurantId },
    });
    const coca = await prisma.product.create({
      data: { name: 'Coca-Cola 2L', price: 15, categoryId: bebidas.id, restaurantId },
    });
    const cerveja = await prisma.product.create({
      data: { name: 'Cerveja Long Neck', price: 8, categoryId: bebidas.id, restaurantId },
    });
    const zone = await prisma.deliveryZone.create({ data: { name: 'Zona Soma Bebida', fee: 0, restaurantId } });
    await autoAcceptService.update(restaurantId, { enabled: true });
    const order = await orderService.openPublic(restaurantId, {
      orderType: 'DELIVERY',
      customerName: 'Cliente Bebidas',
      customerPhone: '11999990011',
      customerCpf: '10000045503',
      declaredPaymentMethod: PaymentMethod.CASH,
      deliveryZoneId: zone.id,
      deliveryStreet: 'Rua Bebidas',
      deliveryNumber: '3',
      items: [
        { productId: kitchenProductId, quantity: 1 },
        { productId: coca.id, quantity: 1 },
        { productId: cerveja.id, quantity: 2 },
        { productId: cerveja.id, quantity: 1 }, // item separado, mesma bebida: soma 3
      ],
    });
    await autoAcceptService.update(restaurantId, { enabled: false });

    const motoboyJob = (
      await prisma.printJob.findFirstOrThrow({ where: { orderId: order.id }, orderBy: { createdAt: 'desc' } })
    ).payload.toString('ascii');
    expect(motoboyJob).toContain('1- Coca-Cola 2L');
    expect(motoboyJob).toContain('3- Cerveja Long Neck');
  });

  it('entrega só com item de cozinha (sem bebida) não mostra o aviso de bebidas na via do motoboy', async () => {
    const zone = await prisma.deliveryZone.create({
      data: { name: 'Zona Sem Bebida', fee: 0, restaurantId },
    });
    await autoAcceptService.update(restaurantId, { enabled: true });
    const order = await orderService.openPublic(restaurantId, {
      orderType: 'DELIVERY',
      customerName: 'Cliente Só Comida',
      customerPhone: '11999990007',
      customerCpf: '10000070300',
      declaredPaymentMethod: PaymentMethod.CASH,
      deliveryZoneId: zone.id,
      deliveryStreet: 'Rua Sem Bebida',
      deliveryNumber: '20',
      items: [{ productId: kitchenProductId, quantity: 1 }],
    });
    await autoAcceptService.update(restaurantId, { enabled: false });

    const motoboyJob = (
      await prisma.printJob.findFirstOrThrow({ where: { orderId: order.id }, orderBy: { createdAt: 'desc' } })
    ).payload.toString('ascii');
    expect(motoboyJob).toContain('SEGUNDA VIA MOTOBOY');
    expect(motoboyJob).toContain('TOTAL DO PEDIDO: R$ 10,00');
    expect(motoboyJob).not.toContain('PEDIDO COM BEBIDAS');
    // Bairro de taxa 0 — sem linha de taxa de entrega nenhuma (nem "R$ 0,00").
    expect(motoboyJob).not.toContain('TAXA DE ENTREGA');
  });

  it('retirada com pastel E suco: cada via avisa da outra (sem via de motoboy, que é só de entrega)', async () => {
    // Categorias com nome de verdade (não a "Cozinha" genérica do beforeAll) pra testar o
    // resumo específico do aviso ("PASTEL", não o fallback genérico "COMIDA"). Nome
    // diferente do usado no teste do "Monte o Seu Pastel" acima — mesmo restaurantId
    // (compartilhado por todo o describe), e a categoria tem @@unique([restaurantId, name]).
    const pasteisSalgados = await prisma.category.create({
      data: { name: 'Pastéis Salgados Retirada', station: Station.KITCHEN, restaurantId },
    });
    const pastel = await prisma.product.create({
      data: { name: 'Calabresa', price: 12, categoryId: pasteisSalgados.id, restaurantId },
    });

    await autoAcceptService.update(restaurantId, { enabled: true });
    const order = await orderService.openPublic(restaurantId, {
      orderType: 'PICKUP',
      customerName: 'Cliente Retirada Mista',
      customerPhone: '11999990008',
      customerCpf: '10000074055',
      declaredPaymentMethod: PaymentMethod.PIX,
      items: [
        { productId: pastel.id, quantity: 1 },
        { productId: juiceProductId, quantity: 1 },
      ],
    });
    await autoAcceptService.update(restaurantId, { enabled: false });

    // Retirada não ganha via de motoboy (só entrega ganha) — só as 2 vias de produção.
    const jobs = await prisma.printJob.findMany({ where: { orderId: order.id } });
    expect(jobs).toHaveLength(2);
    const kitchenJob = jobs.find((j) => j.station === Station.KITCHEN)!.payload.toString('ascii');
    const juiceJob = jobs.find((j) => j.station === Station.JUICE_BAR)!.payload.toString('ascii');

    expect(kitchenJob).toContain('* ITENS INCLUSOS\n');
    expect(kitchenJob).toContain('* SUCO\n');
    expect(juiceJob).toContain('* ITENS INCLUSOS\n');
    expect(juiceJob).toContain('* PASTEL\n');

    // Passo 3 (achado do cliente/dono): com pastel E suco no mesmo pedido, só a via
    // principal (Pastel, maior prioridade — PASTEL > MINI PIZZA > PORÇÃO > SUCOS) leva
    // nome/telefone do cliente; a via dos suqueiros vira resumida (só o número do pedido),
    // mesmo sendo a única via de suco. Generaliza a regra que já existia só entre papéis
    // de cozinha pra incluir suco também.
    expect(kitchenJob).toContain('Cliente Retirada Mista');
    expect(kitchenJob).toContain('Tel: 11999990008');
    expect(juiceJob).not.toContain('Cliente Retirada Mista');
    expect(juiceJob).not.toContain('Tel:');
  });

  it('pedido só de suco (sem cozinha nenhuma): a via dos suqueiros vira a principal e leva os dados completos do cliente', async () => {
    // Passo 3 (achado do cliente/dono): "endereço e dados do cliente só constar na via dos
    // suqueiros se o pedido tiver apenas suco" — sem nenhum item de cozinha no pedido, a
    // via dos suqueiros é a única via de produção e vira a principal.
    const zone = await prisma.deliveryZone.create({ data: { name: 'Zona Só Suco', fee: 0, restaurantId } });
    await autoAcceptService.update(restaurantId, { enabled: true });
    const order = await orderService.openPublic(restaurantId, {
      orderType: 'DELIVERY',
      customerName: 'Cliente Só Suco',
      customerPhone: '11999990012',
      customerCpf: '10000003700',
      declaredPaymentMethod: PaymentMethod.PIX,
      deliveryZoneId: zone.id,
      deliveryStreet: 'Rua Só Suco',
      deliveryNumber: '1',
      items: [{ productId: juiceProductId, quantity: 1 }],
    });
    await autoAcceptService.update(restaurantId, { enabled: false });

    const juiceJob = (
      await prisma.printJob.findFirstOrThrow({ where: { orderId: order.id, station: Station.JUICE_BAR } })
    ).payload.toString('ascii');
    // toAscii() tira acento pro ticket (compatibilidade da impressora) — "Só" vira "So".
    expect(juiceJob).toContain('Cliente So Suco');
    expect(juiceJob).toContain('Tel: 11999990012');
    expect(juiceJob).toContain('Rua So Suco, 1');
  });

  it('Passo 8: bebida pronta sai do corpo da via dos suqueiros e só é mencionada por nome na via principal (retirada)', async () => {
    const pasteis = await prisma.category.create({
      data: { name: 'Pastéis Salgados Bebida Pronta', station: Station.KITCHEN, restaurantId },
    });
    const bebidas = await prisma.category.create({ data: { name: 'Bebidas Prontas Teste', station: Station.JUICE_BAR, restaurantId } });
    const pastel = await prisma.product.create({ data: { name: 'Calabresa', price: 12, categoryId: pasteis.id, restaurantId } });
    const cerveja = await prisma.product.create({ data: { name: 'Cerveja Long Neck', price: 9, categoryId: bebidas.id, restaurantId } });

    await autoAcceptService.update(restaurantId, { enabled: true });
    const order = await orderService.openPublic(restaurantId, {
      orderType: 'PICKUP',
      customerName: 'Cliente Bebida Pronta',
      customerPhone: '11999990013',
      customerCpf: '10000007455',
      declaredPaymentMethod: PaymentMethod.PIX,
      items: [
        { productId: pastel.id, quantity: 1 },
        { productId: juiceProductId, quantity: 1 }, // Suco de verdade
        { productId: cerveja.id, quantity: 2 }, // Bebida pronta
      ],
    });
    await autoAcceptService.update(restaurantId, { enabled: false });

    const jobs = await prisma.printJob.findMany({ where: { orderId: order.id } });
    const kitchenJob = jobs.find((j) => j.station === Station.KITCHEN)!.payload.toString('ascii');
    const juiceJob = jobs.find((j) => j.station === Station.JUICE_BAR)!.payload.toString('ascii');

    // Via principal (Pastel, maior prioridade) lista as famílias uma por linha, com bebida
    // pronta por ÚLTIMO, e logo abaixo o nome de cada bebida com a quantidade.
    expect(kitchenJob).toContain('* ITENS INCLUSOS\n');
    expect(kitchenJob).toContain('* SUCO\n');
    expect(kitchenJob).toContain('* BEBIDA PRONTA\n');
    expect(kitchenJob).toContain('(2 Cerveja Long Neck)');
    expect(kitchenJob.indexOf('* BEBIDA PRONTA\n')).toBeGreaterThan(kitchenJob.indexOf('* SUCO\n'));
    expect(kitchenJob.indexOf('(2 Cerveja Long Neck)')).toBeGreaterThan(kitchenJob.indexOf('* BEBIDA PRONTA\n'));

    // Via dos suqueiros continua com o suco de verdade no corpo, mas SEM a cerveja — ela
    // não é mais um item normal dessa via (achado do cliente/dono, Passo 8).
    expect(juiceJob).toContain('1- Suco');
    expect(juiceJob).not.toContain('Cerveja');
    // E não é a via principal aqui (Pastel é) — sem a família nem os nomes de bebida nela.
    expect(juiceJob).not.toContain('BEBIDA PRONTA');
  });

  it('numa ENTREGA, bebida pronta sai por nome TANTO na via principal quanto na do motoboy', async () => {
    const pasteis = await prisma.category.create({
      data: { name: 'Pastéis Salgados Bebida Entrega', station: Station.KITCHEN, restaurantId },
    });
    const bebidas = await prisma.category.create({ data: { name: 'Bebidas Prontas Entrega', station: Station.JUICE_BAR, restaurantId } });
    const pastel = await prisma.product.create({ data: { name: 'Calabresa', price: 12, categoryId: pasteis.id, restaurantId } });
    const refrigerante = await prisma.product.create({ data: { name: 'Coca-Cola Lata', price: 7, categoryId: bebidas.id, restaurantId } });

    const zone = await prisma.deliveryZone.create({ data: { name: 'Zona Bebida Entrega', fee: 0, restaurantId } });
    await autoAcceptService.update(restaurantId, { enabled: true });
    const order = await orderService.openPublic(restaurantId, {
      orderType: 'DELIVERY',
      customerName: 'Cliente Bebida Entrega',
      customerPhone: '11999990014',
      customerCpf: '10000011134',
      declaredPaymentMethod: PaymentMethod.PIX,
      deliveryZoneId: zone.id,
      deliveryStreet: 'Rua Bebida Entrega',
      deliveryNumber: '1',
      items: [
        { productId: pastel.id, quantity: 1 },
        { productId: refrigerante.id, quantity: 1 },
      ],
    });
    await autoAcceptService.update(restaurantId, { enabled: false });

    const jobs = await prisma.printJob.findMany({ where: { orderId: order.id } });
    const kitchenJob = jobs.find((j) => j.station === Station.KITCHEN)!.payload.toString('ascii');
    const motoboyJob = jobs.find((j) => j.payload.toString('ascii').includes('SEGUNDA VIA MOTOBOY'))!.payload.toString('ascii');

    // Agora a via principal TAMBÉM lista a bebida por nome em entrega (antes essa menção
    // morava só na via do motoboy) — quem monta a sacola precisa da lista tanto quanto
    // quem entrega, pedido explícito do cliente/dono a partir da via anotada pelo lead.
    expect(kitchenJob).toContain('* BEBIDA PRONTA\n');
    expect(kitchenJob).toContain('(Coca-Cola Lata)');
    // A bebida continua fora do CORPO da via de produção (não é item de preparo) — só a
    // menção no aviso do topo, antes da primeira linha divisória de item.
    expect(kitchenJob).not.toContain('1- Coca-Cola Lata');
    // Na via do motoboy, cada bebida sai pelo nome com a quantidade, no lugar do antigo
    // "1- BEBIDAS PRONTAS" genérico.
    expect(motoboyJob).toContain('1- Coca-Cola Lata');
    expect(motoboyJob).not.toContain('BEBIDAS PRONTAS');
  });

  it('verifyAgentKey() só valida a chave certa do tenant certo', async () => {
    const { key } = await printerSettingsService.generateAgentKey(restaurantId, { userId: waiterId });

    await expect(verifyAgentKey(key)).resolves.toBe(restaurantId);
    await expect(verifyAgentKey(`${restaurantId}.chave-errada`)).resolves.toBeNull();
    await expect(verifyAgentKey('lixo-sem-formato')).resolves.toBeNull();

    // Regenerar invalida a chave anterior na hora.
    await printerSettingsService.generateAgentKey(restaurantId, { userId: waiterId });
    await expect(verifyAgentKey(key)).resolves.toBeNull();
  });
});
