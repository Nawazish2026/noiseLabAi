import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { LabTest } from '../../db/models/LabTest.js';
import { Correction } from '../../db/models/Correction.js';
import { parseReferenceRange } from '../../extraction/structuredExtractor.js';
import { checkIsCritical } from '../../core/safetyGuard.js';

export const correctionRouter = express.Router();

/**
 * POST /api/tests/:testId/correct
 * Allows user to review and correct an extracted lab test.
 * The system stores an audit record and immediately updates the active record.
 */
correctionRouter.post('/:testId/correct', async (req, res, next) => {
  try {
    const { testId } = req.params;
    const { correctedValue, correctedUnit, correctedReferenceRange, reason } = req.body;

    const existingTest = await LabTest.findOne({ testId });
    if (!existingTest) {
      return res.status(404).json({ success: false, error: 'Lab test not found' });
    }

    const previousState = {
      rawValue: existingTest.rawValue,
      numericValue: existingTest.numericValue,
      unit: existingTest.unit,
      referenceRangeRaw: existingTest.referenceRangeRaw,
      qualityFlag: existingTest.qualityFlag
    };

    // Calculate new properties
    const newRawValue = correctedValue !== undefined ? String(correctedValue) : existingTest.rawValue;
    const newNumericValue = correctedValue !== undefined ? parseFloat(correctedValue) : existingTest.numericValue;
    const newUnit = correctedUnit !== undefined ? correctedUnit : existingTest.unit;
    const newRefRangeRaw = correctedReferenceRange !== undefined ? correctedReferenceRange : existingTest.referenceRangeRaw;

    const { refLow, refHigh } = parseReferenceRange(newRefRangeRaw);

    let isOutOfRange = null;
    if (newNumericValue !== null && !isNaN(newNumericValue)) {
      if (refLow !== null && newNumericValue < refLow) {
        isOutOfRange = true;
      } else if (refHigh !== null && newNumericValue > refHigh) {
        isOutOfRange = true;
      } else if (refLow !== null || refHigh !== null) {
        isOutOfRange = false;
      }
    }

    const isCritical = checkIsCritical(existingTest.canonicalTestName, newNumericValue);

    // 1. Record Correction Audit Event
    const correctionRecord = await Correction.create({
      correctionId: uuidv4(),
      testId: existingTest.testId,
      patientId: existingTest.patientId,
      previousState,
      correctedState: {
        rawValue: newRawValue,
        numericValue: newNumericValue,
        unit: newUnit,
        referenceRangeRaw: newRefRangeRaw,
        qualityFlag: 'USER_CORRECTED'
      },
      reason: reason || 'User verified clinical value'
    });

    // 2. Update LabTest in database
    existingTest.rawValue = newRawValue;
    existingTest.numericValue = newNumericValue;
    existingTest.unit = newUnit;
    existingTest.referenceRangeRaw = newRefRangeRaw;
    existingTest.refLow = refLow;
    existingTest.refHigh = refHigh;
    existingTest.isOutOfRange = isOutOfRange;
    existingTest.isCritical = isCritical;
    existingTest.qualityFlag = 'USER_CORRECTED';
    existingTest.isCorrected = true;
    existingTest.correctionNotes = reason || 'User corrected';

    await existingTest.save();

    res.json({
      success: true,
      message: `Test "${existingTest.canonicalTestName}" successfully corrected. Future agent queries will use this value.`,
      correctionId: correctionRecord.correctionId,
      updatedTest: existingTest
    });
  } catch (error) {
    next(error);
  }
});
