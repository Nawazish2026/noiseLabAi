import express from 'express';
import path from 'path';
import { uploadMiddleware } from '../middlewares/fileUpload.js';
import { extractTextFromPdf } from '../../extraction/pdfParser.js';
import { extractTextFromImage } from '../../extraction/imageOcr.js';
import { processRawReport } from '../../extraction/structuredExtractor.js';
import { LabReport } from '../../db/models/LabReport.js';
import { LabTest } from '../../db/models/LabTest.js';

export const uploadRouter = express.Router();

/**
 * POST /api/upload
 * Accepts multipart/form-data with file field 'report'
 */
uploadRouter.post('/', uploadMiddleware.single('report'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded. Please provide a PDF or image file.' });
    }

    const patientId = req.body.patientId || 'patient_001';
    const filePath = req.file.path;
    const originalName = req.file.originalname;
    const ext = path.extname(originalName).toLowerCase().replace('.', '');

    let rawText = '';
    let fileType = ext === 'pdf' ? 'pdf' : 'png';

    // 1. Text Extraction
    if (ext === 'pdf') {
      const pdfRes = await extractTextFromPdf(filePath);
      rawText = pdfRes.text;
    } else {
      const ocrRes = await extractTextFromImage(filePath);
      rawText = ocrRes.text;
      fileType = ext === 'jpg' || ext === 'jpeg' ? 'jpg' : 'png';
    }

    if (!rawText || rawText.trim().length === 0) {
      return res.status(422).json({
        success: false,
        error: 'Unable to extract legible text from the uploaded document. Please ensure the document is clear and readable.'
      });
    }

    // 2. Structured Extraction & Alias Normalization
    const { report, tests } = processRawReport(rawText, originalName, fileType, patientId);

    // 3. Persist to MongoDB
    await LabReport.create(report);
    if (tests.length > 0) {
      await LabTest.insertMany(tests);
    }

    res.status(201).json({
      success: true,
      message: `Report ingested successfully. Extracted ${tests.length} structured lab tests.`,
      report: {
        reportId: report.reportId,
        filename: report.filename,
        reportDate: report.reportDate,
        testsCount: tests.length,
        adversarialPromptDetected: report.adversarialPromptDetected
      },
      tests
    });
  } catch (error) {
    next(error);
  }
});
