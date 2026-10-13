import express from 'express';
import { getRecentAuditLogs } from '../../tools/auditLogger.js';

export const auditRouter = express.Router();

/**
 * GET /api/audit-logs
 * Retrieves full audit trails of user prompts, tool selections, and grounded responses.
 */
auditRouter.get('/', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit || '25', 10);
    const logs = await getRecentAuditLogs(limit);
    res.json({ success: true, count: logs.length, logs });
  } catch (error) {
    next(error);
  }
});
