import { Router } from 'express';
import { Role } from '@prisma/client';
import { asyncHandler } from '../../utils/http';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import {
  additionalService,
  categoryService,
  deliveryZoneService,
  productService,
} from '../../application/services/catalog.service';
import {
  deliveryPricingBandService,
  deliveryPricingSettingsService,
} from '../../application/services/deliveryPricing.service';
import { etaSettingsService } from '../../application/services/eta.service';
import { autoAcceptService } from '../../application/services/autoAccept.service';
import { printerSettingsService } from '../../application/services/printerSettings.service';
import {
  additionalSchema,
  additionalUpdateSchema,
  autoAcceptSchema,
  categorySchema,
  categoryUpdateSchema,
  deliveryDistanceBandSchema,
  deliveryDistanceBandUpdateSchema,
  deliveryPricingSettingsSchema,
  deliveryZoneSchema,
  deliveryZoneUpdateSchema,
  etaSettingsSchema,
  printerSettingsSchema,
  productSchema,
  productUpdateSchema,
} from '../validators/schemas';
import { ctx } from './context';

const router = Router();
router.use(authenticate);

const manager = authorize(Role.ADMIN, Role.MANAGER);
// Configuração do tempo estimado (manual vs. automático) fica restrita a ADMIN — pedido
// explícito do cliente, que não quer nem os gerentes mexendo nesse horário.
const admin = authorize(Role.ADMIN);
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

// ── Delivery zones (bairros + taxa de entrega, usados pelo site de pedidos online) ──
router.get(
  '/delivery-zones',
  asyncHandler(async (req, res) =>
    res.json(await deliveryZoneService.list(tid(req), { onlyActive: req.query.active === 'true' })),
  ),
);
router.post(
  '/delivery-zones',
  manager,
  validateBody(deliveryZoneSchema),
  asyncHandler(async (req, res) =>
    res.status(201).json(await deliveryZoneService.create(tid(req), req.body)),
  ),
);
router.patch(
  '/delivery-zones/:id',
  manager,
  validateBody(deliveryZoneUpdateSchema),
  asyncHandler(async (req, res) =>
    res.json(await deliveryZoneService.update(tid(req), req.params.id, req.body)),
  ),
);
router.delete(
  '/delivery-zones/:id',
  manager,
  asyncHandler(async (req, res) => {
    await deliveryZoneService.remove(tid(req), req.params.id);
    res.status(204).end();
  }),
);

// ── Frete por distância (Google Maps) — alternativa ao bairro cadastrado acima ──
router.get(
  '/delivery-pricing-settings',
  asyncHandler(async (req, res) => res.json(await deliveryPricingSettingsService.get(tid(req)))),
);
router.patch(
  '/delivery-pricing-settings',
  manager,
  validateBody(deliveryPricingSettingsSchema),
  asyncHandler(async (req, res) => res.json(await deliveryPricingSettingsService.update(tid(req), req.body))),
);

router.get(
  '/delivery-distance-bands',
  asyncHandler(async (req, res) =>
    res.json(await deliveryPricingBandService.list(tid(req), { onlyActive: req.query.active === 'true' })),
  ),
);
router.post(
  '/delivery-distance-bands',
  manager,
  validateBody(deliveryDistanceBandSchema),
  asyncHandler(async (req, res) =>
    res.status(201).json(await deliveryPricingBandService.create(tid(req), req.body)),
  ),
);
router.patch(
  '/delivery-distance-bands/:id',
  manager,
  validateBody(deliveryDistanceBandUpdateSchema),
  asyncHandler(async (req, res) =>
    res.json(await deliveryPricingBandService.update(tid(req), req.params.id, req.body)),
  ),
);
router.delete(
  '/delivery-distance-bands/:id',
  manager,
  asyncHandler(async (req, res) => {
    await deliveryPricingBandService.remove(tid(req), req.params.id);
    res.status(204).end();
  }),
);

// ── Tempo estimado de preparo (retirada/entrega) — automático por fila ou fixo pelo admin ──
router.get(
  '/eta-settings',
  asyncHandler(async (req, res) => res.json(await etaSettingsService.get(tid(req)))),
);
router.patch(
  '/eta-settings',
  admin,
  validateBody(etaSettingsSchema),
  asyncHandler(async (req, res) => res.json(await etaSettingsService.update(tid(req), req.body))),
);

// ── Aceite automático de pedidos online — pula o "aguardando aceite" (PENDING) e já
// cai direto na fila de produção. Restrito a ADMIN, mesmo critério do tempo estimado. ──
router.get(
  '/auto-accept',
  asyncHandler(async (req, res) => res.json(await autoAcceptService.get(tid(req)))),
);
router.patch(
  '/auto-accept',
  admin,
  validateBody(autoAcceptSchema),
  asyncHandler(async (req, res) => res.json(await autoAcceptService.update(tid(req), req.body))),
);

// ── Impressora térmica (ponte local) — configuração de conexão, geração da chave de
// acesso da ponte, e status de trabalhos de impressão pendentes. Restrito a ADMIN. ──
router.get(
  '/printer-settings',
  asyncHandler(async (req, res) => res.json(await printerSettingsService.getConnection(tid(req)))),
);
router.patch(
  '/printer-settings',
  admin,
  validateBody(printerSettingsSchema),
  asyncHandler(async (req, res) => res.json(await printerSettingsService.updateConnection(tid(req), req.body))),
);
router.post(
  '/printer-agent-key',
  admin,
  asyncHandler(async (req, res) =>
    res.json(await printerSettingsService.generateAgentKey(tid(req), { userId: req.user!.sub, ip: req.ip })),
  ),
);
router.get(
  '/printer-status',
  admin,
  asyncHandler(async (req, res) => res.json(await printerSettingsService.getStatus(tid(req)))),
);

export default router;
