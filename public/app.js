/**
 * noiseLab.ai Web Client Application Logic
 * 
 * Handles multi-tab navigation, report ingestion, user corrections,
 * interactive grounded chat, SVG longitudinal graphing, and audit logging.
 */

const API_BASE = '/api';
const CURRENT_PATIENT = 'patient_001';

// DOM Elements
const navTabs = document.querySelectorAll('.nav-tab');
const tabPanels = document.querySelectorAll('.tab-panel');
const btnSeedSamples = document.getElementById('btnSeedSamples');
const dropzone = document.getElementById('dropzone');
const fileUploadInput = document.getElementById('fileUploadInput');
const reportsGrid = document.getElementById('reportsGrid');
const countReports = document.getElementById('countReports');
const reportGridCount = document.getElementById('reportGridCount');
const testsTableCount = document.getElementById('testsTableCount');
const testsTableBody = document.getElementById('testsTableBody');
const chkOnlyAbnormal = document.getElementById('chkOnlyAbnormal');

// Chat DOM
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
const chatMessages = document.getElementById('chatMessages');
const promptChips = document.querySelectorAll('.chip');

// Trends DOM
const trendTestSelect = document.getElementById('trendTestSelect');
const statBaseline = document.getElementById('statBaseline');
const statBaselineDate = document.getElementById('statBaselineDate');
const statLatest = document.getElementById('statLatest');
const statLatestDate = document.getElementById('statLatestDate');
const statDelta = document.getElementById('statDelta');
const statPct = document.getElementById('statPct');
const statDirection = document.getElementById('statDirection');
const trendSvg = document.getElementById('trendSvg');

// Audit DOM
const btnRefreshAudit = document.getElementById('btnRefreshAudit');
const auditTableBody = document.getElementById('auditTableBody');

// Correction Modal DOM
const correctionModal = document.getElementById('correctionModal');
const btnCloseModal = document.getElementById('btnCloseModal');
const btnCancelModal = document.getElementById('btnCancelModal');
const correctionForm = document.getElementById('correctionForm');
const modalTestId = document.getElementById('modalTestId');
const modalTestName = document.getElementById('modalTestName');
const modalReportDate = document.getElementById('modalReportDate');
const modalCorrectedValue = document.getElementById('modalCorrectedValue');
const modalCorrectedUnit = document.getElementById('modalCorrectedUnit');
const modalCorrectedRange = document.getElementById('modalCorrectedRange');
const modalReason = document.getElementById('modalReason');

// Raw Text Modal DOM
const rawTextModal = document.getElementById('rawTextModal');
const btnCloseRawModal = document.getElementById('btnCloseRawModal');
const rawTextTitle = document.getElementById('rawTextTitle');
const rawTextContent = document.getElementById('rawTextContent');

// 1. Tab Navigation
navTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    navTabs.forEach(t => t.classList.remove('active'));
    tabPanels.forEach(p => p.classList.remove('active'));

    tab.classList.add('active');
    const targetId = tab.dataset.tab;
    document.getElementById(targetId).classList.add('active');

    if (targetId === 'tab-vault') {
      loadReports();
      loadTests();
    } else if (targetId === 'tab-trends') {
      loadTrendData(trendTestSelect.value);
    } else if (targetId === 'tab-audit') {
      loadAuditLogs();
    }
  });
});

// 2. Sample Data Seeding
btnSeedSamples.addEventListener('click', async () => {
  btnSeedSamples.disabled = true;
  btnSeedSamples.innerHTML = `<span>Loading...</span>`;
  try {
    const res = await fetch(`${API_BASE}/seed-samples`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patientId: CURRENT_PATIENT })
    });
    const data = await res.json();
    if (data.success) {
      alert('5 Sample Reports successfully loaded into MongoDB!');
      loadReports();
      loadTests();
      loadTrendData(trendTestSelect.value);
    }
  } catch (err) {
    alert(`Failed to load samples: ${err.message}`);
  } finally {
    btnSeedSamples.disabled = false;
    btnSeedSamples.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      Load 5 Sample Reports
    `;
  }
});

// 3. File Upload (PDF/Image)
dropzone.addEventListener('click', () => fileUploadInput.click());
dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.style.borderColor = 'var(--accent-cyan)';
});
dropzone.addEventListener('dragleave', () => {
  dropzone.style.borderColor = '';
});
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.style.borderColor = '';
  if (e.dataTransfer.files.length > 0) {
    handleFileUpload(e.dataTransfer.files[0]);
  }
});
fileUploadInput.addEventListener('change', () => {
  if (fileUploadInput.files.length > 0) {
    handleFileUpload(fileUploadInput.files[0]);
  }
});

async function handleFileUpload(file) {
  const formData = new FormData();
  formData.append('report', file);
  formData.append('patientId', CURRENT_PATIENT);

  const prevText = dropzone.innerHTML;
  dropzone.innerHTML = `<p style="color:var(--accent-cyan);">Ingesting and extracting "${file.name}"...</p>`;

  try {
    const res = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.success) {
      alert(`Report ingested! Extracted ${data.tests.length} structured tests.`);
      loadReports();
      loadTests();
    } else {
      alert(`Upload error: ${data.error}`);
    }
  } catch (err) {
    alert(`Upload network error: ${err.message}`);
  } finally {
    dropzone.innerHTML = prevText;
    fileUploadInput.value = '';
  }
}

// 4. Load Reports & Grid
async function loadReports() {
  try {
    const res = await fetch(`${API_BASE}/reports?patientId=${CURRENT_PATIENT}`);
    const data = await res.json();
    if (!data.success) return;

    countReports.textContent = data.count;
    reportGridCount.textContent = data.count;

    if (data.reports.length === 0) {
      reportsGrid.innerHTML = `<p style="grid-column: 1/-1; color: var(--text-muted); text-align: center; padding: 20px;">No reports ingested yet.</p>`;
      return;
    }

    reportsGrid.innerHTML = data.reports.map(r => `
      <div class="report-item-card">
        <div class="report-card-top">
          <span class="report-date">${r.reportDate}</span>
          <span class="report-badge-pdf">${r.fileType.toUpperCase()}</span>
        </div>
        <div class="report-meta-text">
          <div><strong>Filename:</strong> ${r.filename}</div>
          <div><strong>Tests Parsed:</strong> ${r.testCount}</div>
          ${r.adversarialPromptDetected ? '<div style="color:var(--accent-purple); font-weight:700;">🛡️ Adversarial Injection Blocked</div>' : ''}
        </div>
        <button class="btn btn-secondary" style="padding: 6px 10px; font-size: 0.76rem;" onclick="viewRawText('${r.reportId}', '${r.filename}')">
          View Raw Report Text
        </button>
      </div>
    `).join('');
  } catch (err) {
    console.error('Error loading reports:', err);
  }
}

// 5. Load Structured Tests Table
async function loadTests() {
  const onlyAbnormal = chkOnlyAbnormal.checked;
  const url = `${API_BASE}/tests?patientId=${CURRENT_PATIENT}${onlyAbnormal ? '&isOutOfRange=true' : ''}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!data.success) return;

    testsTableCount.textContent = data.count;

    if (data.tests.length === 0) {
      testsTableBody.innerHTML = `<tr><td colspan="9" class="empty-cell">No matching tests found.</td></tr>`;
      return;
    }

    testsTableBody.innerHTML = data.tests.map(t => {
      let flagBadge = '<span class="badge-flag flag-normal">Normal</span>';
      if (t.isCritical) {
        flagBadge = '<span class="badge-flag flag-crit">CRITICAL ALERT</span>';
      } else if (t.isOutOfRange) {
        flagBadge = '<span class="badge-flag flag-high">Out of Range</span>';
      }

      let qualityBadge = `<span style="font-size:0.75rem; color:var(--text-secondary);">${t.qualityFlag}</span>`;
      if (t.isCorrected) {
        qualityBadge = `<span class="badge-flag flag-corr">USER CORRECTED</span>`;
      }

      return `
        <tr>
          <td><strong>${t.reportDate}</strong></td>
          <td><span style="color:var(--accent-cyan); font-weight:600;">${t.canonicalTestName}</span></td>
          <td style="color:var(--text-secondary); font-size:0.8rem;">${t.rawTestName}</td>
          <td><strong style="font-size:0.95rem;">${t.rawValue}</strong></td>
          <td>${t.unit || '<span style="color:var(--accent-amber);">Missing</span>'}</td>
          <td style="font-family:var(--font-mono); font-size:0.8rem;">${t.referenceRangeRaw || '<span style="color:var(--text-muted);">None</span>'}</td>
          <td>${flagBadge}</td>
          <td>${qualityBadge}</td>
          <td>
            <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.74rem;" onclick="openCorrectionModal('${t.testId}', '${t.canonicalTestName}', '${t.reportDate}', '${t.rawValue}', '${t.unit || ''}', '${t.referenceRangeRaw || ''}')">
              Edit / Correct
            </button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Error loading tests:', err);
  }
}

chkOnlyAbnormal.addEventListener('change', loadTests);

// 6. User Correction Modal Handling
window.openCorrectionModal = function(id, name, date, val, unit, range) {
  modalTestId.value = id;
  modalTestName.value = name;
  modalReportDate.value = date;
  modalCorrectedValue.value = val;
  modalCorrectedUnit.value = unit;
  modalCorrectedRange.value = range;
  modalReason.value = 'User clinical verification';
  correctionModal.classList.add('open');
};

btnCloseModal.addEventListener('click', () => correctionModal.classList.remove('open'));
btnCancelModal.addEventListener('click', () => correctionModal.classList.remove('open'));

correctionForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const testId = modalTestId.value;
  const payload = {
    correctedValue: parseFloat(modalCorrectedValue.value),
    correctedUnit: modalCorrectedUnit.value.trim() || null,
    correctedReferenceRange: modalCorrectedRange.value.trim() || null,
    reason: modalReason.value.trim()
  };

  try {
    const res = await fetch(`${API_BASE}/tests/${testId}/correct`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      alert(data.message);
      correctionModal.classList.remove('open');
      loadTests();
      loadTrendData(trendTestSelect.value);
    } else {
      alert(`Correction failed: ${data.error}`);
    }
  } catch (err) {
    alert(`Network error: ${err.message}`);
  }
});

// 7. View Raw Text Modal
window.viewRawText = async function(reportId, filename) {
  try {
    const res = await fetch(`${API_BASE}/reports/${reportId}`);
    const data = await res.json();
    if (data.success) {
      rawTextTitle.textContent = `Raw Extracted Text • ${filename}`;
      rawTextContent.textContent = data.report.rawText;
      rawTextModal.classList.add('open');
    }
  } catch (err) {
    alert('Failed to retrieve raw text: ' + err.message);
  }
};

btnCloseRawModal.addEventListener('click', () => rawTextModal.classList.remove('open'));

// 8. Grounded Chat Interface
chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  submitQuery(text);
});

promptChips.forEach(chip => {
  chip.addEventListener('click', () => {
    const query = chip.dataset.query;
    chatInput.value = query;
    submitQuery(query);
  });
});

async function submitQuery(queryText) {
  // Append User Bubble
  appendUserMessage(queryText);
  chatInput.value = '';

  // Append Loading Agent Bubble
  const loadingBubble = appendLoadingMessage();

  try {
    const res = await fetch(`${API_BASE}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: queryText, patientId: CURRENT_PATIENT })
    });
    const data = await res.json();
    loadingBubble.remove();

    if (data.success) {
      appendAgentResponse(data);
    } else {
      appendErrorMessage(data.error || 'Server error occurred.');
    }
  } catch (err) {
    loadingBubble.remove();
    appendErrorMessage(`Network failure: ${err.message}`);
  }
}

function appendUserMessage(text) {
  const div = document.createElement('div');
  div.className = 'message user-message';
  div.innerHTML = `
    <div class="message-header">
      <strong>You</strong>
      <span class="message-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
    </div>
    <div class="message-body"><p>${escapeHtml(text)}</p></div>
  `;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendLoadingMessage() {
  const div = document.createElement('div');
  div.className = 'message agent-message';
  div.innerHTML = `
    <div class="message-header">
      <span class="agent-avatar">nL</span>
      <strong>noiseLab.ai Agent</strong>
      <span class="message-time">Evaluating tools...</span>
    </div>
    <div class="message-body"><p style="color:var(--text-secondary); font-style:italic;">Querying deterministic lab verification tools...</p></div>
  `;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return div;
}

function appendAgentResponse(data) {
  const div = document.createElement('div');
  div.className = 'message agent-message';

  let toolHtml = '';
  if (data.toolsCalled && data.toolsCalled.length > 0) {
    toolHtml = data.toolsCalled.map(t => `
      <div class="tool-callout">
        <div class="tool-callout-header">
          <span>⚙️ Deterministic Tool:</span>
          <span class="tool-badge">${t.toolName}</span>
          <span class="tool-latency">${t.executionTimeMs}ms</span>
        </div>
        <div class="tool-args">Args: ${escapeHtml(JSON.stringify(t.arguments))}</div>
      </div>
    `).join('');
  }

  let sourcesHtml = '';
  if (data.sources && data.sources.length > 0) {
    sourcesHtml = `
      <div class="sources-bar">
        <span>Verified Citations:</span>
        ${data.sources.map(s => `<span class="source-pill">${s.testName} (${s.reportDate})</span>`).join('')}
      </div>
    `;
  }

  let safetyAlertHtml = '';
  if (data.safetyTriggered && data.safetyMessage) {
    safetyAlertHtml = `<div class="alert-callout-crit">⚠️ ${escapeHtml(data.safetyMessage)}</div>`;
  }

  div.innerHTML = `
    <div class="message-header">
      <span class="agent-avatar">nL</span>
      <strong>noiseLab.ai Agent</strong>
      <span class="message-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
    </div>
    <div class="message-body">
      ${safetyAlertHtml}
      ${toolHtml}
      <div style="margin: 10px 0; white-space: pre-wrap;">${escapeHtml(data.answer)}</div>
      ${sourcesHtml}
      <div style="font-size:0.68rem; color:var(--text-muted); margin-top:8px;">
        Audit ID: ${data.auditId} • ${data.disclaimer}
      </div>
    </div>
  `;

  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendErrorMessage(errText) {
  const div = document.createElement('div');
  div.className = 'message agent-message';
  div.innerHTML = `
    <div class="message-header"><span class="agent-avatar">nL</span><strong>noiseLab.ai Agent</strong></div>
    <div class="message-body" style="color:var(--accent-rose);"><p>Error: ${escapeHtml(errText)}</p></div>
  `;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 9. Longitudinal Trends & SVG Graph
trendTestSelect.addEventListener('change', () => loadTrendData(trendTestSelect.value));

async function loadTrendData(testName) {
  try {
    const res = await fetch(`${API_BASE}/analytics/trajectory/${encodeURIComponent(testName)}?patientId=${CURRENT_PATIENT}`);
    const data = await res.json();
    if (!data.success) return;

    const traj = data.trajectory;
    statBaseline.textContent = traj.baselineValue !== undefined ? `${traj.baselineValue} ${traj.unit || ''}` : '--';
    statBaselineDate.textContent = traj.firstDate || 'No baseline';
    statLatest.textContent = traj.latestValue !== undefined ? `${traj.latestValue} ${traj.unit || ''}` : '--';
    statLatestDate.textContent = traj.latestDate || 'No latest';
    statDelta.textContent = traj.absoluteDelta !== null && traj.absoluteDelta !== undefined ? `${traj.absoluteDelta > 0 ? '+' : ''}${traj.absoluteDelta} ${traj.unit || ''}` : '--';
    statPct.textContent = traj.percentageDelta !== null && traj.percentageDelta !== undefined ? `${traj.percentageDelta > 0 ? '+' : ''}${traj.percentageDelta}%` : '--';
    statDirection.textContent = traj.trendDirection || 'UNKNOWN';

    renderSvgTrajectory(traj.points || [], traj.unit || '');
  } catch (err) {
    console.error('Error loading trajectory:', err);
  }
}

function renderSvgTrajectory(points, unit) {
  if (!points || points.length === 0) {
    trendSvg.innerHTML = `<text x="50%" y="50%" fill="#64748b" text-anchor="middle" font-size="14">No data points available for this biomarker.</text>`;
    return;
  }

  const width = trendSvg.clientWidth || 700;
  const height = 280;
  const padding = 50;

  const values = points.map(p => p.value).filter(v => v !== null && !isNaN(v));
  if (values.length === 0) {
    trendSvg.innerHTML = `<text x="50%" y="50%" fill="#64748b" text-anchor="middle" font-size="14">Non-numeric test values cannot be plotted.</text>`;
    return;
  }

  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = (maxVal - minVal) || (maxVal * 0.2) || 1;
  const yMin = Math.max(0, minVal - range * 0.2);
  const yMax = maxVal + range * 0.2;

  const getX = (idx) => {
    if (points.length === 1) return width / 2;
    return padding + (idx / (points.length - 1)) * (width - padding * 2);
  };

  const getY = (val) => {
    return height - padding - ((val - yMin) / (yMax - yMin)) * (height - padding * 2);
  };

  // Build Path Line
  let pathD = '';
  points.forEach((p, idx) => {
    const x = getX(idx);
    const y = getY(p.value);
    if (idx === 0) pathD += `M ${x} ${y}`;
    else pathD += ` L ${x} ${y}`;
  });

  // Build SVG content
  let svgContent = `
    <!-- Grid lines -->
    <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="#334155" stroke-width="1" />
    <line x1="${padding}" y1="${padding}" x2="${width - padding}" y2="${padding}" stroke="#1e293b" stroke-dasharray="4" />
    <path d="${pathD}" fill="none" stroke="#06b6d4" stroke-width="3" stroke-linecap="round" />
  `;

  // Draw points and labels
  points.forEach((p, idx) => {
    const x = getX(idx);
    const y = getY(p.value);
    let dotColor = '#10b981';
    if (p.isCorrected) dotColor = '#8b5cf6';
    else if (p.isOutOfRange) dotColor = '#f43f5e';

    svgContent += `
      <circle cx="${x}" cy="${y}" r="6" fill="${dotColor}" stroke="#0a0f1d" stroke-width="2" />
      <text x="${x}" y="${y - 12}" fill="#f8fafc" font-size="12" font-weight="700" text-anchor="middle">${p.value} ${unit}</text>
      <text x="${x}" y="${height - padding + 20}" fill="#94a3b8" font-size="11" text-anchor="middle">${p.date}</text>
    `;
  });

  trendSvg.innerHTML = svgContent;
}

// 10. Audit Logs Loader
btnRefreshAudit.addEventListener('click', loadAuditLogs);

async function loadAuditLogs() {
  try {
    const res = await fetch(`${API_BASE}/audit-logs?limit=30`);
    const data = await res.json();
    if (!data.success) return;

    if (data.logs.length === 0) {
      auditTableBody.innerHTML = `<tr><td colspan="7" class="empty-cell">No audit trails recorded yet.</td></tr>`;
      return;
    }

    auditTableBody.innerHTML = data.logs.map(log => {
      const toolsStr = log.selectedTools.map(t => `<span class="tool-badge">${t.toolName} (${t.executionTimeMs}ms)</span>`).join(' ');
      const latencySum = log.selectedTools.reduce((acc, t) => acc + (t.executionTimeMs || 0), 0);
      const sourcesStr = log.sourcesCited.map(s => `${s.testName}@${s.reportDate}`).join(', ') || 'None';

      let safetyBadge = '<span style="color:var(--accent-emerald);">Passed</span>';
      if (log.adversarialAttackBlocked) {
        safetyBadge = '<span class="badge-flag flag-crit">ATTACK BLOCKED</span>';
      } else if (log.safetyGuardTriggered) {
        safetyBadge = '<span class="badge-flag flag-high">GUARD TRIGGERED</span>';
      }

      return `
        <tr>
          <td style="font-size:0.75rem; color:var(--text-secondary);">${new Date(log.createdAt).toLocaleTimeString()}</td>
          <td><strong>${escapeHtml(log.userQuery)}</strong></td>
          <td>${toolsStr || '<span style="color:var(--text-muted);">Direct Guard</span>'}</td>
          <td>${latencySum.toFixed(1)}ms</td>
          <td style="font-size:0.75rem; color:var(--text-secondary);">${escapeHtml(sourcesStr)}</td>
          <td>${safetyBadge}</td>
          <td>
            <button class="btn btn-secondary" style="padding: 3px 6px; font-size: 0.72rem;" onclick="alert('AUDIT LOG: ${log.auditId}\\n\\nQuery: ${escapeHtml(log.userQuery)}\\n\\nResponse: ${escapeHtml(log.finalResponse.slice(0, 300))}...')">
              Inspect
            </button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Error loading audit logs:', err);
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Initial Data Fetch
loadReports();
loadTests();
loadTrendData('HbA1c');
