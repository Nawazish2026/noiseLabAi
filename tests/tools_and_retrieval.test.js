import test from 'node:test';
import assert from 'node:assert/strict';
import { connectDB, disconnectDB } from '../src/db/connection.js';
import {
  get_latest_result,
  get_test_history,
  list_out_of_range_results,
  compare_panel_results
} from '../src/tools/toolRegistry.js';
import { determineToolsForQuery } from '../src/agent/llmProvider.js';
import { AuditLog } from '../src/db/models/AuditLog.js';

test('Tool 1: get_latest_result retrieves most recent chronological assay', async () => {
  await connectDB();

  // Test retrieval using alias "a1c"
  const res = await get_latest_result({ test_name: 'a1c', patient_id: 'patient_001' });
  assert.equal(res.found, true);
  assert.equal(res.canonicalTestName, 'HbA1c');
  assert.equal(res.reportDate, '2024-11-10');
  assert.equal(res.value, '5.7');
  assert.equal(res.unit, '%');

  await disconnectDB();
});

test('Tool 2: get_test_history returns full chronological history with delta math', async () => {
  await connectDB();

  const res = await get_test_history({ test_name: 'HbA1c', patient_id: 'patient_001' });
  assert.equal(res.found, true);
  assert.equal(res.totalRecords, 3);
  assert.equal(res.trajectory.points.length, 3);
  assert.equal(res.trajectory.absoluteDelta, -1.1);
  assert.equal(res.trajectory.trendDirection, 'DECREASED');

  await disconnectDB();
});

test('Tool 3: list_out_of_range_results filters abnormal assays', async () => {
  await connectDB();

  // Filter for baseline date 2024-01-15 (HbA1c, Glucose, Total Cholesterol, LDL, Triglycerides were high)
  const res = await list_out_of_range_results({ report_date: '2024-01-15', patient_id: 'patient_001' });
  assert.ok(res.count >= 4);
  const testNames = res.results.map(r => r.canonicalTestName);
  assert.ok(testNames.includes('HbA1c'));
  assert.ok(testNames.includes('Fasting Glucose'));
  assert.ok(testNames.includes('Total Cholesterol'));

  await disconnectDB();
});

test('Tool 4: compare_panel_results compares lipid panel across dates', async () => {
  await connectDB();

  const res = await compare_panel_results({ panel_name: 'Lipid Panel', patient_id: 'patient_001' });
  assert.equal(res.panelName, 'Lipid Panel');
  assert.ok(res.comparisons.length > 0);

  await disconnectDB();
});

test('Tool Planning: selects correct tool based on user query intent', () => {
  const t1 = determineToolsForQuery('What was my latest HbA1c result?');
  assert.equal(t1[0].toolName, 'get_latest_result');
  assert.equal(t1[0].args.test_name, 'HbA1c');

  const t2 = determineToolsForQuery('How has my fasting blood sugar changed over time?');
  assert.equal(t2[0].toolName, 'get_test_history');
  assert.equal(t2[0].args.test_name, 'Fasting Glucose');

  const t3 = determineToolsForQuery('Which results were out of range on 2024-01-15?');
  assert.equal(t3[0].toolName, 'list_out_of_range_results');
  assert.equal(t3[0].args.report_date, '2024-01-15');

  const t4 = determineToolsForQuery('Compare my latest lipid panel with the previous one');
  assert.equal(t4[0].toolName, 'compare_panel_results');
});
