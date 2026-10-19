// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { createBuilding } from '../src/ui/building.js';
import {
  wireControls,
  updateClock,
  updateLiveStats,
  updateEventLog,
  updateRunPauseButtons,
  initAnalyticsUI,
  updateAnalytics,
} from '../src/ui/controls.js';
import { Simulation } from '../src/engine/simulation.js';
import { START_TIME, CAPACITY, FLOORS } from '../src/engine/constants.js';

describe('UI & Interface', () => {
  let container;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="clock">07:00:00</div>
      <div id="building-mount"></div>
      <select id="sim-algo">
        <option value="participant" selected>Participant</option>
        <option value="baseline">Baseline</option>
      </select>
      <button id="btn-run">Run</button>
      <button id="btn-pause">Pause</button>
      <button id="btn-reset">Reset</button>
      <select id="sim-speed">
        <option value="1">1x</option>
        <option value="30" selected>30x</option>
      </select>
      <div id="stat-waiting">0</div>
      <div id="stat-riding">0</div>
      <div id="stat-done">0</div>
      <div id="stat-avg-wait">0s</div>
      <div id="event-log"></div>
      <button id="btn-eval">Run Evaluation</button>
      <table id="eval-results" style="display:none;">
        <tbody id="eval-tbody"></tbody>
      </table>
      <div id="sim-ended-msg" style="display:none;">Simulation finished</div>
      <select id="analytics-period-select"></select>
      <div id="hourly-histogram"></div>
      <div id="analytics-pax"></div>
      <div id="analytics-origin"></div>
      <div id="analytics-dest"></div>
      <div id="analytics-wait"></div>
      <div id="analytics-split-a"></div>
      <div id="analytics-split-b"></div>
      <div id="analytics-bar-a" style="width: 50%;"></div>
    `;
    container = document.getElementById('building-mount');
  });

  it('renders all 12 floors, 2 shafts, and elevator cars in building mount', () => {
    const building = createBuilding(container);
    expect(building).toBeDefined();

    const shaftA = container.querySelector('.shaft-a');
    const shaftB = container.querySelector('.shaft-b');
    expect(shaftA).not.toBeNull();
    expect(shaftB).not.toBeNull();

    // Verify both elevator cars are rendered inside their shafts
    const carA = document.getElementById('elevator-car-0');
    const carB = document.getElementById('elevator-car-1');
    expect(carA).not.toBeNull();
    expect(carB).not.toBeNull();

    // Verify all 12 floor cells are present in each shaft
    const shaftACells = shaftA.querySelectorAll('.shaft-cell');
    expect(shaftACells.length).toBe(12);
  });

  it('updates elevator car visual position according to floor index', () => {
    const building = createBuilding(container);
    const carA = document.getElementById('elevator-car-0');

    // Elevator at ground floor (0)
    building.updateElevator({
      id: 0,
      floor: 0,
      passengers: [{ count: 2 }],
      targetFloor: 5,
    });

    expect(carA.style.top).toMatch(/calc\(\d+(\.\d+)?% \+ 2px\)/);
    const occA = document.getElementById('car-occ-0');
    expect(occA.textContent).toBe('2/10');
    const destA = document.getElementById('car-dest-0');
    expect(destA.textContent).toBe('→ 5');
  });

  it('updates floor passenger queue displays accurately', () => {
    const building = createBuilding(container);

    // Update queue for floor 3 with 4 passengers
    building.updateQueue(3, 4);
    const queueCell = document.getElementById('queue-floor-3');
    expect(queueCell.querySelectorAll('.pax-dot').length).toBe(4);
    expect(queueCell.classList.contains('has-waiting')).toBe(true);

    // Clear queue for floor 3
    building.updateQueue(3, 0);
    expect(queueCell.querySelectorAll('.pax-dot').length).toBe(0);
    expect(queueCell.classList.contains('has-waiting')).toBe(false);
  });

  it('manages run/pause button disabled states appropriately', () => {
    const btnRun = document.getElementById('btn-run');
    const btnPause = document.getElementById('btn-pause');

    updateRunPauseButtons(true); // Running
    expect(btnRun.disabled).toBe(true);
    expect(btnPause.disabled).toBe(false);

    updateRunPauseButtons(false); // Paused / Stopped
    expect(btnRun.disabled).toBe(false);
    expect(btnPause.disabled).toBe(true);
  });

  it('formats simulation clock correctly', () => {
    updateClock(START_TIME); // 07:00:00 (25200s)
    expect(document.getElementById('clock').textContent).toBe('07:00:00');

    updateClock(START_TIME + 3665); // 08:01:05
    expect(document.getElementById('clock').textContent).toBe('08:01:05');
  });

  it('updates live statistics panel reflecting simulation state', () => {
    const mockSim = {
      totalWaiting: 6,
      totalRiding: 4,
      completed: [{}, {}, {}],
      getMetrics: () => ({ avgWaitTime: 42.5 }),
    };

    updateLiveStats(mockSim);

    expect(document.getElementById('stat-waiting').textContent).toBe('6');
    expect(document.getElementById('stat-riding').textContent).toBe('4');
    expect(document.getElementById('stat-done').textContent).toBe('3');
    expect(document.getElementById('stat-avg-wait').textContent).toBe('43s');
  });

  it('displays recent event log entries with capped length', () => {
    const events = [
      'Event 1',
      'Event 2',
      'Event 3',
    ];

    updateEventLog(events);
    const logLines = document.getElementById('event-log').querySelectorAll('.log-line');
    expect(logLines.length).toBe(3);
    // Newest events appear first
    expect(logLines[0].textContent).toBe('Event 3');
  });

  it('populates and handles hourly analytics UI and histogram interactions', () => {
    const mockRequests = [
      { id: 1, origin: 0, dest: 5, requestTime: 7 * 3600 + 100, count: 2 },
      { id: 2, origin: -1, dest: 2, requestTime: 8 * 3600 + 200, count: 3 },
      { id: 3, origin: 5, dest: 0, requestTime: 12 * 3600 + 300, count: 1 },
    ];

    let filterChanged = false;
    initAnalyticsUI(mockRequests, () => { filterChanged = true; });

    const select = document.getElementById('analytics-period-select');
    const hist = document.getElementById('hourly-histogram');

    // Check options populated: presets + 15 hours
    expect(select.options.length).toBeGreaterThanOrEqual(15);

    // Check histogram bars rendered: 15 columns
    const cols = hist.querySelectorAll('.hist-col');
    expect(cols.length).toBe(15);

    // Click on 8am bar
    const col8 = hist.querySelector('.hist-col[data-hour="8"]');
    expect(col8).not.toBeNull();
    col8.click();

    expect(select.value).toBe('hour-8');
    expect(filterChanged).toBe(true);
    expect(col8.classList.contains('active')).toBe(true);

    // Verify analytics values updated
    expect(document.getElementById('analytics-pax').textContent).toContain('3 pax');
    expect(document.getElementById('analytics-origin').textContent).toContain('B1');
  });
});
