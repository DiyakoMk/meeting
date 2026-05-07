import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { requireAuth } from '../auth/middleware.js';

export const uploadsRouter = Router();
uploadsRouter.use(requireAuth);

// Resolve UPLOAD_DIR to an absolute path and make sure it exists.
const uploadAbs = path.isAbsolute(config.uploads.dir)
  ? config.uploads.dir
  : path.resolve(process.cwd(), config.uploads.dir);
fs.mkdirSync(uploadAbs, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadAbs),
  filename: (_req, file, cb) => {
    const ext = (file.mimetype.split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '').toLowerCase();
    cb(null, crypto.randomBytes(8).toString('hex') + '.' + (ext || 'bin'));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: config.uploads.maxBytes },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.mimetype)) {
      return cb(new Error('only_images'));
    }
    cb(null, true);
  }
});

// POST /api/uploads/image — returns { url } pointing at /uploads/<file>.
uploadsRouter.post('/image', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no_file' });
  const publicUrl = config.uploads.publicBase.replace(/\/$/, '') + '/' + req.file.filename;
  res.status(201).json({ url: publicUrl });
});

// Multer's own errors get converted to a clean JSON response here so the
// frontend doesn't get an HTML 500 page back.
uploadsRouter.use((err, _req, res, _next) => {
  if (err && err.message === 'only_images') return res.status(400).json({ error: 'only_images_supported' });
  if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'file_too_large' });
  res.status(500).json({ error: 'upload_failed', message: err && err.message });
});
