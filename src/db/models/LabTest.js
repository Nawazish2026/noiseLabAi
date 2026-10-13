import mongoose from 'mongoose';

const LabTestSchema = new mongoose.Schema(
  {
    testId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    reportId: {
      type: String,
      required: true,
      index: true
    },
    patientId: {
      type: String,
      required: true,
      index: true,
      default: 'patient_001'
    },
    reportDate: {
      type: String,
      required: true,
      index: true // YYYY-MM-DD
    },
    rawTestName: {
      type: String,
      required: true
    },
    canonicalTestName: {
      type: String,
      required: true,
      index: true
    },
    panelName: {
      type: String,
      default: null
    },
    rawValue: {
      type: String,
      required: true
    },
    numericValue: {
      type: Number,
      default: null
    },
    unit: {
      type: String,
      default: null
    },
    referenceRangeRaw: {
      type: String,
      default: null
    },
    refLow: {
      type: Number,
      default: null
    },
    refHigh: {
      type: Number,
      default: null
    },
    isOutOfRange: {
      type: Boolean,
      default: null
    },
    isCritical: {
      type: Boolean,
      default: false
    },
    qualityFlag: {
      type: String,
      enum: [
        'HIGH_CONFIDENCE',
        'MISSING_UNIT',
        'MISSING_REFERENCE_RANGE',
        'UNREADABLE_OR_AMBIGUOUS_VALUE',
        'AMBIGUOUS_TEST_NAME',
        'CONFLICTING_DUPLICATE_VALUES',
        'PRE_TAGGED_CRITICAL',
        'USER_CORRECTED'
      ],
      default: 'HIGH_CONFIDENCE'
    },
    isCorrected: {
      type: Boolean,
      default: false
    },
    correctionNotes: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Compound index for fast chronological time-series retrieval per biomarker
LabTestSchema.index({ patientId: 1, canonicalTestName: 1, reportDate: 1 });
LabTestSchema.index({ patientId: 1, reportDate: 1, isOutOfRange: 1 });

export const LabTest = mongoose.model('LabTest', LabTestSchema);
