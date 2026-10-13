import { v4 as uuidv4 } from 'uuid';
import { normalizeTestName } from '../core/aliases.js';
import { checkIsCritical, detectPromptInjection } from '../core/safetyGuard.js';

/**
 * Extracts standard ISO date string (YYYY-MM-DD) from report text.
 * @param {string} text 
 * @returns {string}
 */
export function extractReportDate(text) {
  if (!text) return new Date().toISOString().slice(0, 10);

  // Pattern 1: ISO format (2024-01-15)
  const isoMatch = text.match(/\b(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/);
  if (isoMatch) {
    return isoMatch[0];
  }

  // Pattern 2: Explicit headers like "Date: 01/15/2024" or "Report Date: 15/01/2024"
  const headerMatch = text.match(/(?:date|collected|reported|service\s*date)[:\s]+(\d{1,2})[\/\-](\d{1,2})[\/\-](20\d{2})/i);
  if (headerMatch) {
    const [, m, d, y] = headerMatch;
    const month = m.padStart(2, '0');
    const day = d.padStart(2, '0');
    return `${y}-${month}-${day}`;
  }

  // Pattern 3: Textual month like "January 15, 2024" or "15 Jan 2024"
  const monthMap = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
  };
  const textualMatch = text.match(/\b([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(20\d{2})\b/);
  if (textualMatch) {
    const monthKey = textualMatch[1].slice(0, 3).toLowerCase();
    if (monthMap[monthKey]) {
      const day = textualMatch[2].padStart(2, '0');
      return `${textualMatch[3]}-${monthMap[monthKey]}-${day}`;
    }
  }

  // Fallback to today's date if unspecified
  return new Date().toISOString().slice(0, 10);
}

/**
 * Parses a reference range string into numerical bounds.
 * e.g. "4.0 - 5.6", "< 200", "> 40", "<= 100", "70 - 99"
 * 
 * @param {string} rangeStr 
 * @returns {{ refLow: number | null, refHigh: number | null }}
 */
export function parseReferenceRange(rangeStr) {
  if (!rangeStr) return { refLow: null, refHigh: null };
  const cleaned = rangeStr.trim();

  // Pattern: "low - high" (e.g. 4.0 - 5.6 or 70 - 99)
  const intervalMatch = cleaned.match(/^([0-9.]+)\s*(?:-|to)\s*([0-9.]+)$/i);
  if (intervalMatch) {
    return {
      refLow: parseFloat(intervalMatch[1]),
      refHigh: parseFloat(intervalMatch[2])
    };
  }

  // Pattern: "< 100" or "<= 100"
  const lessMatch = cleaned.match(/^<(=)?\s*([0-9.]+)$/);
  if (lessMatch) {
    return {
      refLow: null,
      refHigh: parseFloat(lessMatch[2])
    };
  }

  // Pattern: "> 40" or ">= 40"
  const greaterMatch = cleaned.match(/^>(=)?\s*([0-9.]+)$/);
  if (greaterMatch) {
    return {
      refLow: parseFloat(greaterMatch[2]),
      refHigh: null
    };
  }

  return { refLow: null, refHigh: null };
}

const COMMON_UNITS = [
  'mg/dL', 'mmol/L', 'mEq/L', 'g/dL', '%', 'x10^3/uL',
  'uL', 'U/L', 'IU/L', 'ng/mL', 'pg/mL', 'umol/L', 'µmol/L', 'mmol/mol'
];

/**
 * Parse lines of clinical lab reports into structured assays.
 * Supports multi-space formatted text and standard single-space table rows.
 * 
 * @param {string} rawText 
 * @param {string} reportId 
 * @param {string} reportDate 
 * @param {string} patientId 
 * @returns {Array<object>}
 */
export function parseStructuredLabTests(rawText, reportId, reportDate, patientId = 'patient_001') {
  if (!rawText) return [];

  const lines = rawText.split('\n');
  const extracted = [];
  const seenCanonicalTests = new Set();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Skip section headers or metadata lines
    if (/^(patient|doctor|physician|collected|reported|specimen|lab\s+id|test\s+name|status|notes|page|end\s+of|metropolitan|accredited|date\s+of)/i.test(trimmed)) {
      continue;
    }
    if (/^--\s*\d+\s+of\s+\d+\s*--/.test(trimmed)) {
      continue;
    }

    // Match clinical unit (words or symbols like %)
    let matchedUnit = null;
    let unitIndex = -1;
    let unitMatchLength = 0;

    for (const unit of COMMON_UNITS) {
      let uRegex;
      if (/^[a-zA-Z0-9_\^/]+$/.test(unit)) {
        uRegex = new RegExp(`\\b${unit.replace(/[\^]/g, '\\^')}\\b`, 'i');
      } else {
        uRegex = new RegExp(`(?:^|\\s)(${unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?:\\s|$)`);
      }

      const uMatch = trimmed.match(uRegex);
      if (uMatch) {
        matchedUnit = unit;
        // In the symbol regex, capture group 1 is the symbol itself
        unitIndex = uMatch.index + (uMatch[0].indexOf(unit));
        unitMatchLength = unit.length;
        break;
      }
    }

    let rawTestName = '';
    let rawValue = '';
    let unit = null;
    let refRangeRaw = null;

    if (matchedUnit && unitIndex > 0) {
      unit = matchedUnit;
      const beforeUnit = trimmed.slice(0, unitIndex).trim();
      const afterUnit = trimmed.slice(unitIndex + unitMatchLength).trim();

      // In beforeUnit, the last token is the numeric value
      const tokensBefore = beforeUnit.split(/\s+/);
      if (tokensBefore.length >= 2) {
        rawValue = tokensBefore[tokensBefore.length - 1];
        rawTestName = tokensBefore.slice(0, tokensBefore.length - 1).join(' ').trim();
      } else {
        continue;
      }

      // In afterUnit, reference range like "4.0 - 5.6" or "< 200" or "> 40"
      const rangeMatch = afterUnit.match(/([<>]?=?\s*\d+(?:\.\d+)?(?:\s*(?:-|to)\s*\d+(?:\.\d+)?)?)/i);
      if (rangeMatch) {
        refRangeRaw = rangeMatch[1].trim();
      }
    } else {
      // Fallback: Check lines with numeric value, and optionally reference range without explicit unit
      const noUnitMatch = trimmed.match(/^([A-Za-z\s,\(\)\/\-\+]{2,40}?)\s+([<>~]?\s*-?\d+(?:\.\d+)?)(?:\s+([<>]?=?\s*\d+(?:\.\d+)?\s*(?:-|to)?\s*\d*(?:\.\d+)?))?$/i);
      if (noUnitMatch) {
        rawTestName = noUnitMatch[1].trim();
        rawValue = noUnitMatch[2].trim();
        unit = null;
        refRangeRaw = noUnitMatch[3] ? noUnitMatch[3].trim() : null;
      } else {
        continue;
      }
    }

    if (!rawTestName || !rawValue) continue;
    if (/^(page|specimen|ordering|methodology|clinical|laboratory)/i.test(rawTestName)) continue;

    const { canonicalTestName, panelName } = normalizeTestName(rawTestName);

    // Parse numeric value
    const parsedNumber = parseFloat(rawValue.replace(/^[<>~]/, ''));
    const numericValue = isNaN(parsedNumber) ? null : parsedNumber;

    // Parse reference range bounds
    const { refLow, refHigh } = parseReferenceRange(refRangeRaw);

    // Determine out-of-range flag
    let isOutOfRange = null;
    if (numericValue !== null) {
      if (refLow !== null && numericValue < refLow) {
        isOutOfRange = true;
      } else if (refHigh !== null && numericValue > refHigh) {
        isOutOfRange = true;
      } else if (refLow !== null || refHigh !== null) {
        isOutOfRange = false;
      }
    }

    // Check pre-tagged critical panic threshold
    const isCritical = checkIsCritical(canonicalTestName, numericValue);

    // Data Quality Flag
    let qualityFlag = 'HIGH_CONFIDENCE';
    if (isCritical) {
      qualityFlag = 'PRE_TAGGED_CRITICAL';
    } else if (numericValue === null) {
      qualityFlag = 'UNREADABLE_OR_AMBIGUOUS_VALUE';
    } else if (!unit) {
      qualityFlag = 'MISSING_UNIT';
    } else if (!refRangeRaw) {
      qualityFlag = 'MISSING_REFERENCE_RANGE';
    }

    // Deduplication & Conflict guard for repeated tests in same report
    if (seenCanonicalTests.has(canonicalTestName)) {
      const existing = extracted.find(t => t.canonicalTestName === canonicalTestName);
      if (existing && existing.rawValue !== rawValue) {
        existing.qualityFlag = 'CONFLICTING_DUPLICATE_VALUES';
        existing.rawValue = `${existing.rawValue} / ${rawValue} (CONFLICTING)`;
        existing.numericValue = null; // Do not guess between conflicting numbers
        existing.isOutOfRange = null;
      }
      continue;
    }
    seenCanonicalTests.add(canonicalTestName);

    extracted.push({
      testId: uuidv4(),
      reportId,
      patientId,
      reportDate,
      rawTestName,
      canonicalTestName,
      panelName,
      rawValue,
      numericValue,
      unit,
      referenceRangeRaw: refRangeRaw,
      refLow,
      refHigh,
      isOutOfRange,
      isCritical,
      qualityFlag,
      isCorrected: false,
      correctionNotes: null
    });
  }

  return extracted;
}

/**
 * Orchestrates raw text extraction into complete report metadata and structured tests.
 * 
 * @param {string} rawText 
 * @param {string} filename 
 * @param {string} fileType 
 * @param {string} patientId 
 * @returns {object}
 */
export function processRawReport(rawText, filename, fileType, patientId = 'patient_001') {
  const reportId = uuidv4();
  const reportDate = extractReportDate(rawText);
  const injectionCheck = detectPromptInjection(rawText);

  const tests = parseStructuredLabTests(rawText, reportId, reportDate, patientId);

  return {
    report: {
      reportId,
      patientId,
      filename,
      fileType,
      reportDate,
      rawText,
      testCount: tests.length,
      adversarialPromptDetected: injectionCheck.isAdversarial
    },
    tests
  };
}
