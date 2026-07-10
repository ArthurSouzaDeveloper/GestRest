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
import { additionalSchema, categorySchema, productSchema } from '../validators/schemas';

const router = Router();
router.use(authenticate);

const manager = authorize(Role.ADMIN, Role.MANAGER);

// ── Categories ──
router.get('/categories', asyncHandler(async (_req, res) => res.json(await categoryService.list())));
router.post(
  '/categories',
  manager,
  validateBody(categorySchema),
  asyncHandler(async (req, res) => res.status(201).json(await categoryService.create(req.body))),
);
router.patch(
  '/categories/:id',
  manager,
  asyncHandler(async (req, res) => res.json(await categoryService.update(req.params.id, req.body))),
);
router.delete(
  '/categories/:id',
  manager,
  asyncHandler(async (req, res) => {
    await categoryService.remove(req.params.id);
    res.status(204).end();
  }),
);

// ── Products ──
router.get(
  '/products',
  asyncHandler(async (req, res) =>
    res.json(
      await productService.list({
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
  asyncHandler(async (req, res) => res.status(201).json(await productService.create(req.body))),
);
router.patch(
  '/products/:id',
  manager,
  asyncHandler(async (req, res) => res.json(await productService.update(req.params.id, req.body))),
);
router.delete(
  '/products/:id',
  manager,
  asyncHandler(async (req, res) => {
    await productService.remove(req.params.id);
    res.status(204).end();
  }),
);

// ── Additionals ──
router.get(
  '/additionals',
  asyncHandler(async (req, res) =>
    res.json(
      await additionalService.list({
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
  asyncHandler(async (req, res) => res.status(201).json(await additionalService.create(req.body))),
);
router.patch(
  '/additionals/:id',
  manager,
  asyncHandler(async (req, res) => res.json(await additionalService.update(req.params.id, req.body))),
);
router.delete(
  '/additionals/:id',
  manager,
  asyncHandler(async (req, res) => {
    await additionalService.remove(req.params.id);
    res.status(204).end();
  }),
);

export default router;
