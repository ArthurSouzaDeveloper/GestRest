import { Router } from 'express';
import { Role } from '@prisma/client';
import { asyncHandler } from '../../utils/http';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import {
  additionalService,
  categoryService,
  productService,
} from '../../application/services/catalog.service';
import {
  additionalSchema,
  additionalUpdateSchema,
  categorySchema,
  categoryUpdateSchema,
  productSchema,
  productUpdateSchema,
} from '../validators/schemas';
import { ctx } from './context';

const router = Router();
router.use(authenticate);

const manager = authorize(Role.ADMIN, Role.MANAGER);
const tid = (req: Parameters<typeof ctx>[0]) => ctx(req).tenantId;

// ── Categories ──
router.get(
  '/categories',
  asyncHandler(async (req, res) => res.json(await categoryService.list(tid(req)))),
);
router.post(
  '/categories',
  manager,
  validateBody(categorySchema),
  asyncHandler(async (req, res) => res.status(201).json(await categoryService.create(tid(req), req.body))),
);
router.patch(
  '/categories/:id',
  manager,
  validateBody(categoryUpdateSchema),
  asyncHandler(async (req, res) =>
    res.json(await categoryService.update(tid(req), req.params.id, req.body)),
  ),
);
router.delete(
  '/categories/:id',
  manager,
  asyncHandler(async (req, res) => {
    await categoryService.remove(tid(req), req.params.id);
    res.status(204).end();
  }),
);

// ── Products ──
router.get(
  '/products',
  asyncHandler(async (req, res) =>
    res.json(
      await productService.list(tid(req), {
        search: req.query.search as string,
        categoryId: req.query.categoryId as string,
        onlyAvailable: req.query.available === 'true',
      }),
    ),
  ),
);
router.post(
  '/products',
  manager,
  validateBody(productSchema),
  asyncHandler(async (req, res) => res.status(201).json(await productService.create(tid(req), req.body))),
);
router.patch(
  '/products/:id',
  manager,
  validateBody(productUpdateSchema),
  asyncHandler(async (req, res) =>
    res.json(await productService.update(tid(req), req.params.id, req.body)),
  ),
);
router.delete(
  '/products/:id',
  manager,
  asyncHandler(async (req, res) => {
    await productService.remove(tid(req), req.params.id);
    res.status(204).end();
  }),
);

// ── Additionals ──
router.get(
  '/additionals',
  asyncHandler(async (req, res) =>
    res.json(
      await additionalService.list(tid(req), {
        categoryId: req.query.categoryId as string,
        onlyActive: req.query.active === 'true',
      }),
    ),
  ),
);
router.post(
  '/additionals',
  manager,
  validateBody(additionalSchema),
  asyncHandler(async (req, res) =>
    res.status(201).json(await additionalService.create(tid(req), req.body)),
  ),
);
router.patch(
  '/additionals/:id',
  manager,
  validateBody(additionalUpdateSchema),
  asyncHandler(async (req, res) =>
    res.json(await additionalService.update(tid(req), req.params.id, req.body)),
  ),
);
router.delete(
  '/additionals/:id',
  manager,
  asyncHandler(async (req, res) => {
    await additionalService.remove(tid(req), req.params.id);
    res.status(204).end();
  }),
);

export default router;
