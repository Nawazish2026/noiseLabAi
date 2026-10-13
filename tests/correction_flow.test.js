import test from 'node:test';
import assert from 'node:assert/strict';
import { v4 as uuidv4 } from 'uuid';
import { connectDB, disconnectDB } from '../src/db/connection.js';
import { LabTest } from '../src/db/models/LabTest.js';
import { Correction } from '../src/db/models/Correction.js';
import { AgentOrchestrator } from '../src/agent/orchestrator.js';

test('Correction Flow: user amends test value, records audit event, and agent reflects change', async () => {
  await connectDB();

  const isolatedPatientId = 'patient_correction_isolated';

  // Clean any prior isolated runs
  await LabTest.deleteMany({ patientId: isolatedPatientId });
  await Correction.deleteMany({ patientId: isolatedPatientId });

  // 1. Create dedicated baseline test record
  const testId = uuidv4();
  const testRecord = await LabTest.create({
    testId,
    reportId: uuidv4(),
    patientId: isolatedPatientId,
    reportDate: '2024-11-10',
    rawTestName: 'Glycated A1C',
    canonicalTestName: 'HbA1c',
    panelName: 'Glycemic Control',
    rawValue: '6.5',
    numericValue: 6.5,
    unit: '%',
    referenceRangeRaw: '4.0 - 5.6',
    refLow: 4.0,
    refHigh: 5.6,
    isOutOfRange: true,
    isCritical: false,
    qualityFlag: 'HIGH_CONFIDENCE',
    isCorrected: false
  });

  const originalValue = testRecord.numericValue; // 6.5

  // 2. User amends value to 5.4%
  const correctedNumeric = 5.4;
  const reasonText = 'Verified against clinical hospital re-test';

  const correctionEntry = await Correction.create({
    correctionId: uuidv4(),
    testId: testRecord.testId,
    patientId: isolatedPatientId,
    previousState: {
      rawValue: testRecord.rawValue,
      numericValue: testRecord.numericValue,
      unit: testRecord.unit,
      referenceRangeRaw: testRecord.referenceRangeRaw,
      qualityFlag: testRecord.qualityFlag
    },
    correctedState: {
      rawValue: String(correctedNumeric),
      numericValue: correctedNumeric,
      unit: '%',
      referenceRangeRaw: '4.0 - 5.6',
      qualityFlag: 'USER_CORRECTED'
    },
    reason: reasonText
  });

  // Apply correction to active database record
  testRecord.rawValue = String(correctedNumeric);
  testRecord.numericValue = correctedNumeric;
  testRecord.qualityFlag = 'USER_CORRECTED';
  testRecord.isCorrected = true;
  testRecord.correctionNotes = reasonText;
  await testRecord.save();

  // 3. Verify Correction record was persisted in MongoDB
  const savedCorrection = await Correction.findOne({ correctionId: correctionEntry.correctionId });
  assert.ok(savedCorrection);
  assert.equal(savedCorrection.previousState.numericValue, originalValue);
  assert.equal(savedCorrection.correctedState.numericValue, 5.4);

  // 4. Verify Agent Orchestrator retrieves amended value for this patient
  const orchestrator = new AgentOrchestrator();
  const queryResult = await orchestrator.processQuery('What was my latest HbA1c result?', isolatedPatientId);

  assert.ok(queryResult.answer.includes('5.4 %'), 'Agent response must cite the corrected value 5.4 %');
  assert.ok(queryResult.answer.includes('2024-11-10'), 'Agent response must cite the report date');
  assert.ok(queryResult.answer.includes('manually corrected'), 'Agent must note manual user correction');

  // Clean up isolated records
  await LabTest.deleteMany({ patientId: isolatedPatientId });
  await Correction.deleteMany({ patientId: isolatedPatientId });

  await disconnectDB();
});
