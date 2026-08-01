import fs from 'fs';
import path from 'path';
import multer, { FileFilterCallback } from 'multer';
import { Request } from 'express';
import { env } from '../../config/env';
import { AppError } from '../../utils/errors';

const ALLOWED_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
};

const brandingDir = path.resolve(process.cwd(), env.uploadDir, 'branding');
fs.mkdirSync(brandingDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, brandingDir),
  // Nome gerado a partir do :id na rota (não do nome original do arquivo) — evita path
  // traversal/colisão e já identifica de qual restaurante é cada logo na pasta. Rota é
  // exclusiva do superadmin (ver misc.routes.ts), então usa req.params.id em vez do
  // tenant do próprio token — quem chama não tem (nem deveria ter) restaurantId no JWT.
  filename: (req: Request, file, cb) => {
    const ext = ALLOWED_MIME[file.mimetype] ?? (path.extname(file.originalname).toLowerCase() || '.png');
    cb(null, `${req.params.id}-${Date.now()}${ext}`);
  },
});

function fileFilter(_req: Request, file: Express.Multer.File, cb: FileFilterCallback): void {
  if (!ALLOWED_MIME[file.mimetype]) {
    cb(new AppError('Envie uma imagem PNG, JPEG ou WebP'));
    return;
  }
  cb(null, true);
}

/** Upload da logo do restaurante (campo "logo") — usado só pela tela de Identidade Visual. */
export const logoUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 3 * 1024 * 1024 },
}).single('logo');
