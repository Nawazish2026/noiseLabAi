import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTestName, findCanonicalName } from '../src/core/aliases.js';
import { convertUnit } from '../src/core/unitConverter.js';

test('Alias Normalization: normalizes HbA1c variations while preserving raw label', () => {
  const variations = ['hba1c', 'A1C', 'Glycated Hemoglobin', 'Hemoglobin A1c', 'hgb a1c'];
  for (const v of variations) {
    const res = normalizeTestName(v);
    assert.equal(res.canonicalTestName, 'HbA1c', `Expected "${v}" to resolve to "HbA1c"`);
  }
});

test('Alias Normalization: normalizes Glucose and Lipid panel variations', () => {
  assert.equal(normalizeTestName('Fasting Blood Sugar').canonicalTestName, 'Fasting Glucose');
  assert.equal(normalizeTestName('FBS').canonicalTestName, 'Fasting Glucose');
  assert.equal(normalizeTestName('Cholesterol, Total').canonicalTestName, 'Total Cholesterol');
  assert.equal(normalizeTestName('HDL-C').canonicalTestName, 'HDL Cholesterol');
  assert.equal(normalizeTestName('Triglycerides').canonicalTestName, 'Triglycerides');
  assert.equal(normalizeTestName('Creatinine, Serum').canonicalTestName, 'Serum Creatinine');
});

test('Alias Resolution: finds canonical test from user conversational query', () => {
  assert.equal(findCanonicalName('a1c'), 'HbA1c');
  assert.equal(findCanonicalName('blood sugar'), 'Fasting Glucose');
  assert.equal(findCanonicalName('ldl'), 'LDL Cholesterol');
});

test('Unit Conversion: converts Fasting Glucose between mg/dL and mmol/L accurately', () => {
  // 126 mg/dL / 18.0182 = ~6.99 mmol/L
  const toMmol = convertUnit(126, 'mg/dL', 'mmol/L', 'Fasting Glucose');
  assert.equal(toMmol.success, true);
  assert.equal(toMmol.convertedValue, 6.99);

  const toMg = convertUnit(7.0, 'mmol/L', 'mg/dL', 'Fasting Glucose');
  assert.equal(toMg.success, true);
  assert.equal(toMg.convertedValue, 126.1);
});

test('Unit Conversion: converts Cholesterol between mg/dL and mmol/L', () => {
  const toMmol = convertUnit(200, 'mg/dL', 'mmol/L', 'Total Cholesterol');
  assert.equal(toMmol.success, true);
  assert.equal(toMmol.convertedValue, 5.17);
});

test('Unit Conversion: rejects incompatible units without guessing', () => {
  const invalid = convertUnit(126, 'mg/dL', 'mEq/L', 'Fasting Glucose');
  assert.equal(invalid.success, false);
  assert.match(invalid.error, /Incompatible units/);

  const missingUnit = convertUnit(126, null, 'mg/dL', 'Fasting Glucose');
  assert.equal(missingUnit.success, false);
});
