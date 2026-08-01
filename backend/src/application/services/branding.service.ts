import fs from 'fs';
import path from 'path';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { AppError } from '../../utils/errors';

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * Identidade visual (cor + logo) do site público de pedidos, configurável por restaurante
 * — antes disso, o front tinha a cor e a logo do Rei do Suco fixas no código (só fazia
 * sentido enquanto ele era o único tenant). `logoUrl` aponta pra dentro de /uploads
 * (ver app.ts), servido como arquivo estático.
 */
export const brandingService = {
  async get(tenantId: string) {
    const r = await prisma.restaurant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { brandColor: true, logoUrl: true },
    });
    return r;
  },

  async updateColor(tenantId: string, brandColor: string) {
    if (!HEX_COLOR_RE.test(brandColor)) {
      throw new AppError('Cor inválida — use o formato #RRGGBB');
    }
    const r = await prisma.restaurant.update({
      where: { id: tenantId },
      data: { brandColor },
      select: { brandColor: true, logoUrl: true },
    });
    return r;
  },

  /** `filename` já foi salvo em disco pelo middleware de upload (ver upload.middleware.ts) — aqui só grava o caminho público e limpa o arquivo antigo, se houver. */
  async updateLogo(tenantId: string, filename: string) {
    const current = await prisma.restaurant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { logoUrl: true },
    });

    const logoUrl = `/uploads/branding/${filename}`;
    const r = await prisma.restaurant.update({
      where: { id: tenantId },
      data: { logoUrl },
      select: { brandColor: true, logoUrl: true },
    });

    if (current.logoUrl && current.logoUrl !== logoUrl && current.logoUrl.startsWith('/uploads/branding/')) {
      const oldPath = path.resolve(process.cwd(), env.uploadDir, 'branding', path.basename(current.logoUrl));
      fs.unlink(oldPath, () => undefined); // best-effort — arquivo órfão não é crítico
    }

    return r;
  },
};
