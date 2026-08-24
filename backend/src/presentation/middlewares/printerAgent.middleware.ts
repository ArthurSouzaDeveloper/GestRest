import { NextFunction, Request, Response } from 'express';
import { UnauthorizedError } from '../../utils/errors';
import { asyncHandler } from '../../utils/http';
import { verifyAgentKey } from '../../application/services/printerSettings.service';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      // Tenant da ponte de impressão local autenticada — nunca um login de
      // funcionário (ver X-Printer-Key abaixo). Distinto de req.user de propósito:
      // uma ponte não tem papel/JWT de staff, só acesso aos endpoints de impressão.
      printerRestaurantId?: string;
    }
  }
}

/**
 * Autentica a ponte de impressão local pelo header `X-Printer-Key`, no formato
 * `<restaurantId>.<segredo>` (gerado uma única vez em POST /catalog/printer-agent-key
 * — ver catalog.routes.ts). Nunca concede acesso a nenhuma outra rota do sistema, só
 * às de /print-agent. Conferência da chave em si é compartilhada com a autenticação
 * de socket — ver printerSettings.service.ts#verifyAgentKey.
 */
export const authenticatePrinterAgent = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const key = req.headers['x-printer-key'];
  if (typeof key !== 'string') throw new UnauthorizedError('Chave de impressão ausente ou inválida');

  const restaurantId = await verifyAgentKey(key);
  if (!restaurantId) throw new UnauthorizedError('Chave de impressão inválida');

  req.printerRestaurantId = restaurantId;
  next();
});
