import { Router } from 'express';
import { Station } from '@prisma/client';
import { asyncHandler } from '../../utils/http';
import { authenticate } from '../middlewares/auth.middleware';
import { productionService } from '../../application/services/production.service';

const router = Router();
router.use(authenticate);

// Kitchen queue (pastéis, mini pizzas, porções...)
router.get(
  '/kitchen',
  asyncHandler(async (_req, res) => res.json(await productionService.queue(Station.KITCHEN))),
);

// Juice bar queue (sucos, refrigerantes, água...)
router.get(
  '/juice-bar',
  asyncHandler(async (_req, res) => res.json(await productionService.queue(Station.JUICE_BAR))),
);

export default router;
