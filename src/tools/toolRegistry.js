import { LabTest } from '../db/models/LabTest.js';
import { LabReport } from '../db/models/LabReport.js';
import { findCanonicalName, getPanelTests } from '../core/aliases.js';
import { computeBiomarkerTrajectory, comparePanels, findTestsMovedOutOfRange } from '../analytics/longitudinalEngine.js';

/**
 * Tool 1: Retrieve the single most recent lab result for a specific test.
 * 
 * @param {object} args - { test_name: string, patient_id?: string }
 * @returns {Promise<object>}
 */
export async function get_latest_result(args) {
  const { test_name, patient_id = 'patient_001' } = args;
  const canonical = findCanonicalName(test_name) || test_name;

  const latest = await LabTest.findOne({
    patientId: patient_id,
    canonicalTestName: canonical
  }).sort({ reportDate: -1 });

  if (!latest) {
    return {
      found: false,
      message: `No record found for test "${test_name}" (canonical: "${canonical}").`
    };
  }

  return {
    found: true,
    canonicalTestName: latest.canonicalTestName,
    rawTestName: latest.rawTestName,
    reportDate: latest.reportDate,
    value: latest.rawValue,
    numericValue: latest.numericValue,
    unit: latest.unit,
    referenceRange: latest.referenceRangeRaw,
    isOutOfRange: latest.isOutOfRange,
    isCritical: latest.isCritical,
    qualityFlag: latest.qualityFlag,
    isCorrected: latest.isCorrected,
    reportId: latest.reportId
  };
}

/**
 * Tool 2: Retrieve the chronological history and computed trajectory for a test across all reports.
 * 
 * @param {object} args - { test_name: string, patient_id?: string }
 * @returns {Promise<object>}
 */
export async function get_test_history(args) {
  const { test_name, patient_id = 'patient_001' } = args;
  const canonical = findCanonicalName(test_name) || test_name;

  const history = await LabTest.find({
    patientId: patient_id,
    canonicalTestName: canonical
  }).sort({ reportDate: 1 });

  if (!history || history.length === 0) {
    return {
      found: false,
      message: `No historical records found for test "${test_name}" (canonical: "${canonical}").`
    };
  }

  const trajectory = computeBiomarkerTrajectory(history);

  return {
    found: true,
    canonicalTestName: canonical,
    totalRecords: history.length,
    trajectory
  };
}

/**
 * Tool 3: List all test results that fell outside the reference interval.
 * Optionally filter by specific report date.
 * 
 * @param {object} args - { report_date?: string, patient_id?: string }
 * @returns {Promise<object>}
 */
export async function list_out_of_range_results(args = {}) {
  const { report_date, patient_id = 'patient_001' } = args;

  const filter = {
    patientId: patient_id,
    isOutOfRange: true
  };

  if (report_date) {
    filter.reportDate = report_date;
  }

  const results = await LabTest.find(filter).sort({ reportDate: -1, canonicalTestName: 1 });

  return {
    patientId: patient_id,
    reportDateFilter: report_date || 'ALL_DATES',
    count: results.length,
    results: results.map(r => ({
      testId: r.testId,
      canonicalTestName: r.canonicalTestName,
      reportDate: r.reportDate,
      value: r.rawValue,
      unit: r.unit,
      referenceRange: r.referenceRangeRaw,
      isCritical: r.isCritical,
      qualityFlag: r.qualityFlag
    }))
  };
}

/**
 * Tool 4: Compare an entire panel (e.g. Lipid Panel, Metabolic Panel) between two latest dates.
 * 
 * @param {object} args - { panel_name: string, patient_id?: string }
 * @returns {Promise<object>}
 */
export async function compare_panel_results(args) {
  const { panel_name = 'Lipid Panel', patient_id = 'patient_001' } = args;
  const panelTests = getPanelTests(panel_name);

  // Find distinct report dates where tests for this specific panel exist
  const distinctDates = await LabTest.distinct('reportDate', {
    patientId: patient_id,
    canonicalTestName: { $in: panelTests }
  });

  if (!distinctDates || distinctDates.length < 2) {
    return {
      status: 'INSUFFICIENT_REPORTS',
      message: `At least two distinct report dates with measurements for ${panel_name} are required.`
    };
  }

  // Sort descending to get latest two dates
  distinctDates.sort((a, b) => new Date(b) - new Date(a));
  const latestDate = distinctDates[0];
  const previousDate = distinctDates[1];

  const tests1 = await LabTest.find({
    patientId: patient_id,
    reportDate: previousDate,
    canonicalTestName: { $in: panelTests }
  });

  const tests2 = await LabTest.find({
    patientId: patient_id,
    reportDate: latestDate,
    canonicalTestName: { $in: panelTests }
  });

  const comparison = comparePanels(tests1, tests2, panel_name);
  return comparison;
}

/**
 * Tool 5: Find biomarkers that transitioned from normal to outside reference interval.
 * 
 * @param {object} args - { patient_id?: string }
 * @returns {Promise<object>}
 */
export async function get_transitioned_out_of_range(args = {}) {
  const { patient_id = 'patient_001' } = args;
  const allTests = await LabTest.find({ patientId: patient_id }).sort({ reportDate: 1 });
  const transitions = findTestsMovedOutOfRange(allTests);

  return {
    patientId: patient_id,
    transitionCount: transitions.length,
    transitions
  };
}

/**
 * Map of tool names to functions.
 */
export const TOOL_REGISTRY = {
  get_latest_result,
  get_test_history,
  list_out_of_range_results,
  compare_panel_results,
  get_transitioned_out_of_range
};

/**
 * Declarative Tool Specifications for LLM Function Calling.
 */
export const TOOL_DEFINITIONS = [
  {
    name: 'get_latest_result',
    description: 'Get the most recent laboratory test result for a specific biomarker (e.g., HbA1c, Fasting Glucose, Total Cholesterol).',
    parameters: {
      type: 'object',
      properties: {
        test_name: {
          type: 'string',
          description: 'The name or alias of the test (e.g. "HbA1c", "glucose", "cholesterol", "creatinine").'
        }
      },
      required: ['test_name']
    }
  },
  {
    name: 'get_test_history',
    description: 'Get the chronological history, values across reports, and mathematical trajectory/delta for a specific biomarker.',
    parameters: {
      type: 'object',
      properties: {
        test_name: {
          type: 'string',
          description: 'The name or alias of the test (e.g. "HbA1c", "Fasting Glucose", "LDL").'
        }
      },
      required: ['test_name']
    }
  },
  {
    name: 'list_out_of_range_results',
    description: 'List all test results that are outside the normal reference interval (abnormal/high/low), optionally filtered by report date.',
    parameters: {
      type: 'object',
      properties: {
        report_date: {
          type: 'string',
          description: 'Optional ISO date (YYYY-MM-DD) to inspect abnormal results for a single report.'
        }
      }
    }
  },
  {
    name: 'compare_panel_results',
    description: 'Compare multi-analyte panels (e.g. "Lipid Panel", "Comprehensive Metabolic Panel") between the latest two dates with computed deltas.',
    parameters: {
      type: 'object',
      properties: {
        panel_name: {
          type: 'string',
          description: 'Name of the panel, e.g. "Lipid Panel" or "Metabolic Panel".'
        }
      },
      required: ['panel_name']
    }
  },
  {
    name: 'get_transitioned_out_of_range',
    description: 'Find results that moved from normal reference range to out-of-range in recent reports.',
    parameters: {
      type: 'object',
      properties: {}
    }
  }
];
