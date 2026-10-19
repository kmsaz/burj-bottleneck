/**
 * controls.js
 * Wires up the simulation control buttons, speed selector, clock,
 * live stats panel, event log, and evaluation results table.
 */

import { FLOORS } from '../engine/constants.js';
import { compareAlgorithms, METRIC_LABELS, METRIC_DIRECTION, formatMetric } from '../evaluation/evaluate.js';
import { analyzeTimeWindow, TIME_PRESETS, getHourlyDemandDistribution } from '../evaluation/analytics.js';

const METRIC_KEYS = [
  'avgWaitTime',
  'maxWaitTime',
  'completedTrips',
  'avgJourneyTime',
  'stillWaiting',
  'utilisationA',
  'utilisationB',
];

/**
 * Wire all UI controls.
 *
 * @param {Object} opts
 * @param {Function} opts.onRun     () → void  Start the simulation.
 * @param {Function} opts.onPause   () → void  Pause the simulation.
 * @param {Function} opts.onReset   () → void  Reset the simulation.
 * @param {Function} opts.getSpeed  () → number  Current ticks-per-frame multiplier.
 * @param {Function} opts.baselineFn    Baseline algorithm function.
 * @param {Function} opts.participantFn Participant algorithm function.
 * @param {string}   opts.seed      Current seed string.
 */
export function wireControls({ onRun, onPause, onReset, baselineFn, participantFn, seed }) {
  document.getElementById('btn-run').addEventListener('click', onRun);
  document.getElementById('btn-pause').addEventListener('click', onPause);
  document.getElementById('btn-reset').addEventListener('click', onReset);

  document.getElementById('btn-eval').addEventListener('click', () => {
    runEvaluation(baselineFn, participantFn, seed);
  });
}

/**
 * Update the simulation clock display.
 * @param {number} simTime  Seconds since midnight.
 */
export function updateClock(simTime) {
  const h = String(Math.floor(simTime / 3600)).padStart(2, '0');
  const m = String(Math.floor((simTime % 3600) / 60)).padStart(2, '0');
  const s = String(Math.floor(simTime % 60)).padStart(2, '0');
  const el = document.getElementById('clock');
  if (el) el.textContent = `${h}:${m}:${s}`;
}

/**
 * Update the live statistics panel.
 * @param {Object} sim  Live Simulation instance.
 */
export function updateLiveStats(sim) {
  setText('stat-waiting',  sim.totalWaiting);
  setText('stat-riding',   sim.totalRiding);
  setText('stat-done',     sim.completed.length);

  const m = sim.getMetrics();
  setText('stat-avg-wait', formatMetric('avgWaitTime', m.avgWaitTime));
}

/**
 * Update live elevator telemetry and schedule timeline.
 * @param {Object} sim  Live Simulation instance.
 */
export function updateTelemetry(sim) {
  if (!sim) return;
  const START_TIME = 7 * 3600;
  const END_TIME   = 22 * 3600;

  // Timeline progress
  const timeBar = document.getElementById('timeline-bar');
  if (timeBar) {
    const pct = Math.min(100, Math.max(0, ((sim.time - START_TIME) / (END_TIME - START_TIME)) * 100));
    timeBar.style.width = `${pct}%`;
  }

  // Telemetry for Elevator A and B
  const elKeys = ['a', 'b'];
  sim.elevators.forEach((el, idx) => {
    const key = elKeys[idx];
    const statusEl = document.getElementById(`tele-status-${key}`);
    const floorEl  = document.getElementById(`tele-floor-${key}`);
    const targetEl = document.getElementById(`tele-target-${key}`);
    const loadEl   = document.getElementById(`tele-load-${key}`);
    const barEl    = document.getElementById(`tele-bar-${key}`);

    const occ = el.passengers.reduce((sum, p) => sum + p.count, 0);
    const floorLabel = el.floor === -1 ? 'B1' : el.floor === 0 ? 'G' : String(el.floor);
    const targetLabel = el.targetFloor === null ? '—' : el.targetFloor === -1 ? 'B1' : el.targetFloor === 0 ? 'G' : String(el.targetFloor);

    if (statusEl) {
      statusEl.textContent = el.state.replace('_', ' ');
    }
    if (floorEl)  floorEl.textContent = floorLabel;
    if (targetEl) targetEl.textContent = targetLabel;
    if (loadEl)   loadEl.textContent = `${occ} / 10`;
    if (barEl)    barEl.style.width = `${(occ / 10) * 100}%`;
  });
}

/**
 * Append a message to the event log.
 * The log shows the most recent events at the top, capped at 12 lines.
 * @param {string[]} events  Array of event strings from the simulation.
 */
export function updateEventLog(events) {
  const log = document.getElementById('event-log');
  if (!log) return;
  // Show the most recent events (simulation emits oldest first; we want newest first).
  const recent = events.slice(-12).reverse();
  log.innerHTML = recent
    .map(e => `<div class="log-line">${e}</div>`)
    .join('');
}

/**
 * Run headless evaluation and display results.
 */
function runEvaluation(baselineFn, participantFn, seed) {
  const btn = document.getElementById('btn-eval');
  if (btn) { btn.disabled = true; btn.textContent = 'Evaluating…'; }

  // Defer to allow the browser to repaint the disabled state.
  setTimeout(() => {
    try {
      const { baseline, participant } = compareAlgorithms(baselineFn, participantFn, seed);
      displayResults(baseline, participant);
    } catch (err) {
      console.error('Evaluation failed:', err);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Run Evaluation'; }
    }
  }, 0);
}

/**
 * Populate the evaluation results table.
 */
function displayResults(baseline, participant) {
  const table = document.getElementById('eval-results');
  const tbody = document.getElementById('eval-tbody');
  if (!tbody || !table) return;

  tbody.innerHTML = '';

  for (const key of METRIC_KEYS) {
    const bVal = baseline[key];
    const pVal = participant[key];
    const dir  = METRIC_DIRECTION[key];

    const bStr = formatMetric(key, bVal);
    const pStr = formatMetric(key, pVal);

    // Determine if participant is better, worse, or equal.
    let delta = '';
    let deltaClass = '';
    if (typeof pVal === 'number' && typeof bVal === 'number') {
      const diff = (pVal - bVal) * dir;  // positive = improvement
      if (Math.abs(diff) < 0.01) {
        delta = '–';
        deltaClass = 'delta-neutral';
      } else if (diff > 0) {
        delta = '▲ better';
        deltaClass = 'delta-better';
      } else {
        delta = '▼ worse';
        deltaClass = 'delta-worse';
      }
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${METRIC_LABELS[key]}</td>
      <td>${bStr}</td>
      <td>${pStr}</td>
      <td class="${deltaClass}">${delta}</td>
    `;
    tbody.appendChild(tr);
  }

  table.style.display = 'table';
  table.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/**
 * Show or hide the "simulation ended" message.
 */
export function showSimEnded(show) {
  const el = document.getElementById('sim-ended-msg');
  if (el) el.style.display = show ? 'block' : 'none';
}

/**
 * Update Run / Pause button appearance based on running state.
 */
export function updateRunPauseButtons(isRunning) {
  const btnRun   = document.getElementById('btn-run');
  const btnPause = document.getElementById('btn-pause');
  if (btnRun)   btnRun.disabled   = isRunning;
  if (btnPause) btnPause.disabled = !isRunning;
}

// ---------------------------------------------------------------------------
// Demand Patterns & Time-Window Analytics UI
// ---------------------------------------------------------------------------

let currentWindow = { start: 7 * 3600, end: 22 * 3600, activeHour: null };
let cachedRequests = null;
let currentSim = null;

/**
 * Initialize the interactive Hourly Demand Pattern Histogram and Period Selector.
 *
 * @param {readonly Object[]} requests Full frozen demand schedule.
 * @param {Function} [onFilterChange] Optional callback when user changes window.
 */
export function initAnalyticsUI(requests, onFilterChange) {
  cachedRequests = requests;
  const select = document.getElementById('analytics-period-select');
  const histContainer = document.getElementById('hourly-histogram');
  if (!select) return;

  // Populate period dropdown options if empty
  if (select.children.length === 0) {
    TIME_PRESETS.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.label;
      select.appendChild(opt);
    });
    for (let h = 7; h < 22; h++) {
      const opt = document.createElement('option');
      opt.value = `hour-${h}`;
      opt.textContent = `Hour ${String(h).padStart(2, '0')}:00 – ${String(h + 1).padStart(2, '0')}:00`;
      select.appendChild(opt);
    }
  }

  // Render 15-bar hourly interactive distribution histogram
  if (histContainer && requests && requests.length > 0) {
    const buckets = getHourlyDemandDistribution(requests);
    const maxPax = Math.max(...buckets.map(b => b.passengers), 1);

    histContainer.innerHTML = buckets.map(b => {
      const pct = Math.round((b.passengers / maxPax) * 100);
      return `
        <div class="hist-col" data-hour="${b.hour}" title="${b.label}: ${b.passengers} passengers (${b.requests} requests)">
          <div class="hist-count">${b.passengers}</div>
          <div class="hist-bar-wrap">
            <div class="hist-bar" style="height: ${Math.max(pct, 8)}%;"></div>
          </div>
          <span class="hist-label">${String(b.hour).padStart(2, '0')}</span>
        </div>
      `;
    }).join('');

    // Clicking an individual hour bar selects that hour directly
    histContainer.querySelectorAll('.hist-col').forEach(col => {
      col.addEventListener('click', () => {
        const hour = parseInt(col.getAttribute('data-hour'), 10);
        select.value = `hour-${hour}`;
        handleWindowChange();
      });
    });
  }

  function handleWindowChange() {
    const val = select.value;
    if (val.startsWith('hour-')) {
      const h = parseInt(val.replace('hour-', ''), 10);
      currentWindow = { start: h * 3600, end: (h + 1) * 3600, activeHour: h };
    } else {
      const preset = TIME_PRESETS.find(p => p.id === val) || TIME_PRESETS[0];
      currentWindow = { start: preset.start, end: preset.end, activeHour: null };
    }

    // Highlight active columns
    if (histContainer) {
      histContainer.querySelectorAll('.hist-col').forEach(col => {
        const hour = parseInt(col.getAttribute('data-hour'), 10);
        const inWindow = (hour * 3600 >= currentWindow.start) && ((hour + 1) * 3600 <= currentWindow.end);
        col.classList.toggle('active', inWindow);
      });
    }

    if (onFilterChange) onFilterChange();
    if (cachedRequests) {
      updateAnalytics(cachedRequests, currentSim);
    }
  }

  select.addEventListener('change', handleWindowChange);
  handleWindowChange();
}

/**
 * Update the Demand Pattern & Period Analytics panel with live or static metrics.
 *
 * @param {readonly Object[]} requests Full demand schedule.
 * @param {Object} [sim] Active Simulation instance.
 */
export function updateAnalytics(requests, sim) {
  cachedRequests = requests;
  currentSim = sim;
  if (!requests) return;

  const res = analyzeTimeWindow(requests, sim, currentWindow.start, currentWindow.end);

  setText('analytics-pax', `${res.totalPassengers} pax · ${res.windowRequestsCount} reqs`);
  setText('analytics-origin', `${res.busiestOrigin.label} (${res.busiestOrigin.passengers} pax) · ${res.busiestOrigin.name || 'Floor'}`);
  setText('analytics-dest', `${res.busiestDest.label} (${res.busiestDest.passengers} pax) · ${res.busiestDest.name || 'Floor'}`);
  setText('analytics-wait', `Avg: ${Math.round(res.avgWaitTime)}s · Max: ${Math.round(res.maxWaitTime)}s`);

  setText('analytics-split-a', `Car A: ${res.workload.pctA}% (${res.workload.assignedA})`);
  setText('analytics-split-b', `Car B: ${res.workload.pctB}% (${res.workload.assignedB})`);

  const barA = document.getElementById('analytics-bar-a');
  if (barA) {
    barA.style.width = `${res.workload.pctA}%`;
  }
}

// Utility
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(value);
}

