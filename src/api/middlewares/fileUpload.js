import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { config } from '../../config/index.js';

if (!fs.existsSync(config.paths.uploads)) {
  fs.mkdirSync(config.paths.uploads, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, config.paths.uploads);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `report-${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (config.allowedMimeTypes.includes(file.mimetype) || ['.pdf', '.png', '.jpg', '.jpeg'].includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PDF, PNG, and JPG files are supported.'), false);
  }
};

export const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: config.maxUploadSizeMb * 1024 * 1024
  },
  fileFilter
});
