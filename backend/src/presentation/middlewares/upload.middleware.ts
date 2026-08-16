import multer, { FileFilterCallback } from 'multer';
import { Request } from 'express';
import { AppError } from '../../utils/errors';

export const ALLOWED_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
};

function fileFilter(_req: Request, file: Express.Multer.File, cb: FileFilterCallback): void {
  if (!ALLOWED_MIME[file.mimetype]) {
    cb(new AppError('Envie uma imagem PNG, JPEG ou WebP'));
    return;
  }
  cb(null, true);
}

/**
 * Confere os magic bytes reais do arquivo, não só o Content-Type declarado pelo cliente
 * (que é só um header HTTP, fácil de forjar — achado da auditoria QA). `fileFilter` acima
 * já filtra pelo mimetype declarado antes mesmo do upload completar (barato, boa primeira
 * linha de defesa), mas só isso não impede alguém de mandar qualquer conteúdo com
 * `Content-Type: image/png` forjado. Esta checagem roda depois, com o arquivo já em
 * memória (ver `logoUpload` usando `memoryStorage`), e vale como a validação de verdade.
 */
export function hasValidImageMagicBytes(buffer: Buffer, mimetype: string): boolean {
  switch (mimetype) {
    case 'image/png':
      return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case 'image/jpeg':
      return buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
    case 'image/webp':
      return buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
    default:
      return false;
  }
}

// memoryStorage (em vez de diskStorage): o arquivo só é gravado em disco depois de passar
// pela checagem de magic bytes acima, em branding.service.ts — nunca escrevemos no disco
// um upload que só tem a palavra do cliente de que é uma imagem de verdade.
/** Upload da logo do restaurante (campo "logo") — usado só pela tela de Identidade Visual. */
export const logoUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 3 * 1024 * 1024 },
}).single('logo');
