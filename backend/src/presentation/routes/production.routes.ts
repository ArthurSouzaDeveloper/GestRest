import { Router } from 'express';
import { Station } from '@prisma/client';
import { asyncHandler } from '../../utils/http';
import { authenticate } from '../middlewares/auth.middleware';
import { productionService } from '../../application/services/production.service';
import { ctx } from './context';

const router = Router();
router.use(authenticate);

// Kitchen queue (pastéis, mini pizzas, porções...)
router.get(
  '/kitchen',
  asyncHandler(async (req, res) =>
    res.json(await productionService.queue(ctx(req).tenantId, Station.KITCHEN)),
  ),
);

// Juice bar queue (sucos, refrigerantes, água...)
router.get(
  '/juice-bar',
  asyncHandler(async (req, res) =>
    res.json(await productionService.queue(ctx(req).tenantId, Station.JUICE_BAR)),
  ),
);

export default router;
