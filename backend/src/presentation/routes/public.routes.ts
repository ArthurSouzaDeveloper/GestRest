import { Router } from 'express';
import { asyncHandler } from '../../utils/http';
import { publicOrderService } from '../../application/services/publicOrder.service';
import { validateBody } from '../middlewares/validate.middleware';
import { publicOrderLimiter, mapsLookupLimiter } from '../middlewares/rateLimit.middleware';
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

// ── Modo por distância (Google Maps) — só faz sentido pra restaurantes em DISTANCE_BANDS,
// mas quem decide isso é o service (consulta o banco); as rotas só validam o formato. ──
router.get(
  '/:slug/places/autocomplete',
  mapsLookupLimiter,
  asyncHandler(async (req, res) => {
    const input = req.query.input;
    const sessionToken = req.query.sessionToken;
    if (typeof input !== 'string' || input.trim().length < 3) throw new AppError('Digite pelo menos 3 caracteres');
    if (typeof sessionToken !== 'string' || !sessionToken) throw new AppError('sessionToken obrigatório');
    res.json(await publicOrderService.placesAutocomplete(req.params.slug, input, sessionToken));
  }),
);

router.get(
  '/:slug/places/details',
  mapsLookupLimiter,
  asyncHandler(async (req, res) => {
    const placeId = req.query.placeId;
    const sessionToken = req.query.sessionToken;
    if (typeof placeId !== 'string' || !placeId) throw new AppError('placeId obrigatório');
    if (typeof sessionToken !== 'string' || !sessionToken) throw new AppError('sessionToken obrigatório');
    res.json(await publicOrderService.placeDetails(req.params.slug, placeId, sessionToken));
  }),
);

router.get(
  '/:slug/delivery-quote',
  mapsLookupLimiter,
  asyncHandler(async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new AppError('lat inválida');
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new AppError('lng inválida');
    res.json(await publicOrderService.deliveryQuote(req.params.slug, { lat, lng }));
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

router.get(
  '/:slug/orders/:id',
  asyncHandler(async (req, res) => res.json(await publicOrderService.orderStatus(req.params.slug, req.params.id))),
);

export default router;
