import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config/index.js';
import { connectDB, disconnectDB } from './db/connection.js';
import { uploadRouter } from './api/routes/uploadRoutes.js';
import { reportRouter } from './api/routes/reportRoutes.js';
import { correctionRouter } from './api/routes/correctionRoutes.js';
import { queryRouter } from './api/routes/queryRoutes.js';
import { auditRouter } from './api/routes/auditRoutes.js';
import { sampleRouter } from './api/routes/sampleRoutes.js';
import { errorHandler } from './api/middlewares/errorHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, '../public');

const app = express();

// Global Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static frontend dashboard files
app.use(express.static(PUBLIC_DIR));

// API Routes
app.use('/api/upload', uploadRouter);
app.use('/api', reportRouter);
app.use('/api/tests', correctionRouter);
app.use('/api/query', queryRouter);
app.use('/api/audit-logs', auditRouter);
app.use('/api', sampleRouter);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'Lab Report Intelligence Agent',
    llmProvider: config.llmProvider
  });
});

// Centralized Error Handler
app.use(errorHandler);

// Server Lifecycle Management
let server = null;

export async function startServer(port = config.port) {
  await connectDB();
  return new Promise((resolve) => {
    server = app.listen(port, () => {
      console.log(`=======================================================`);
      console.log(`🚀 Lab Report Intelligence Agent Server Running!`);
      console.log(`📍 Web Dashboard: http://localhost:${port}`);
      console.log(`📡 API Base:      http://localhost:${port}/api`);
      console.log(`🤖 LLM Provider:  ${config.llmProvider}`);
      console.log(`=======================================================`);
      resolve(server);
    });
  });
}

export async function stopServer() {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
    console.log('[Server] HTTP listener closed.');
  }
  await disconnectDB();
}

// Direct Execution Entry Point
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer().catch((err) => {
    console.error('[Server] Fatal startup failure:', err);
    process.exit(1);
  });

  const handleTermination = async (signal) => {
    console.log(`\n[Server] Received ${signal}. Initiating graceful shutdown...`);
    await stopServer();
    process.exit(0);
  };

  process.on('SIGINT', () => handleTermination('SIGINT'));
  process.on('SIGTERM', () => handleTermination('SIGTERM'));
}

export default app;
