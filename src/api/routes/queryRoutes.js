import express from 'express';
import { AgentOrchestrator } from '../../agent/orchestrator.js';

export const queryRouter = express.Router();
const orchestrator = new AgentOrchestrator();

/**
 * POST /api/query
 * Grounded Q&A interface against ingested lab reports.
 */
queryRouter.post('/', async (req, res, next) => {
  try {
    const { query, patientId = 'patient_001' } = req.body;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Query text is required.' });
    }

    const response = await orchestrator.processQuery(query.trim(), patientId);
    res.json({ success: true, ...response });
  } catch (error) {
    next(error);
  }
});
