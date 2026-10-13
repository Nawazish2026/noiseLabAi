import mongoose from 'mongoose';

const ToolExecutionSchema = new mongoose.Schema(
  {
    toolName: {
      type: String,
      required: true
    },
    arguments: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    resultSummary: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    executionTimeMs: {
      type: Number,
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const AuditLogSchema = new mongoose.Schema(
  {
    auditId: {
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
    userQuery: {
      type: String,
      required: true
    },
    selectedTools: [ToolExecutionSchema],
    finalResponse: {
      type: String,
      required: true
    },
    sourcesCited: [
      {
        testName: String,
        reportDate: String
      }
    ],
    safetyGuardTriggered: {
      type: Boolean,
      default: false
    },
    safetyMessage: {
      type: String,
      default: null
    },
    adversarialAttackBlocked: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

export const AuditLog = mongoose.model('AuditLog', AuditLogSchema);
