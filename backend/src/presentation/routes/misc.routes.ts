import { Router } from 'express';
import { Role } from '@prisma/client';
import { asyncHandler } from '../../utils/http';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import { logoUpload } from '../middlewares/upload.middleware';
import { dashboardService } from '../../application/services/dashboard.service';
import { userService } from '../../application/services/user.service';
import { customerService } from '../../application/services/customer.service';
import { auditService } from '../../application/services/audit.service';
import { superadminService } from '../../application/services/superadmin.service';
import { brandingService } from '../../application/services/branding.service';
import { AppError } from '../../utils/errors';
import {
  brandingColorSchema,
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
  asyncHandler(async (req, res) => {
    const c = ctx(req);
    res.json(await userService.update(c.tenantId, req.params.id, req.body, { userId: c.userId, role: c.role, ip: c.ip }));
  }),
);
userRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const c = ctx(req);
    res.json(await userService.remove(c.tenantId, req.params.id, { userId: c.userId, ip: c.ip }));
  }),
);

// ── Clientes (LGPD — direito do titular à eliminação, ver customer.service.ts) ──
// Só ADMIN: é uma ação irreversível, tratada como decisão administrativa, não operacional.
export const customerRouter = Router();
customerRouter.use(authenticate, authorize(Role.ADMIN));
customerRouter.get('/', asyncHandler(async (req, res) => res.json(await customerService.list(ctx(req).tenantId))));
customerRouter.post(
  '/:id/anonymize',
  asyncHandler(async (req, res) =>
    res.json(await customerService.anonymize(ctx(req).tenantId, req.params.id, { userId: req.user!.sub, ip: req.ip })),
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
    res.json(
      await superadminService.setActive(req.params.id, Boolean(req.body.active), {
        userId: req.user!.sub,
        ip: req.ip,
      }),
    ),
  ),
);
superadminRouter.delete(
  '/restaurants/:id',
  asyncHandler(async (req, res) => {
    await superadminService.removeRestaurant(req.params.id, { userId: req.user!.sub, ip: req.ip });
    res.status(204).end();
  }),
);

// ── Identidade visual (cor + logo) do site público — só o superadmin mexe aqui, pedido
// explícito do cliente: quem administra o restaurante não deve poder trocar isso sozinho. ──
superadminRouter.get(
  '/restaurants/:id/branding',
  asyncHandler(async (req, res) => res.json(await brandingService.get(req.params.id))),
);
superadminRouter.patch(
  '/restaurants/:id/branding',
  validateBody(brandingColorSchema),
  asyncHandler(async (req, res) => res.json(await brandingService.updateColor(req.params.id, req.body.brandColor))),
);
superadminRouter.post(
  '/restaurants/:id/branding/logo',
  logoUpload,
  asyncHandler(async (req, res) => {
    if (!req.file) throw new AppError('Envie um arquivo de imagem');
    res.json(await brandingService.updateLogo(req.params.id, req.file.filename));
  }),
);

// ── Público: resolve restaurante por slug (tela de login com marca) ──
export const publicRouter = Router();
publicRouter.get(
  '/restaurants/:slug',
  asyncHandler(async (req, res) => res.json(await superadminService.publicBySlug(req.params.slug))),
);
