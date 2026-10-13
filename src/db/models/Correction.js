import mongoose from 'mongoose';

const CorrectionSchema = new mongoose.Schema(
  {
    correctionId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    testId: {
      type: String,
      required: true,
      index: true
    },
    patientId: {
      type: String,
      required: true,
      default: 'patient_001'
    },
    previousState: {
      rawValue: String,
      numericValue: Number,
      unit: String,
      referenceRangeRaw: String,
      qualityFlag: String
    },
    correctedState: {
      rawValue: String,
      numericValue: Number,
      unit: String,
      referenceRangeRaw: String,
      qualityFlag: String
    },
    reason: {
      type: String,
      default: 'User manual amendment'
    }
  },
  {
    timestamps: true
  }
);

export const Correction = mongoose.model('Correction', CorrectionSchema);
