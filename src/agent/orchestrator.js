import { performance } from 'perf_hooks';
import { LLMClient, determineToolsForQuery } from './llmProvider.js';
import { TOOL_REGISTRY } from '../tools/toolRegistry.js';
import { logQueryAuditTrail } from '../tools/auditLogger.js';
import {
  MEDICAL_DISCLAIMER,
  CRITICAL_ALERT_MESSAGE,
  isPrescriptiveOrDiagnosticQuery,
  getMedicalRefusalMessage,
  detectPromptInjection
} from '../core/safetyGuard.js';

export class AgentOrchestrator {
  constructor() {
    this.llmClient = new LLMClient();
  }

  /**
   * Main entry point to process grounded conversational queries.
   * 
   * @param {string} userQuery - The patient's natural language question
   * @param {string} patientId - Identifier for patient record retrieval
   * @returns {Promise<object>}
   */
  async processQuery(userQuery, patientId = 'patient_001') {
    const startTime = performance.now();
    let safetyTriggered = false;
    let safetyMessage = null;
    let adversarialBlocked = false;

    // 1. Safety Guardrail: Detect prompt injection in user query
    const injection = detectPromptInjection(userQuery);
    if (injection.isAdversarial) {
      adversarialBlocked = true;
      console.warn(`[Orchestrator] Adversarial prompt injection detected: ${injection.matchedPattern}`);
    }

    // 2. Safety Guardrail: Check for prescription, dosage, or diagnostic demands
    if (isPrescriptiveOrDiagnosticQuery(userQuery)) {
      safetyTriggered = true;
      safetyMessage = "Request solicits prescription, dosage, or clinical diagnosis.";
      const refusalAnswer = getMedicalRefusalMessage();

      const auditId = await logQueryAuditTrail({
        userQuery,
        patientId,
        selectedTools: [],
        finalResponse: refusalAnswer,
        sourcesCited: [],
        safetyGuardTriggered: true,
        safetyMessage,
        adversarialAttackBlocked: adversarialBlocked
      });

      return {
        answer: refusalAnswer,
        sources: [],
        toolsCalled: [],
        auditId,
        disclaimer: MEDICAL_DISCLAIMER,
        safetyTriggered: true,
        safetyMessage
      };
    }

    // 3. Tool Planning: Determine required deterministic tools
    const toolPlans = determineToolsForQuery(userQuery);
    const executedTools = [];
    const sourcesCited = [];
    let containsCriticalResult = false;

    // 4. Deterministic Tool Execution
    for (const plan of toolPlans) {
      const toolFn = TOOL_REGISTRY[plan.toolName];
      if (toolFn) {
        const tStart = performance.now();
        const argsWithPatient = { ...plan.args, patient_id: patientId };
        
        let toolResult;
        try {
          toolResult = await toolFn(argsWithPatient);
        } catch (err) {
          toolResult = { error: err.message };
        }

        const tDuration = parseFloat((performance.now() - tStart).toFixed(2));

        // Check for critical panic thresholds in retrieved data
        if (toolResult) {
          if (toolResult.isCritical) containsCriticalResult = true;
          if (toolResult.results && Array.isArray(toolResult.results)) {
            if (toolResult.results.some(r => r.isCritical)) containsCriticalResult = true;
          }
          if (toolResult.trajectory && toolResult.trajectory.points) {
            // Check points
          }

          // Harvest citation sources
          if (toolResult.canonicalTestName && toolResult.reportDate) {
            sourcesCited.push({
              testName: toolResult.canonicalTestName,
              reportDate: toolResult.reportDate
            });
          }
          if (toolResult.results && Array.isArray(toolResult.results)) {
            for (const r of toolResult.results) {
              if (r.canonicalTestName && r.reportDate) {
                sourcesCited.push({ testName: r.canonicalTestName, reportDate: r.reportDate });
              }
            }
          }
          if (toolResult.trajectory && toolResult.trajectory.points) {
            for (const p of toolResult.trajectory.points) {
              sourcesCited.push({ testName: toolResult.canonicalTestName, reportDate: p.date });
            }
          }
          if (toolResult.comparisons && Array.isArray(toolResult.comparisons)) {
            for (const comp of toolResult.comparisons) {
              if (comp.canonicalTestName) {
                if (comp.firstDate) sourcesCited.push({ testName: comp.canonicalTestName, reportDate: comp.firstDate });
                if (comp.latestDate) sourcesCited.push({ testName: comp.canonicalTestName, reportDate: comp.latestDate });
              }
            }
          }
        }

        executedTools.push({
          toolName: plan.toolName,
          arguments: plan.args,
          resultSummary: toolResult,
          executionTimeMs: tDuration,
          timestamp: new Date()
        });
      }
    }

    // 5. If pre-tagged critical value is present, trigger fixed safety message
    if (containsCriticalResult) {
      safetyTriggered = true;
      safetyMessage = CRITICAL_ALERT_MESSAGE;
    }

    // 6. Check for ambiguous/conflicting duplicate results
    const conflictingExec = executedTools.find(
      t => t.resultSummary && t.resultSummary.qualityFlag === 'CONFLICTING_DUPLICATE_VALUES'
    );
    let groundedAnswer;
    if (conflictingExec) {
      const summary = conflictingExec.resultSummary;
      groundedAnswer = `In your lab report from ${summary.reportDate}, conflicting duplicate readings (${summary.value}) were detected for ${summary.canonicalTestName}. I cannot determine a single definitive value without manual clarification. Please verify your source document or submit a correction.`;
    } else {
      // Generate Grounded Synthesis via LLM Client
      groundedAnswer = await this.llmClient.generateGroundedResponse(userQuery, executedTools);
    }

    // If critical alert was triggered, ensure the fixed safety message is prominent
    if (containsCriticalResult) {
      groundedAnswer = `⚠️ **${CRITICAL_ALERT_MESSAGE}**\n\n${groundedAnswer}`;
    }

    // Deduplicate cited sources
    const uniqueSources = [];
    const sourceKeys = new Set();
    for (const src of sourcesCited) {
      const key = `${src.testName}|${src.reportDate}`;
      if (!sourceKeys.has(key)) {
        sourceKeys.add(key);
        uniqueSources.push(src);
      }
    }

    // 7. Persist comprehensive audit trail in MongoDB
    const auditId = await logQueryAuditTrail({
      userQuery,
      patientId,
      selectedTools: executedTools,
      finalResponse: groundedAnswer,
      sourcesCited: uniqueSources,
      safetyGuardTriggered: safetyTriggered,
      safetyMessage,
      adversarialAttackBlocked: adversarialBlocked
    });

    return {
      answer: groundedAnswer,
      sources: uniqueSources,
      toolsCalled: executedTools.map(t => ({
        toolName: t.toolName,
        arguments: t.arguments,
        executionTimeMs: t.executionTimeMs
      })),
      auditId,
      disclaimer: MEDICAL_DISCLAIMER,
      safetyTriggered,
      safetyMessage
    };
  }
}
