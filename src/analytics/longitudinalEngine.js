import { convertUnit } from '../core/unitConverter.js';

/**
 * Computes deterministic mathematical trajectory across historical test results.
 * Code-based calculation prevents LLM arithmetic hallucinations.
 * 
 * @param {Array<object>} testHistory - Array of LabTest objects for a single biomarker
 * @returns {object}
 */
export function computeBiomarkerTrajectory(testHistory) {
  if (!testHistory || testHistory.length === 0) {
    return {
      trendDirection: 'INSUFFICIENT_DATA',
      statusSummary: 'No historical test records found for this biomarker.',
      points: []
    };
  }

  // Sort chronologically ascending
  const sorted = [...testHistory].sort((a, b) => new Date(a.reportDate) - new Date(b.reportDate));

  if (sorted.length === 1) {
    const single = sorted[0];
    return {
      canonicalTestName: single.canonicalTestName,
      trendDirection: 'STABLE',
      unit: single.unit,
      latestDate: single.reportDate,
      firstDate: single.reportDate,
      points: sorted.map(t => ({
        date: t.reportDate,
        value: t.numericValue,
        rawValue: t.rawValue,
        unit: t.unit,
        isOutOfRange: t.isOutOfRange,
        refRange: t.referenceRangeRaw,
        qualityFlag: t.qualityFlag,
        isCorrected: t.isCorrected
      })),
      statusSummary: `Only one recorded result (${single.rawValue} ${single.unit || ''} on ${single.reportDate}). Additional reports needed for longitudinal trend.`
    };
  }

  const baseline = sorted[0];
  const latest = sorted[sorted.length - 1];
  const prev = sorted[sorted.length - 2];

  // Unit compatibility check
  let baselineVal = baseline.numericValue;
  let latestVal = latest.numericValue;
  let unitConverted = false;

  if (baseline.unit !== latest.unit) {
    const conv = convertUnit(latest.numericValue, latest.unit, baseline.unit, baseline.canonicalTestName);
    if (!conv.success) {
      return {
        canonicalTestName: baseline.canonicalTestName,
        trendDirection: 'INCOMPARABLE_UNITS',
        statusSummary: `Cannot compare results across dates due to incompatible measurement units: "${baseline.unit}" on ${baseline.reportDate} vs "${latest.unit}" on ${latest.reportDate}. ${conv.error}`,
        points: sorted
      };
    }
    latestVal = conv.convertedValue;
    unitConverted = true;
  }

  if (baselineVal === null || latestVal === null) {
    return {
      canonicalTestName: baseline.canonicalTestName,
      trendDirection: 'INSUFFICIENT_DATA',
      statusSummary: 'One or more recorded values are non-numeric or unreadable; cannot compute numeric delta.',
      points: sorted
    };
  }

  // Deterministic math
  const absoluteDelta = parseFloat((latestVal - baselineVal).toFixed(2));
  const percentageDelta = baselineVal !== 0
    ? parseFloat(((absoluteDelta / baselineVal) * 100).toFixed(1))
    : 0;

  let trendDirection = 'STABLE';
  if (Math.abs(percentageDelta) < 1.0) {
    trendDirection = 'STABLE';
  } else if (absoluteDelta > 0) {
    if (baseline.isOutOfRange && !latest.isOutOfRange) {
      trendDirection = 'NORMALIZED';
    } else if (!baseline.isOutOfRange && latest.isOutOfRange) {
      trendDirection = 'ELEVATED';
    } else {
      trendDirection = 'INCREASED';
    }
  } else if (absoluteDelta < 0) {
    if (baseline.isOutOfRange && !latest.isOutOfRange) {
      trendDirection = 'NORMALIZED';
    } else {
      trendDirection = 'DECREASED';
    }
  }

  const points = sorted.map(t => ({
    date: t.reportDate,
    value: t.numericValue,
    rawValue: t.rawValue,
    unit: t.unit,
    isOutOfRange: t.isOutOfRange,
    refRange: t.referenceRangeRaw,
    qualityFlag: t.qualityFlag,
    isCorrected: t.isCorrected
  }));

  const changeVerb = absoluteDelta > 0 ? 'increased' : 'decreased';
  const statusSummary = `${baseline.canonicalTestName} ${Math.abs(absoluteDelta) === 0 ? 'remained stable' : `${changeVerb} by ${Math.abs(absoluteDelta)} ${baseline.unit || ''} (${Math.abs(percentageDelta)}%)`} from ${baseline.reportDate} (${baseline.rawValue} ${baseline.unit || ''}) to ${latest.reportDate} (${latest.rawValue} ${latest.unit || ''}). Current status: ${latest.isOutOfRange ? 'OUT OF RANGE' : 'WITHIN NORMAL RANGE'}.`;

  return {
    canonicalTestName: baseline.canonicalTestName,
    unit: baseline.unit,
    firstDate: baseline.reportDate,
    latestDate: latest.reportDate,
    baselineValue: baselineVal,
    latestValue: latestVal,
    absoluteDelta,
    percentageDelta,
    trendDirection,
    unitConverted,
    statusSummary,
    points
  };
}

/**
 * Compare an entire clinical panel between two distinct dates.
 * 
 * @param {Array<object>} testsDate1 
 * @param {Array<object>} testsDate2 
 * @param {string} panelName 
 * @returns {object}
 */
export function comparePanels(testsDate1, testsDate2, panelName) {
  const map1 = new Map(testsDate1.map(t => [t.canonicalTestName, t]));
  const map2 = new Map(testsDate2.map(t => [t.canonicalTestName, t]));

  const comparison = [];

  for (const [testName, t2] of map2.entries()) {
    const t1 = map1.get(testName);
    if (t1) {
      const trajectory = computeBiomarkerTrajectory([t1, t2]);
      comparison.push(trajectory);
    } else {
      comparison.push({
        canonicalTestName: testName,
        statusSummary: `Present on ${t2.reportDate} (${t2.rawValue} ${t2.unit || ''}) but absent on earlier report.`,
        trendDirection: 'INSUFFICIENT_DATA'
      });
    }
  }

  return {
    panelName,
    earlierDate: testsDate1[0]?.reportDate || 'Date 1',
    laterDate: testsDate2[0]?.reportDate || 'Date 2',
    comparisons: comparison
  };
}

/**
 * Identifies tests that moved from normal to abnormal across chronological reports.
 * 
 * @param {Array<object>} allTests 
 * @returns {Array<object>}
 */
export function findTestsMovedOutOfRange(allTests) {
  // Group tests by canonicalTestName
  const groups = new Map();
  for (const test of allTests) {
    if (!groups.has(test.canonicalTestName)) {
      groups.set(test.canonicalTestName, []);
    }
    groups.get(test.canonicalTestName).push(test);
  }

  const transitioned = [];

  for (const [testName, tests] of groups.entries()) {
    if (tests.length < 2) continue;
    const sorted = tests.sort((a, b) => new Date(a.reportDate) - new Date(b.reportDate));
    const prev = sorted[sorted.length - 2];
    const latest = sorted[sorted.length - 1];

    if (prev.isOutOfRange === false && latest.isOutOfRange === true) {
      transitioned.push({
        testName,
        previousDate: prev.reportDate,
        previousValue: `${prev.rawValue} ${prev.unit || ''}`,
        latestDate: latest.reportDate,
        latestValue: `${latest.rawValue} ${latest.unit || ''}`,
        referenceRange: latest.referenceRangeRaw,
        transition: 'NORMAL_TO_ABNORMAL'
      });
    }
  }

  return transitioned;
}
