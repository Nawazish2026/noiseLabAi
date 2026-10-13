import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../');

function normalizeMongoUri(uri) {
  if (!uri) return 'mongodb://127.0.0.1:27017/lab_report_db';
  const trimmed = uri.trim();
  // If uri ends with mongodb.net/ or mongodb.net
  if (/mongodb\.net\/?(\?.*)?$/.test(trimmed)) {
    return trimmed.replace(/mongodb\.net\/?(\?.*)?$/, (match, query) => {
      return `mongodb.net/lab_report_db${query || '?retryWrites=true&w=majority'}`;
    });
  }
  return trimmed;
}

const rawMongoUri = process.env.MONGODB_URI 
  || process.env.MONGO_URI 
  || process.env.Mongodb_uri 
  || process.env.Mongo_uri 
  || process.env.mongodb_uri 
  || process.env.mongo_uri;

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: normalizeMongoUri(rawMongoUri),
  
  // LLM Config
  geminiApiKey: process.env.GEMINI_API_KEY || null,
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
  openaiApiKey: process.env.OPENAI_API_KEY || null,
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  llmProvider: process.env.LLM_PROVIDER || 'gemini', // 'auto', 'gemini', 'openai', 'mock'

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
