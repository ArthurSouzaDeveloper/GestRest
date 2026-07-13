import { Router } from 'express';
import { OrderStatus, ProductionStatus, Role } from '@prisma/client';
import { asyncHandler } from '../../utils/http';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import { orderService } from '../../application/services/order.service';
import { paymentService } from '../../application/services/payment.service';
import { ctx } from './context';
import {
  addItemsSchema,
  openOrderSchema,
  paymentSchema,
  updateItemSchema,
  updateOrderSchema,
} from '../validators/schemas';

const router = Router();
router.use(authenticate);

const waiter = authorize(Role.WAITER, Role.MANAGER, Role.ADMIN);
const cashier = authorize(Role.CASHIER, Role.MANAGER, Role.ADMIN);
const production = authorize(Role.JUICER, Role.COOK, Role.MANAGER, Role.ADMIN);

router.get(
  '/',
  asyncHandler(async (req, res) =>
    res.json(
      await orderService.list(ctx(req).tenantId, {
        status: req.query.status as OrderStatus | undefined,
        tableId: req.query.tableId as string | undefined,
      }),
    ),
  ),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => res.json(await orderService.get(ctx(req).tenantId, req.params.id))),
);

router.post(
  '/',
  waiter,
  validateBody(openOrderSchema),
  asyncHandler(async (req, res) => res.status(201).json(await orderService.open(req.body, ctx(req)))),
);

router.post(
  '/:id/items',
  waiter,
  validateBody(addItemsSchema),
  asyncHandler(async (req, res) =>
    res.status(201).json(await orderService.addItems(req.params.id, req.body.items, ctx(req))),
  ),
);

router.patch(
  '/:id',
  cashier,
  validateBody(updateOrderSchema),
  asyncHandler(async (req, res) =>
    res.json(await orderService.updateOrder(req.params.id, req.body, ctx(req))),
  ),
);

router.patch(
  '/items/:itemId',
  cashier,
  validateBody(updateItemSchema),
  asyncHandler(async (req, res) =>
    res.json(await orderService.updateItem(req.params.itemId, req.body, ctx(req))),
  ),
);

router.post(
  '/items/:itemId/status',
  production,
  asyncHandler(async (req, res) => {
    const status = req.body.status as ProductionStatus;
    res.json(await orderService.setItemStatus(req.params.itemId, status, ctx(req)));
  }),
);

router.delete(
  '/items/:itemId',
  cashier,
  asyncHandler(async (req, res) =>
    res.json(await orderService.cancelItem(req.params.itemId, ctx(req))),
  ),
);

router.post(
  '/:id/cancel',
  cashier,
  asyncHandler(async (req, res) => res.json(await orderService.cancel(req.params.id, ctx(req)))),
);

router.post(
  '/:id/pay',
  cashier,
  validateBody(paymentSchema),
  asyncHandler(async (req, res) =>
    res.json(await paymentService.pay(req.params.id, req.body.payments, ctx(req))),
  ),
);

export default router;
