import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../');

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/lab_report_db',
  
  // LLM Config
  geminiApiKey: process.env.GEMINI_API_KEY || null,
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
  openaiApiKey: process.env.OPENAI_API_KEY || null,
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  llmProvider: process.env.LLM_PROVIDER || 'auto', // 'auto', 'gemini', 'openai', 'mock'

  // Application Paths
  paths: {
    root: ROOT_DIR,
    uploads: path.join(ROOT_DIR, 'uploads'),
    samples: path.join(ROOT_DIR, 'samples'),
    public: path.join(ROOT_DIR, 'public')
  },

  // Constraints
  defaultPatientId: process.env.DEFAULT_PATIENT_ID || 'patient_001',
  maxUploadSizeMb: parseInt(process.env.MAX_UPLOAD_SIZE_MB || '15', 10),
  allowedMimeTypes: [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png'
  ]
};
