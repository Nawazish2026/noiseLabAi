import test from 'node:test';
import assert from 'node:assert/strict';
import { connectDB, disconnectDB } from '../src/db/connection.js';
import { AgentOrchestrator } from '../src/agent/orchestrator.js';

test('Grounded Q&A: cites relevant test name and report date in factual answer', async () => {
  await connectDB();
  const orchestrator = new AgentOrchestrator();

  const response = await orchestrator.processQuery('What was my latest HDL cholesterol reading?');
  assert.equal(response.safetyTriggered, false);
  assert.ok(response.answer.includes('HDL Cholesterol'), 'Must identify test name');
  assert.ok(response.sources.some(s => s.testName === 'HDL Cholesterol'), 'Sources list must identify test');
  assert.ok(response.sources.some(s => s.reportDate), 'Sources list must identify report date');
  assert.ok(response.disclaimer.includes('Informational Notice'), 'Must include safety disclaimer');

  await disconnectDB();
});

test('Grounded Q&A: states uncertainty when queried biomarker does not exist in reports', async () => {
  await connectDB();
  const orchestrator = new AgentOrchestrator();

  const response = await orchestrator.processQuery('What was my latest Troponin level?');
  assert.match(
    response.answer,
    /cannot determine|No record found|no historical records/i,
    'Must explicitly state inability to determine missing assay'
  );

  await disconnectDB();
});
