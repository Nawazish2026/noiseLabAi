import { v4 as uuidv4 } from 'uuid';
import { AuditLog } from '../db/models/AuditLog.js';

/**
 * Persists an auditable query record capturing prompt, tool decisions, execution times, and outputs.
 * 
 * @param {object} param0 
 * @returns {Promise<string>} auditId
 */
export async function logQueryAuditTrail({
  userQuery,
  patientId = 'patient_001',
  selectedTools = [],
  finalResponse,
  sourcesCited = [],
  safetyGuardTriggered = false,
  safetyMessage = null,
  adversarialAttackBlocked = false
}) {
  const auditId = uuidv4();

  try {
    await AuditLog.create({
      auditId,
      patientId,
      userQuery,
      selectedTools,
      finalResponse,
      sourcesCited,
      safetyGuardTriggered,
      safetyMessage,
      adversarialAttackBlocked
    });
    return auditId;
  } catch (error) {
    console.error(`[AuditLogger] Failed to persist audit log: ${error.message}`);
    return auditId;
  }
}

/**
 * Retrieve recent audit trails for inspection.
 * @param {number} limit 
 * @returns {Promise<Array>}
 */
export async function getRecentAuditLogs(limit = 20) {
  return await AuditLog.find().sort({ createdAt: -1 }).limit(limit).lean();
}
