import mongoose from 'mongoose';

const LabReportSchema = new mongoose.Schema(
  {
    reportId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    patientId: {
      type: String,
      required: true,
      index: true,
      default: 'patient_001'
    },
    filename: {
      type: String,
      required: true
    },
    fileType: {
      type: String,
      enum: ['pdf', 'png', 'jpg', 'jpeg'],
      required: true
    },
    reportDate: {
      type: String,
      required: true,
      index: true // YYYY-MM-DD
    },
    rawText: {
      type: String,
      required: true
    },
    testCount: {
      type: Number,
      default: 0
    },
    adversarialPromptDetected: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

export const LabReport = mongoose.model('LabReport', LabReportSchema);
