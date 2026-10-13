import express from 'express';
import { LabReport } from '../../db/models/LabReport.js';
import { LabTest } from '../../db/models/LabTest.js';
import { findCanonicalName } from '../../core/aliases.js';
import { computeBiomarkerTrajectory } from '../../analytics/longitudinalEngine.js';

export const reportRouter = express.Router();

/**
 * GET /api/reports
 * Lists all ingested reports for a patient.
 */
reportRouter.get('/reports', async (req, res, next) => {
  try {
    const patientId = req.query.patientId || 'patient_001';
    const reports = await LabReport.find({ patientId }).sort({ reportDate: -1 }).lean();
    res.json({ success: true, count: reports.length, reports });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/reports/:id
 * Retrieve a single report with its raw text and associated structured tests.
 */
reportRouter.get('/reports/:id', async (req, res, next) => {
  try {
    const report = await LabReport.findOne({ reportId: req.params.id }).lean();
    if (!report) {
      return res.status(404).json({ success: false, error: 'Report not found' });
    }
    const tests = await LabTest.find({ reportId: report.reportId }).lean();
    res.json({ success: true, report, tests });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/tests
 * Query structured lab tests with filters.
 */
reportRouter.get('/tests', async (req, res, next) => {
  try {
    const patientId = req.query.patientId || 'patient_001';
    const filter = { patientId };

    if (req.query.canonicalTestName) {
      filter.canonicalTestName = req.query.canonicalTestName;
    }
    if (req.query.reportDate) {
      filter.reportDate = req.query.reportDate;
    }
    if (req.query.isOutOfRange !== undefined) {
      filter.isOutOfRange = req.query.isOutOfRange === 'true';
    }

    const tests = await LabTest.find(filter).sort({ reportDate: -1, canonicalTestName: 1 }).lean();
    res.json({ success: true, count: tests.length, tests });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/analytics/trajectory/:testName
 * Retrieve mathematical trajectory and data points for chart rendering.
 */
reportRouter.get('/analytics/trajectory/:testName', async (req, res, next) => {
  try {
    const patientId = req.query.patientId || 'patient_001';
    const rawName = req.params.testName;
    const canonical = findCanonicalName(rawName) || rawName;

    const tests = await LabTest.find({ patientId, canonicalTestName: canonical }).sort({ reportDate: 1 }).lean();
    const trajectory = computeBiomarkerTrajectory(tests);

    res.json({ success: true, trajectory });
  } catch (error) {
    next(error);
  }
});
