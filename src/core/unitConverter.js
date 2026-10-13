/**
 * Clinical Unit Conversion Module
 * 
 * Safely converts laboratory measurement units for longitudinal comparisons
 * using validated medical stoichiometric factors. Rejects unverified conversions.
 */

function cleanUnit(unit) {
  if (!unit) return '';
  return unit.toLowerCase().trim().replace(/\s+/g, '');
}

/**
 * Attempt to convert a numeric value from sourceUnit to targetUnit for a specific biomarker.
 * 
 * @param {number} value - The numeric value to convert
 * @param {string} fromUnit - Original assay unit
 * @param {string} toUnit - Target comparison unit
 * @param {string} canonicalTestName - Canonical biomarker name
 * @returns {{ success: boolean, convertedValue?: number, unit?: string, error?: string }}
 */
export function convertUnit(value, fromUnit, toUnit, canonicalTestName) {
  const uFrom = cleanUnit(fromUnit);
  const uTo = cleanUnit(toUnit);

  if (!uFrom || !uTo) {
    return {
      success: false,
      error: `Missing unit for ${canonicalTestName} (from: "${fromUnit}", to: "${toUnit}")`
    };
  }

  // Identity match (e.g., mg/dl == mg/dL)
  if (uFrom === uTo) {
    return {
      success: true,
      convertedValue: value,
      unit: toUnit
    };
  }

  // 1. Glucose (Molecular weight ~180.16 g/mol)
  if (canonicalTestName === 'Fasting Glucose') {
    if (uFrom === 'mg/dl' && uTo === 'mmol/l') {
      return {
        success: true,
        convertedValue: parseFloat((value / 18.0182).toFixed(2)),
        unit: toUnit
      };
    }
    if (uFrom === 'mmol/l' && uTo === 'mg/dl') {
      return {
        success: true,
        convertedValue: parseFloat((value * 18.0182).toFixed(1)),
        unit: toUnit
      };
    }
  }

  // 2. Cholesterol (Total, HDL, LDL - Molecular weight ~386.65 g/mol)
  if (['Total Cholesterol', 'HDL Cholesterol', 'LDL Cholesterol'].includes(canonicalTestName)) {
    if (uFrom === 'mg/dl' && uTo === 'mmol/l') {
      return {
        success: true,
        convertedValue: parseFloat((value / 38.67).toFixed(2)),
        unit: toUnit
      };
    }
    if (uFrom === 'mmol/l' && uTo === 'mg/dl') {
      return {
        success: true,
        convertedValue: parseFloat((value * 38.67).toFixed(1)),
        unit: toUnit
      };
    }
  }

  // 3. Triglycerides (Molecular weight ~885.7 g/mol)
  if (canonicalTestName === 'Triglycerides') {
    if (uFrom === 'mg/dl' && uTo === 'mmol/l') {
      return {
        success: true,
        convertedValue: parseFloat((value / 88.57).toFixed(2)),
        unit: toUnit
      };
    }
    if (uFrom === 'mmol/l' && uTo === 'mg/dl') {
      return {
        success: true,
        convertedValue: parseFloat((value * 88.57).toFixed(1)),
        unit: toUnit
      };
    }
  }

  // 4. Serum Creatinine (Molecular weight ~113.12 g/mol)
  if (canonicalTestName === 'Serum Creatinine') {
    if (uFrom === 'mg/dl' && (uTo === 'umol/l' || uTo === 'µmol/l')) {
      return {
        success: true,
        convertedValue: parseFloat((value * 88.4).toFixed(1)),
        unit: toUnit
      };
    }
    if ((uFrom === 'umol/l' || uFrom === 'µmol/l') && uTo === 'mg/dl') {
      return {
        success: true,
        convertedValue: parseFloat((value / 88.4).toFixed(2)),
        unit: toUnit
      };
    }
  }

  // 5. HbA1c: NGSP (%) vs IFCC (mmol/mol)
  if (canonicalTestName === 'HbA1c') {
    if (uFrom === '%' && uTo === 'mmol/mol') {
      // IFCC = (NGSP - 2.15) * 10.929
      return {
        success: true,
        convertedValue: parseFloat(((value - 2.15) * 10.929).toFixed(1)),
        unit: toUnit
      };
    }
    if (uFrom === 'mmol/mol' && uTo === '%') {
      // NGSP = (IFCC / 10.929) + 2.15
      return {
        success: true,
        convertedValue: parseFloat(((value / 10.929) + 2.15).toFixed(2)),
        unit: toUnit
      };
    }
  }

  // Incompatible or unsupported conversion
  return {
    success: false,
    error: `Incompatible units for "${canonicalTestName}": cannot safely convert from "${fromUnit}" to "${toUnit}"`
  };
}
