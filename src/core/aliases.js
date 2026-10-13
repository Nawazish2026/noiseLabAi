export const CANONICAL_ALIASES = {
  'HbA1c': [
    'hba1c', 'a1c', 'glycated hemoglobin', 'glycosylated hemoglobin',
    'hemoglobin a1c', 'glycohemoglobin', 'hgb a1c', 'glyco hgb', 'a1c glycated'
  ],
  'Fasting Glucose': [
    'fasting glucose', 'glucose, fasting', 'glucose fasting', 'fbs',
    'fasting blood sugar', 'fbg', 'blood glucose - fasting',
    'glucose (fasting)', 'plasma glucose, fasting', 'blood sugar (fasting)'
  ],
  'Total Cholesterol': [
    'total cholesterol', 'cholesterol, total', 'cholesterol total',
    'serum cholesterol', 'cholesterol'
  ],
  'HDL Cholesterol': [
    'hdl', 'hdl-c', 'hdl cholesterol', 'high density lipoprotein',
    'high-density lipoprotein cholesterol', 'hdl-cholesterol'
  ],
  'LDL Cholesterol': [
    'ldl', 'ldl-c', 'ldl cholesterol', 'low density lipoprotein',
    'low-density lipoprotein cholesterol', 'calculated ldl', 'ldl-cholesterol'
  ],
  'Triglycerides': [
    'triglycerides', 'triglyceride', 'trigs', 'tg', 'serum triglycerides'
  ],
  'Serum Creatinine': [
    'creatinine', 'serum creatinine', 'creatinine, serum', 'creat',
    'blood creatinine'
  ],
  'eGFR': [
    'egfr', 'estimated gfr', 'glomerular filtration rate',
    'egfr (ckd-epi)', 'egfr non-african american', 'egfr ckd-epi'
  ],
  'Blood Urea Nitrogen': [
    'bun', 'blood urea nitrogen', 'urea nitrogen', 'urea', 'serum urea'
  ],
  'Potassium': [
    'potassium', 'serum potassium', 'potassium, serum', 'k', 'k+'
  ],
  'Sodium': [
    'sodium', 'serum sodium', 'sodium, serum', 'na', 'na+'
  ],
  'Calcium': [
    'calcium', 'serum calcium', 'ca', 'total calcium'
  ],
  'ALT': [
    'alt', 'alanine aminotransferase', 'sgpt', 'alanine transaminase',
    'alt (sgpt)'
  ],
  'AST': [
    'ast', 'aspartate aminotransferase', 'sgot', 'aspartate transaminase',
    'ast (sgot)'
  ],
  'TSH': [
    'tsh', 'thyroid stimulating hormone', 'thyrotropin',
    'ultra-sensitive tsh', 'tsh, 3rd generation'
  ],
  'Hemoglobin': [
    'hemoglobin', 'hgb', 'hb', 'total hemoglobin'
  ],
  'Hematocrit': [
    'hematocrit', 'hct', 'packed cell volume', 'pcv'
  ],
  'WBC Count': [
    'wbc', 'white blood cell count', 'leukocytes', 'white blood count',
    'white blood cells'
  ],
  'Platelets': [
    'platelets', 'platelet count', 'plt', 'thrombocytes'
  ],
  'Vitamin D': [
    'vitamin d', '25-hydroxy vitamin d', 'vit d', '25-oh vitamin d',
    'vitamin d (25-hydroxy)'
  ]
};

export const PANEL_DEFINITIONS = {
  'Lipid Panel': [
    'Total Cholesterol', 'HDL Cholesterol', 'LDL Cholesterol', 'Triglycerides'
  ],
  'Comprehensive Metabolic Panel': [
    'Fasting Glucose', 'Blood Urea Nitrogen', 'Serum Creatinine',
    'eGFR', 'Sodium', 'Potassium', 'Calcium', 'ALT', 'AST'
  ],
  'Complete Blood Count': [
    'WBC Count', 'Hemoglobin', 'Hematocrit', 'Platelets'
  ],
  'Glycemic Control': [
    'HbA1c', 'Fasting Glucose'
  ]
};

function cleanString(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[()[\].,:;/\-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Build inverted fast lookup index
const LOOKUP_MAP = new Map();
for (const [canonical, aliases] of Object.entries(CANONICAL_ALIASES)) {
  LOOKUP_MAP.set(cleanString(canonical), canonical);
  for (const alias of aliases) {
    LOOKUP_MAP.set(cleanString(alias), canonical);
  }
}

/**
 * Resolve a raw string test name to a canonical test name and its clinical panel.
 * @param {string} rawName 
 * @returns {{ canonicalTestName: string, panelName: string | null }}
 */
export function normalizeTestName(rawName) {
  if (!rawName) {
    return { canonicalTestName: 'Unknown Assay', panelName: null };
  }

  const cleaned = cleanString(rawName);

  // 1. Direct map lookup
  if (LOOKUP_MAP.has(cleaned)) {
    const canonical = LOOKUP_MAP.get(cleaned);
    return { canonicalTestName: canonical, panelName: resolvePanel(canonical) };
  }

  // 2. Substring matching for phrases like "Lipid Profile: Cholesterol, Total"
  for (const [aliasKey, canonical] of LOOKUP_MAP.entries()) {
    if (cleaned.includes(aliasKey) || aliasKey.includes(cleaned)) {
      return { canonicalTestName: canonical, panelName: resolvePanel(canonical) };
    }
  }

  // 3. Fallback: Capitalize tokens
  const fallback = rawName
    .trim()
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

  return { canonicalTestName: fallback, panelName: resolvePanel(fallback) };
}

export function resolvePanel(canonicalTestName) {
  for (const [panelName, tests] of Object.entries(PANEL_DEFINITIONS)) {
    if (tests.includes(canonicalTestName)) {
      return panelName;
    }
  }
  return null;
}

/**
 * Resolve user query terms (e.g. "a1c", "blood sugar", "lipid panel") to canonical test names.
 * @param {string} queryTerm 
 * @returns {string | null}
 */
export function findCanonicalName(queryTerm) {
  if (!queryTerm) return null;
  const cleaned = cleanString(queryTerm);
  if (LOOKUP_MAP.has(cleaned)) {
    return LOOKUP_MAP.get(cleaned);
  }

  for (const [aliasKey, canonical] of LOOKUP_MAP.entries()) {
    if (cleaned.includes(aliasKey) || aliasKey.includes(cleaned)) {
      return canonical;
    }
  }

  return null;
}

/**
 * Get all tests belonging to a panel.
 * @param {string} panelQuery 
 * @returns {string[]}
 */
export function getPanelTests(panelQuery) {
  const cleaned = cleanString(panelQuery);
  for (const [panelName, tests] of Object.entries(PANEL_DEFINITIONS)) {
    if (cleanString(panelName).includes(cleaned) || cleaned.includes(cleanString(panelName))) {
      return tests;
    }
  }
  return [];
}
