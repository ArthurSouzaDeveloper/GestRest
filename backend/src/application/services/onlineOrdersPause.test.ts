import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../config/prisma';
import { onlineOrdersPauseService as svc } from './onlineOrdersPause.service';
import { lastClosingKey } from './deliveryHours';

// Horários em UTC; SP = UTC-3.
const QUARTA_15H = new Date('2026-11-11T18:00:00Z');
const QUARTA_2319 = new Date('2026-11-12T02:19:00Z');
const QUARTA_2320 = new Date('2026-11-12T02:20:00Z');
const QUARTA_2330 = new Date('2026-11-12T02:30:00Z');
const QUINTA_0200 = new Date('2026-11-12T05:00:00Z');
const QUINTA_1000 = new Date('2026-11-12T13:00:00Z');
const QUINTA_2320 = new Date('2026-11-13T02:20:00Z');

describe('pausa automática dos pedidos online às 23:20', () => {
  let restaurantId: string;
  const actor = {};

  beforeAll(async () => {
    restaurantId = (await prisma.restaurant.create({ data: { name: 'Teste Pausa', slug: `teste-pausa-${randomUUID()}` } })).id;
  });
  afterAll(async () => {
    await prisma.restaurant.delete({ where: { id: restaurantId } });
  });

  it('lastClosingKey: antes das 23:20 é o dia anterior, a partir das 23:20 é hoje (fuso SP)', () => {
    expect(lastClosingKey(QUARTA_2319)).toBe('2026-11-10');
    expect(lastClosingKey(QUARTA_2320)).toBe('2026-11-11');
    expect(lastClosingKey(QUINTA_0200)).toBe('2026-11-11');
  });

  it('desligada, não pausa nunca', async () => {
    await svc.sweep({ restaurantId, now: QUARTA_2330 });
    expect((await svc.get(restaurantId)).paused).toBe(false);
  });

  it('ligar de tarde não pausa na hora; pausa às 23:20, uma vez só; quem retoma não é pausado de novo até a próxima noite', async () => {
    await svc.update(restaurantId, { autoPauseAfterClose: true }, actor, QUARTA_15H);
    await svc.sweep({ restaurantId, now: QUARTA_15H });
    await svc.sweep({ restaurantId, now: QUARTA_2319 });
    expect((await svc.get(restaurantId)).paused).toBe(false);

    await svc.sweep({ restaurantId, now: QUARTA_2320 });
    const paused = await svc.get(restaurantId);
    expect(paused).toMatchObject({ paused: true, pausedAutomatically: true, reason: null, autoPauseAfterClose: true });

    // Dono retoma na manhã seguinte: continua aberto (site só aceita a partir das 18h pelo horário).
    await svc.update(restaurantId, { paused: false }, actor, QUINTA_1000);
    await svc.sweep({ restaurantId, now: QUINTA_1000 });
    expect((await svc.get(restaurantId)).paused).toBe(false);

    // Próxima noite pausa de novo.
    await svc.sweep({ restaurantId, now: QUINTA_2320 });
    expect((await svc.get(restaurantId)).paused).toBe(true);
  });

  it('servidor fora do ar às 23:20: pausa quando voltar de madrugada', async () => {
    await svc.update(restaurantId, { paused: false, autoPauseAfterClose: false }, actor);
    await prisma.restaurant.update({ where: { id: restaurantId }, data: { autoPauseAfterClose: true, onlineOrdersAutoPausedOn: '2026-11-10' } });
    await svc.sweep({ restaurantId, now: QUINTA_0200 });
    expect((await svc.get(restaurantId)).pausedAutomatically).toBe(true);
  });

  it('já pausado à mão com recado: mantém o recado e não marca como automático', async () => {
    await prisma.restaurant.update({ where: { id: restaurantId }, data: { onlineOrdersAutoPausedOn: '2026-11-10' } });
    await svc.update(restaurantId, { paused: true, reason: 'Sem energia.' }, actor, QUARTA_15H);
    await svc.sweep({ restaurantId, now: QUARTA_2330 });
    expect(await svc.get(restaurantId)).toMatchObject({ paused: true, reason: 'Sem energia.', pausedAutomatically: false });
  });
});
