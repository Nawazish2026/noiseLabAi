import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { config } from '../../config/index.js';

let targetUploadDir = config.paths.uploads;
try {
  if (!fs.existsSync(targetUploadDir)) {
    fs.mkdirSync(targetUploadDir, { recursive: true });
  }
} catch (err) {
  // Read-only filesystem fallback for Vercel / AWS Lambda
  targetUploadDir = path.join(os.tmpdir(), 'uploads');
  try {
    if (!fs.existsSync(targetUploadDir)) {
      fs.mkdirSync(targetUploadDir, { recursive: true });
    }
  } catch (_) {}
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, targetUploadDir);
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
