import { Router } from 'express';
import { Role } from '@prisma/client';
import { asyncHandler } from '../../utils/http';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import { dashboardService } from '../../application/services/dashboard.service';
import { userService } from '../../application/services/user.service';
import { auditService } from '../../application/services/audit.service';
import { createUserSchema, updateUserSchema } from '../validators/schemas';
import { ctx } from './context';

// ── Dashboard ──
export const dashboardRouter = Router();
dashboardRouter.use(authenticate);
dashboardRouter.get(
  '/',
  authorize(Role.ADMIN, Role.MANAGER),
  asyncHandler(async (_req, res) => res.json(await dashboardService.summary())),
);

// ── Users ──
export const userRouter = Router();
userRouter.use(authenticate, authorize(Role.ADMIN, Role.MANAGER));
userRouter.get('/', asyncHandler(async (_req, res) => res.json(await userService.list())));
userRouter.post(
  '/',
  validateBody(createUserSchema),
  asyncHandler(async (req, res) => res.status(201).json(await userService.create(req.body, ctx(req)))),
);
userRouter.patch(
  '/:id',
  validateBody(updateUserSchema),
  asyncHandler(async (req, res) => res.json(await userService.update(req.params.id, req.body))),
);

// ── Audit ──
export const auditRouter = Router();
auditRouter.use(authenticate, authorize(Role.ADMIN, Role.MANAGER));
auditRouter.get(
  '/',
  asyncHandler(async (req, res) =>
    res.json(
      await auditService.list({
        skip: Number(req.query.skip ?? 0),
        take: Number(req.query.take ?? 50),
      }),
    ),
  ),
);
