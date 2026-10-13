import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import { config } from '../config/index.js';
import { SYSTEM_PROMPT } from './prompts.js';
import { TOOL_DEFINITIONS, TOOL_REGISTRY } from '../tools/toolRegistry.js';
import { findCanonicalName } from '../core/aliases.js';

/**
 * Intelligent deterministic offline fallback generator.
 * Synthesizes grounded natural language responses directly from tool outputs
 * ensuring full functionality even when no API keys are configured.
 */
function generateDeterministicGroundedResponse(query, toolExecutions) {
  if (!toolExecutions || toolExecutions.length === 0) {
    return 'I cannot determine an answer to your query because no relevant lab data could be retrieved. Please verify that your lab reports have been uploaded.';
  }

  const sections = [];

  for (const exec of toolExecutions) {
    const { toolName, resultSummary } = exec;

    if (toolName === 'get_latest_result') {
      if (!resultSummary.found) {
        sections.push(resultSummary.message);
      } else if (resultSummary.qualityFlag === 'CONFLICTING_DUPLICATE_VALUES') {
        sections.push(
          `In your lab report from ${resultSummary.reportDate}, conflicting duplicate readings (${resultSummary.value}) were detected for ${resultSummary.canonicalTestName}. I cannot determine a single definitive value without manual clarification. Please verify your source document or submit a correction.`
        );
      } else {
        const outStatus = resultSummary.isOutOfRange === null
          ? 'unspecified range'
          : resultSummary.isOutOfRange ? 'OUT OF NORMAL RANGE' : 'within normal reference range';
        const critNote = resultSummary.isCritical ? ' [CRITICAL ALERT: Result requires immediate physician attention]' : '';
        const corrNote = resultSummary.isCorrected ? ' (Value was manually corrected by user)' : '';
        const unitNote = !resultSummary.unit ? ' (Notice: Unit was missing in source report)' : '';
        sections.push(
          `According to your lab report from ${resultSummary.reportDate}, your ${resultSummary.canonicalTestName} (${resultSummary.rawTestName}) was ${resultSummary.value} ${resultSummary.unit || ''} (Reference Range: ${resultSummary.referenceRange || 'Not specified'}). This result is ${outStatus}.${critNote}${corrNote}${unitNote}`
        );
      }
    } else if (toolName === 'get_test_history') {
      if (!resultSummary.found) {
        sections.push(resultSummary.message);
      } else {
        const traj = resultSummary.trajectory;
        sections.push(`### Historical Analysis for ${resultSummary.canonicalTestName}:`);
        sections.push(traj.statusSummary);
        if (traj.points && traj.points.length > 0) {
          const pointLines = traj.points.map(p => 
            `- ${p.date}: ${p.rawValue} ${p.unit || ''} [Reference: ${p.refRange || 'N/A'}] - ${p.isOutOfRange ? 'Out of Range' : 'Normal'}${p.isCorrected ? ' (Corrected)' : ''}`
          );
          sections.push(`Recorded Readings:\n${pointLines.join('\n')}`);
        }
      }
    } else if (toolName === 'list_out_of_range_results') {
      if (resultSummary.count === 0) {
        sections.push(`All recorded lab results for ${resultSummary.reportDateFilter} are within their normal reference ranges.`);
      } else {
        sections.push(`Found ${resultSummary.count} result(s) outside normal reference ranges:`);
        const itemLines = resultSummary.results.map(r => 
          `- ${r.canonicalTestName} on ${r.reportDate}: ${r.value} ${r.unit || ''} (Reference Range: ${r.referenceRange || 'N/A'})${r.isCritical ? ' [CRITICAL ALERT]' : ''}`
        );
        sections.push(itemLines.join('\n'));
      }
    } else if (toolName === 'compare_panel_results') {
      if (resultSummary.status === 'INSUFFICIENT_REPORTS') {
        sections.push(resultSummary.message);
      } else {
        sections.push(`### ${resultSummary.panelName} Comparison (${resultSummary.earlierDate} vs ${resultSummary.laterDate}):`);
        const comps = resultSummary.comparisons.map(c => `- ${c.statusSummary}`);
        sections.push(comps.join('\n'));
      }
    } else if (toolName === 'get_transitioned_out_of_range') {
      if (resultSummary.transitionCount === 0) {
        sections.push('No tests transitioned from normal to out-of-range in your recent reports.');
      } else {
        sections.push(`Found ${resultSummary.transitionCount} test(s) that moved outside normal reference ranges:`);
        const transLines = resultSummary.transitions.map(t => 
          `- ${t.testName}: was ${t.previousValue} on ${t.previousDate}, moved to ${t.latestValue} on ${t.latestDate} (Reference Range: ${t.referenceRange})`
        );
        sections.push(transLines.join('\n'));
      }
    }
  }

  return sections.join('\n\n');
}

/**
 * Determine which deterministic tools should be called based on user query intent.
 * Works deterministically for offline mode and prompt evaluation.
 * 
 * @param {string} query 
 * @returns {Array<{ toolName: string, args: object }>}
 */
export function determineToolsForQuery(query) {
  const q = query.toLowerCase();
  const calls = [];

  // 1. Out of range queries
  if (q.includes('out of range') || q.includes('outside') || q.includes('abnormal') || q.includes('high or low')) {
    // Check if query specifies "moved outside" or transition
    if (q.includes('moved') || q.includes('became') || q.includes('shifted')) {
      calls.push({ toolName: 'get_transitioned_out_of_range', args: {} });
    } else {
      // Check if a specific date was mentioned (e.g. 2024-01-15)
      const dateMatch = query.match(/\b20\d{2}-\d{2}-\d{2}\b/);
      calls.push({
        toolName: 'list_out_of_range_results',
        args: dateMatch ? { report_date: dateMatch[0] } : {}
      });
    }
    return calls;
  }

  // 2. Panel comparison queries (e.g. "compare my lipid panel", "compare metabolic panel")
  if (q.includes('lipid') && (q.includes('compare') || q.includes('panel') || q.includes('change'))) {
    calls.push({
      toolName: 'compare_panel_results',
      args: { panel_name: 'Lipid Panel' }
    });
    return calls;
  }

  if ((q.includes('metabolic') || q.includes('cmp')) && (q.includes('compare') || q.includes('panel'))) {
    calls.push({
      toolName: 'compare_panel_results',
      args: { panel_name: 'Comprehensive Metabolic Panel' }
    });
    return calls;
  }

  // 3. Test history / change / trend queries (e.g., "how has my hba1c changed", "history of glucose")
  const isHistoryQuery = q.includes('change') || q.includes('trend') || q.includes('history') ||
    q.includes('across reports') || q.includes('over time') || q.includes('compare');

  const knownBiomarkers = [
    'hdl cholesterol', 'hdl-c', 'hdl',
    'ldl cholesterol', 'ldl-c', 'ldl',
    'total cholesterol', 'cholesterol',
    'fasting blood sugar', 'fasting glucose', 'glucose', 'sugar',
    'glycated hemoglobin', 'hba1c', 'a1c',
    'triglycerides', 'serum creatinine', 'creatinine', 'egfr',
    'potassium', 'sodium', 'hemoglobin', 'platelets', 'tsh', 'alt', 'ast', 'vitamin d'
  ];

  for (const bio of knownBiomarkers) {
    if (q.includes(bio)) {
      const canonical = findCanonicalName(bio) || bio;
      if (isHistoryQuery) {
        calls.push({
          toolName: 'get_test_history',
          args: { test_name: canonical }
        });
      } else {
        calls.push({
          toolName: 'get_latest_result',
          args: { test_name: canonical }
        });
      }
      return calls;
    }
  }

  // 4. Generic test name extraction (e.g. "latest Troponin level", "what was my Ferritin")
  const genericMatch = query.match(/(?:latest|recent|level\s+of|result\s+(?:for|of)|my)\s+([A-Za-z0-9\-\s]{3,25}?)(?:\s+(?:level|test|result|reading|value|count)|[?.,]|$)/i);
  if (genericMatch) {
    const rawExtracted = genericMatch[1].trim();
    if (!['my', 'the', 'any', 'all', 'recent', 'latest'].includes(rawExtracted.toLowerCase())) {
      const canonical = findCanonicalName(rawExtracted) || rawExtracted;
      if (isHistoryQuery) {
        calls.push({ toolName: 'get_test_history', args: { test_name: canonical } });
      } else {
        calls.push({ toolName: 'get_latest_result', args: { test_name: canonical } });
      }
      return calls;
    }
  }

  // Default fallback: Check latest or out-of-range
  calls.push({ toolName: 'list_out_of_range_results', args: {} });
  return calls;
}

/**
 * Universal LLM Interface with multi-provider failover.
 */
export class LLMClient {
  constructor() {
    this.provider = this.resolveProvider();
    this.geminiClient = null;
    this.openaiClient = null;

    if (this.provider === 'gemini' && config.geminiApiKey) {
      this.geminiClient = new GoogleGenerativeAI(config.geminiApiKey);
    } else if (this.provider === 'openai' && config.openaiApiKey) {
      this.openaiClient = new OpenAI({ apiKey: config.openaiApiKey });
    }
  }

  resolveProvider() {
    if (config.llmProvider === 'mock') return 'mock';
    if (config.llmProvider === 'gemini' && config.geminiApiKey) return 'gemini';
    if (config.llmProvider === 'openai' && config.openaiApiKey) return 'openai';

    if (config.geminiApiKey) return 'gemini';
    if (config.openaiApiKey) return 'openai';

    return 'mock';
  }

  /**
   * Generates a grounded response given query and retrieved tool executions.
   * 
   * @param {string} userQuery 
   * @param {Array<object>} toolExecutions 
   * @returns {Promise<string>}
   */
  async generateGroundedResponse(userQuery, toolExecutions) {
    // 1. If provider is mock or no API key is provided, use high-fidelity deterministic engine
    if (this.provider === 'mock' || (!this.geminiClient && !this.openaiClient)) {
      return generateDeterministicGroundedResponse(userQuery, toolExecutions);
    }

    const contextData = toolExecutions.map(exec => 
      `Tool: ${exec.toolName}\nArguments: ${JSON.stringify(exec.arguments)}\nResult: ${JSON.stringify(exec.resultSummary, null, 2)}`
    ).join('\n\n');

    const promptText = `
${SYSTEM_PROMPT}

USER QUERY:
${userQuery}

RETRIEVED FACTUAL TOOL DATA:
${contextData}

Provide a factual, grounded response citing specific test names and report dates. Do not provide medical diagnoses or treatment recommendations.
    `.trim();

    try {
      // 2. Try Gemini
      if (this.provider === 'gemini' && this.geminiClient) {
        const primaryModel = config.geminiModel || 'gemini-3.8-flash';
        const fallbackChain = [primaryModel, 'gemini-3.1-flash-lite', 'gemini-3.5-flash'];
        
        for (const modelCandidate of [...new Set(fallbackChain)]) {
          try {
            const model = this.geminiClient.getGenerativeModel({ model: modelCandidate });
            const fetchPromise = model.generateContent(promptText);
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Remote LLM call timed out after 6000ms')), 6000)
            );
            const result = await Promise.race([fetchPromise, timeoutPromise]);
            return result.response.text();
          } catch (mErr) {
            console.log(`[LLMClient] Model ${modelCandidate} unavailable (${mErr.message.slice(0, 50)}). Trying next candidate...`);
          }
        }
      }

      // 3. Try OpenAI
      if (this.provider === 'openai' && this.openaiClient) {
        const response = await this.openaiClient.chat.completions.create({
          model: config.openaiModel,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: `USER QUERY: ${userQuery}\n\nRETRIEVED DATA:\n${contextData}` }
          ],
          temperature: 0.1
        });
        return response.choices[0].message.content;
      }
    } catch (err) {
      console.warn(`[LLMClient] Remote API call failed (${err.message}). Falling back to deterministic engine.`);
      return generateDeterministicGroundedResponse(userQuery, toolExecutions);
    }

    return generateDeterministicGroundedResponse(userQuery, toolExecutions);
  }
}
