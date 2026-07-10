import { Router } from 'express';
import authRoutes from './auth.routes';
import catalogRoutes from './catalog.routes';
import tableRoutes from './table.routes';
import orderRoutes from './order.routes';
import productionRoutes from './production.routes';
import { auditRouter, dashboardRouter, userRouter } from './misc.routes';

const api = Router();

api.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

api.use('/auth', authRoutes);
api.use('/catalog', catalogRoutes);
api.use('/tables', tableRoutes);
api.use('/orders', orderRoutes);
api.use('/production', productionRoutes);
api.use('/dashboard', dashboardRouter);
api.use('/users', userRouter);
api.use('/audit', auditRouter);

export default api;
