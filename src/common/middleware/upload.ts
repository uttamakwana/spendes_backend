import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { config } from '../../config';
import { BadRequestException } from '../errors/http-exception';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.storage.uploadMaxBytes, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new BadRequestException('Only JPEG, PNG or WebP images are allowed'));
    }
  },
});

/**
 * Parses a single multipart image field into `req.file` (in memory). Maps multer's
 * own errors (oversized file, etc.) and the fileFilter rejection to clean 400s so
 * the central error handler returns a proper envelope.
 */
export function uploadSingleImage(field: string) {
  const handler = upload.single(field);
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res, (err: unknown) => {
      if (!err) {
        next();
        return;
      }
      if (err instanceof multer.MulterError) {
        const mb = Math.round(config.storage.uploadMaxBytes / (1024 * 1024));
        const message =
          err.code === 'LIMIT_FILE_SIZE'
            ? `Image is too large (max ${mb} MB)`
            : `Upload error: ${err.message}`;
        next(new BadRequestException(message));
        return;
      }
      next(err instanceof Error ? err : new BadRequestException('Invalid upload'));
    });
  };
}
