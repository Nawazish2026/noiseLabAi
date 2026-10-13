import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeBiomarkerTrajectory,
  comparePanels,
  findTestsMovedOutOfRange
} from '../src/analytics/longitudinalEngine.js';

test('Longitudinal Math: accurately computes delta, percentage, and trend for HbA1c', () => {
  const history = [
    {
      canonicalTestName: 'HbA1c',
      reportDate: '2024-01-15',
      numericValue: 6.8,
      rawValue: '6.8',
      unit: '%',
      isOutOfRange: true,
      referenceRangeRaw: '4.0 - 5.6',
      qualityFlag: 'HIGH_CONFIDENCE',
      isCorrected: false
    },
    {
      canonicalTestName: 'HbA1c',
      reportDate: '2024-06-20',
      numericValue: 6.2,
      rawValue: '6.2',
      unit: '%',
      isOutOfRange: true,
      referenceRangeRaw: '4.0 - 5.6',
      qualityFlag: 'HIGH_CONFIDENCE',
      isCorrected: false
    },
    {
      canonicalTestName: 'HbA1c',
      reportDate: '2024-11-10',
      numericValue: 5.7,
      rawValue: '5.7',
      unit: '%',
      isOutOfRange: true,
      referenceRangeRaw: '4.0 - 5.6',
      qualityFlag: 'HIGH_CONFIDENCE',
      isCorrected: false
    }
  ];

  const trajectory = computeBiomarkerTrajectory(history);

  // 5.7 - 6.8 = -1.1
  assert.equal(trajectory.absoluteDelta, -1.1);
  // (-1.1 / 6.8) * 100 = -16.2%
  assert.equal(trajectory.percentageDelta, -16.2);
  assert.equal(trajectory.trendDirection, 'DECREASED');
  assert.equal(trajectory.firstDate, '2024-01-15');
  assert.equal(trajectory.latestDate, '2024-11-10');
  assert.equal(trajectory.points.length, 3);
});

test('Longitudinal Math: recognizes NORMALIZED trend when abnormal result returns to normal', () => {
  const history = [
    {
      canonicalTestName: 'Total Cholesterol',
      reportDate: '2024-01-15',
      numericValue: 220,
      rawValue: '220',
      unit: 'mg/dL',
      isOutOfRange: true,
      referenceRangeRaw: '< 200',
      qualityFlag: 'HIGH_CONFIDENCE',
      isCorrected: false
    },
    {
      canonicalTestName: 'Total Cholesterol',
      reportDate: '2024-11-10',
      numericValue: 178,
      rawValue: '178',
      unit: 'mg/dL',
      isOutOfRange: false,
      referenceRangeRaw: '< 200',
      qualityFlag: 'HIGH_CONFIDENCE',
      isCorrected: false
    }
  ];

  const trajectory = computeBiomarkerTrajectory(history);
  assert.equal(trajectory.absoluteDelta, -42);
  assert.equal(trajectory.trendDirection, 'NORMALIZED');
});

test('Longitudinal Math: converts units during comparison when compatible', () => {
  const history = [
    {
      canonicalTestName: 'Fasting Glucose',
      reportDate: '2024-01-15',
      numericValue: 126,
      rawValue: '126',
      unit: 'mg/dL',
      isOutOfRange: true,
      qualityFlag: 'HIGH_CONFIDENCE'
    },
    {
      canonicalTestName: 'Fasting Glucose',
      reportDate: '2024-11-10',
      numericValue: 5.2, // ~93.7 mg/dL
      rawValue: '5.2',
      unit: 'mmol/L',
      isOutOfRange: false,
      qualityFlag: 'HIGH_CONFIDENCE'
    }
  ];

  const trajectory = computeBiomarkerTrajectory(history);
  assert.equal(trajectory.unitConverted, true);
  assert.equal(trajectory.trendDirection, 'NORMALIZED');
});

test('Longitudinal Math: flags results transitioning from normal to abnormal', () => {
  const allTests = [
    {
      canonicalTestName: 'Serum Creatinine',
      reportDate: '2024-01-15',
      numericValue: 0.9,
      rawValue: '0.9',
      unit: 'mg/dL',
      isOutOfRange: false,
      referenceRangeRaw: '0.6 - 1.2'
    },
    {
      canonicalTestName: 'Serum Creatinine',
      reportDate: '2024-11-10',
      numericValue: 1.6,
      rawValue: '1.6',
      unit: 'mg/dL',
      isOutOfRange: true,
      referenceRangeRaw: '0.6 - 1.2'
    }
  ];

  const transitions = findTestsMovedOutOfRange(allTests);
  assert.equal(transitions.length, 1);
  assert.equal(transitions[0].testName, 'Serum Creatinine');
  assert.equal(transitions[0].transition, 'NORMAL_TO_ABNORMAL');
});
