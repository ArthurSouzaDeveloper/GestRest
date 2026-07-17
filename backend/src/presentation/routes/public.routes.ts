import { Router } from 'express';
import { asyncHandler } from '../../utils/http';
import { publicOrderService } from '../../application/services/publicOrder.service';
import { validateBody } from '../middlewares/validate.middleware';
import { publicOrderLimiter } from '../middlewares/rateLimit.middleware';
import { publicOrderSchema } from '../validators/schemas';
import { AppError } from '../../utils/errors';

/**
 * Public (unauthenticated) routes for the online ordering site, resolved by :slug rather
 * than a JWT. Mounted at /public alongside the existing publicRouter (misc.routes.ts) —
 * kept as a separate file/router so the branded-login lookup it already exposes
 * (GET /public/restaurants/:slug) is never touched by this module.
 */
const router = Router();

router.get(
  '/:slug/catalog/categories',
  asyncHandler(async (req, res) => res.json(await publicOrderService.categories(req.params.slug))),
);

router.get(
  '/:slug/catalog/products',
  asyncHandler(async (req, res) => res.json(await publicOrderService.products(req.params.slug))),
);

router.get(
  '/:slug/catalog/additionals',
  asyncHandler(async (req, res) =>
    res.json(await publicOrderService.additionals(req.params.slug, req.query.categoryId as string | undefined)),
  ),
);

router.get(
  '/:slug/delivery-zones',
  asyncHandler(async (req, res) => res.json(await publicOrderService.deliveryZones(req.params.slug))),
);

router.get(
  '/:slug/eta',
  asyncHandler(async (req, res) => {
    const orderType = req.query.orderType;
    if (orderType !== 'PICKUP' && orderType !== 'DELIVERY') {
      throw new AppError('orderType deve ser PICKUP ou DELIVERY');
    }
    res.json(await publicOrderService.eta(req.params.slug, orderType));
  }),
);

router.post(
  '/:slug/orders',
  publicOrderLimiter,
  validateBody(publicOrderSchema),
  asyncHandler(async (req, res) =>
    res.status(201).json(await publicOrderService.createOrder(req.params.slug, req.body, req.ip)),
  ),
);

export default router;
