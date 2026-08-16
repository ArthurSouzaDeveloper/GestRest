import fs from 'fs';
import path from 'path';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { AppError } from '../../utils/errors';
import { ALLOWED_MIME, hasValidImageMagicBytes } from '../../presentation/middlewares/upload.middleware';

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const brandingDir = path.resolve(process.cwd(), env.uploadDir, 'branding');
fs.mkdirSync(brandingDir, { recursive: true });

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

  /**
   * `file` chega ainda só em memória (ver upload.middleware.ts — memoryStorage), não
   * escrito em disco pelo multer. Confere os magic bytes de verdade do arquivo antes de
   * gravar (o `Content-Type` que o multer usou no fileFilter é só o que o cliente
   * declarou, fácil de forjar — achado da auditoria QA) e só então grava com um nome
   * gerado aqui (baseado no :id da rota, nunca no nome original do arquivo — evita path
   * traversal/colisão).
   */
  async updateLogo(tenantId: string, file: { buffer: Buffer; mimetype: string }) {
    if (!hasValidImageMagicBytes(file.buffer, file.mimetype)) {
      throw new AppError('O arquivo enviado não é uma imagem PNG, JPEG ou WebP válida');
    }

    const current = await prisma.restaurant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { logoUrl: true },
    });

    const ext = ALLOWED_MIME[file.mimetype];
    const filename = `${tenantId}-${Date.now()}${ext}`;
    await fs.promises.writeFile(path.join(brandingDir, filename), file.buffer);

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
