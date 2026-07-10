import { Router } from 'express';
import { Role } from '@prisma/client';
import { asyncHandler } from '../../utils/http';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import { tableService } from '../../application/services/table.service';
import { tableSchema } from '../validators/schemas';

const router = Router();
router.use(authenticate);

router.get('/', asyncHandler(async (_req, res) => res.json(await tableService.list())));

router.post(
  '/',
  authorize(Role.ADMIN, Role.MANAGER),
  validateBody(tableSchema),
  asyncHandler(async (req, res) => res.status(201).json(await tableService.create(req.body))),
);

router.delete(
  '/:id',
  authorize(Role.ADMIN, Role.MANAGER),
  asyncHandler(async (req, res) => {
    await tableService.remove(req.params.id);
    res.status(204).end();
  }),
);

export default router;
