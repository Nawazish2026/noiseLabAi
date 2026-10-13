import express from 'express';
import { seedDatabase } from '../../../scripts/seed_database.js';

export const sampleRouter = express.Router();

/**
 * POST /api/seed-samples
 * Seeds database with 5 clinical sample reports (including adversarial & critical tests).
 */
sampleRouter.post('/seed-samples', async (req, res, next) => {
  try {
    const patientId = req.body.patientId || 'patient_001';
    await seedDatabase(patientId);
    res.json({
      success: true,
      message: 'Sample lab reports successfully loaded into database.'
    });
  } catch (error) {
    next(error);
  }
});
