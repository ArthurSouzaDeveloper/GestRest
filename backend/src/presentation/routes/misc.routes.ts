import { Router } from 'express';
import { Role } from '@prisma/client';
import { asyncHandler } from '../../utils/http';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import { dashboardService } from '../../application/services/dashboard.service';
import { userService } from '../../application/services/user.service';
import { auditService } from '../../application/services/audit.service';
import { superadminService } from '../../application/services/superadmin.service';
import {
  createRestaurantSchema,
  createUserSchema,
  updateUserSchema,
} from '../validators/schemas';
import { ctx } from './context';

// ── Dashboard ──
export const dashboardRouter = Router();
dashboardRouter.use(authenticate);
dashboardRouter.get(
  '/',
  authorize(Role.ADMIN, Role.MANAGER),
  asyncHandler(async (req, res) => res.json(await dashboardService.summary(ctx(req).tenantId))),
);

// ── Users (dentro do restaurante) ──
export const userRouter = Router();
userRouter.use(authenticate, authorize(Role.ADMIN, Role.MANAGER));
userRouter.get('/', asyncHandler(async (req, res) => res.json(await userService.list(ctx(req).tenantId))));
userRouter.post(
  '/',
  validateBody(createUserSchema),
  asyncHandler(async (req, res) =>
    res.status(201).json(await userService.create(ctx(req).tenantId, req.body, ctx(req))),
  ),
);
userRouter.patch(
  '/:id',
  validateBody(updateUserSchema),
  asyncHandler(async (req, res) =>
    res.json(await userService.update(ctx(req).tenantId, req.params.id, req.body)),
  ),
);

// ── Audit ──
export const auditRouter = Router();
auditRouter.use(authenticate, authorize(Role.ADMIN, Role.MANAGER));
auditRouter.get(
  '/',
  asyncHandler(async (req, res) =>
    res.json(
      await auditService.list({
        tenantId: ctx(req).tenantId,
        skip: Number(req.query.skip ?? 0),
        take: Number(req.query.take ?? 50),
      }),
    ),
  ),
);

// ── Superadmin (plataforma — cria/gerencia restaurantes) ──
export const superadminRouter = Router();
superadminRouter.use(authenticate, authorize(Role.SUPERADMIN));
superadminRouter.get(
  '/restaurants',
  asyncHandler(async (_req, res) => res.json(await superadminService.listRestaurants())),
);
superadminRouter.post(
  '/restaurants',
  validateBody(createRestaurantSchema),
  asyncHandler(async (req, res) =>
    res.status(201).json(
      await superadminService.createRestaurant(req.body, { userId: req.user!.sub, ip: req.ip }),
    ),
  ),
);
superadminRouter.patch(
  '/restaurants/:id',
  asyncHandler(async (req, res) =>
    res.json(await superadminService.setActive(req.params.id, Boolean(req.body.active))),
  ),
);

// ── Público: resolve restaurante por slug (tela de login com marca) ──
export const publicRouter = Router();
publicRouter.get(
  '/restaurants/:slug',
  asyncHandler(async (req, res) => res.json(await superadminService.publicBySlug(req.params.slug))),
);
