import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStructuredLabTests } from '../src/extraction/structuredExtractor.js';
import { AgentOrchestrator } from '../src/agent/orchestrator.js';
import { connectDB, disconnectDB } from '../src/db/connection.js';
import { LabTest } from '../src/db/models/LabTest.js';
import { v4 as uuidv4 } from 'uuid';

test('Ambiguity & Quality: flags missing unit and missing reference range', () => {
  // Test row with value but no unit and no reference range
  const rawWithMissingData = `
    Metropolitan Clinical Diagnostics
    Report Date: 2024-03-01
    Fasting Glucose 105
  `;

  const parsed = parseStructuredLabTests(rawWithMissingData, 'rep_1', '2024-03-01', 'patient_test');
  // Should extract Fasting Glucose without unit
  assert.equal(parsed.length, 1);
  const testObj = parsed[0];
  assert.equal(testObj.canonicalTestName, 'Fasting Glucose');
  assert.equal(testObj.unit, null);
  assert.equal(testObj.qualityFlag, 'MISSING_UNIT');
});

test('Ambiguity & Quality: detects and flags duplicate test names with conflicting values', () => {
  const rawWithConflicts = `
    Metropolitan Clinical Diagnostics
    Report Date: 2024-03-01
    Fasting Glucose 95 mg/dL 70 - 99 NORMAL
    Fasting Blood Sugar 140 mg/dL 70 - 99 HIGH
  `;

  const parsed = parseStructuredLabTests(rawWithConflicts, 'rep_2', '2024-03-01', 'patient_test');
  assert.equal(parsed.length, 1); // Deduplicated to single test record
  const conflicted = parsed[0];
  assert.equal(conflicted.canonicalTestName, 'Fasting Glucose');
  assert.equal(conflicted.qualityFlag, 'CONFLICTING_DUPLICATE_VALUES');
  assert.equal(conflicted.numericValue, null, 'Must not guess numeric value between conflicting numbers');
  assert.match(conflicted.rawValue, /CONFLICTING/);
});

test('Ambiguity & Quality: agent refuses to guess on conflicting duplicate values and asks for clarification', async () => {
  await connectDB();
  const testPatientId = 'patient_conflict_test';
  await LabTest.deleteMany({ patientId: testPatientId });

  // Insert a test record flagged with CONFLICTING_DUPLICATE_VALUES
  await LabTest.create({
    testId: uuidv4(),
    reportId: uuidv4(),
    patientId: testPatientId,
    reportDate: '2024-03-01',
    rawTestName: 'Fasting Glucose',
    canonicalTestName: 'Fasting Glucose',
    rawValue: '95 / 140 (CONFLICTING)',
    numericValue: null,
    unit: 'mg/dL',
    referenceRangeRaw: '70 - 99',
    qualityFlag: 'CONFLICTING_DUPLICATE_VALUES',
    isOutOfRange: null
  });

  const orchestrator = new AgentOrchestrator();
  const res = await orchestrator.processQuery('What was my latest Fasting Glucose?', testPatientId);

  assert.match(res.answer, /conflicting duplicate readings/i);
  assert.match(res.answer, /cannot determine/i);

  await LabTest.deleteMany({ patientId: testPatientId });
  await disconnectDB();
});
