import { Router } from 'express';
import { asyncHandler } from '../../utils/http';
import { authService, cookieRefreshOptions } from '../../application/services/auth.service';
import { validateBody } from '../middlewares/validate.middleware';
import { loginSchema } from '../validators/schemas';
import { authenticate } from '../middlewares/auth.middleware';
import { authLimiter } from '../middlewares/rateLimit.middleware';

const router = Router();

router.post(
  '/login',
  authLimiter,
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.login(req.body.email, req.body.password, req.ip);
    res.cookie('refreshToken', result.refreshToken, cookieRefreshOptions);
    res.json({ accessToken: result.accessToken, user: result.user });
  }),
);

router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const token = req.cookies?.refreshToken ?? req.body?.refreshToken;
    const result = await authService.refresh(token);
    res.cookie('refreshToken', result.refreshToken, cookieRefreshOptions);
    res.json({ accessToken: result.accessToken });
  }),
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    await authService.logout(req.cookies?.refreshToken ?? req.body?.refreshToken);
    res.clearCookie('refreshToken', { path: '/api/auth' });
    res.status(204).end();
  }),
);

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    res.json(await authService.me(req.user!.sub));
  }),
);

export default router;
