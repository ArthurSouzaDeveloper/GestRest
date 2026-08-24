import { Router } from 'express';
import { PrintJobStatus, Station } from '@prisma/client';
import { asyncHandler } from '../../utils/http';
import { AppError, NotFoundError } from '../../utils/errors';
import { authenticatePrinterAgent } from '../middlewares/printerAgent.middleware';
import { prisma } from '../../config/prisma';

/**
 * Rotas consumidas pela ponte de impressão local (ver docs/superpowers/specs/
 * 2026-08-24-impressao-termica-auto-aceite-design.md) — autenticadas por
 * authenticatePrinterAgent (chave própria, não é login de funcionário), montadas
 * direto em app.ts fora do router /api (sem authenticate/apiLimiter de staff — tem
 * seu próprio rate limiter, ver rateLimit.middleware.ts).
 */
const router = Router();
router.use(authenticatePrinterAgent);

const MAX_JOBS_PER_POLL = 20;

router.get(
  '/jobs',
  asyncHandler(async (req, res) => {
    const stationParam = req.query.station;
    if (stationParam !== undefined && stationParam !== Station.KITCHEN && stationParam !== Station.JUICE_BAR) {
      throw new AppError('station deve ser KITCHEN ou JUICE_BAR');
    }

    const jobs = await prisma.printJob.findMany({
      where: {
        restaurantId: req.printerRestaurantId,
        status: PrintJobStatus.PENDING,
        station: stationParam as Station | undefined,
      },
      orderBy: { createdAt: 'asc' },
      take: MAX_JOBS_PER_POLL,
      select: { id: true, station: true, payload: true, createdAt: true },
    });

    res.json(jobs.map((j) => ({ id: j.id, station: j.station, payload: j.payload.toString('base64'), createdAt: j.createdAt })));
  }),
);

router.post(
  '/jobs/:id/ack',
  asyncHandler(async (req, res) => {
    // updateMany com WHERE restaurantId (não findFirst+update): garante em uma única
    // operação atômica que a ponte de um tenant nunca confirma o job de outro, sem
    // vazar se o id existe (mesmo cuidado de isolamento já aplicado no resto do sistema).
    const updated = await prisma.printJob.updateMany({
      where: { id: req.params.id, restaurantId: req.printerRestaurantId, status: PrintJobStatus.PENDING },
      data: { status: PrintJobStatus.PRINTED, printedAt: new Date() },
    });
    if (updated.count === 0) throw new NotFoundError('Trabalho de impressão');
    res.status(204).end();
  }),
);

export default router;
