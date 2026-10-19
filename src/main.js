/**
 * main.js
 * Application entry point.
 *
 * Responsibilities:
 *   1. Generate the passenger demand schedule.
 *   2. Create the Simulation with the chosen algorithm.
 *   3. Mount the building visualisation.
 *   4. Wire controls and the render loop.
 *   5. Handle hot-module-reload (Vite) so editing participant.js resets the sim.
 */

import { generateDemand } from './engine/demand.js';
import { Simulation } from './engine/simulation.js';
import { FLOORS, DEFAULT_SEED } from './engine/constants.js';
import { createBuilding } from './ui/building.js';
import {
  wireControls,
  updateClock,
  updateLiveStats,
  updateTelemetry,
  updateEventLog,
  showSimEnded,
  updateRunPauseButtons,
  initAnalyticsUI,
  updateAnalytics,
} from './ui/controls.js';
import { assignElevator as baselineAlgo }    from './algorithms/baseline.js';
import {
  loadParticipantScheduler as loadParticipantSchedulerModule,
  describeParticipant as describeParticipantModule,
} from './algorithms/runtime.js';
import { assignElevator as starterAlgo }     from './algorithms/starter.js';
import { assignElevator as developerAlgo }   from './algorithms/developer.js';
import { ElevatorState } from './engine/elevator.js';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const SEED = DEFAULT_SEED;

let requests = null;   // frozen demand schedule
let sim      = null;   // current Simulation instance
let building = null;   // building renderer handles
let isRunning = false;
let simEnded  = false;

// Speed options: ticks processed per animation frame.
// At ~60fps, 1x ≈ 60 ticks/s = 1 simulation minute/s. 30x ≈ 30 sim-min/s.
const SPEED_OPTIONS = {
  '1':   1,
  '5':   5,
  '30':  30,
  '120': 120,
};

// Kept in an object so hot module replacement can swap in a freshly loaded
// runtime (participant.js is raw text, so its content arrives through here).
let runtimeApi = {
  loadParticipantScheduler: loadParticipantSchedulerModule,
  describeParticipant: describeParticipantModule,
};

// Participant source is loaded at runtime (JavaScript or Python), so this
// starts as a safe fallback until the runtime reports in.
let currentParticipantAlgo = () => 0;
let participantInfo = runtimeApi.describeParticipant();

// Every selectable algorithm, keyed by the <option> value in index.html.
// Each `get` returns the scheduler function itself; labels may be functions so
// the participant entry can show its detected language.
const ALGORITHMS = {
  participant: { label: () => `Participant (${participantInfo.label})`, get: () => currentParticipantAlgo },
  starter:     { label: 'Starter (Nearest)',    get: () => starterAlgo },
  developer:   { label: 'Developer (Ideal)',    get: () => developerAlgo },
  baseline:    { label: 'Baseline (Protected)', get: () => baselineAlgo },
};

function getSelectedKey() {
  const sel = document.getElementById('sim-algo');
  const key = sel?.value;
  return ALGORITHMS[key] ? key : 'developer';
}

function getActiveAlgo() {
  return ALGORITHMS[getSelectedKey()].get();
}

function getActiveAlgoLabel() {
  const entry = ALGORITHMS[getSelectedKey()];
  return typeof entry.label === 'function' ? entry.label() : entry.label;
}

function getSpeed() {
  const sel = document.getElementById('sim-speed');
  return SPEED_OPTIONS[sel?.value] ?? 30;
}

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

let lastAnalyticsTime = -1;
let initToken = 0;

/**
 * Show how participant.js was interpreted, so the language and any runtime
 * failure are visible instead of a silent fallback.
 */
function setRuntimeStatus({ state, info, error }) {
  const label = info?.label ?? 'JavaScript';

  const option = document.querySelector('#sim-algo option[value="participant"]');
  if (option) option.textContent = `Participant (${label})`;

  const el = document.getElementById('runtime-status');
  if (!el) return;

  el.classList.remove('is-ready', 'is-loading', 'is-error');

  if (state === 'loading') {
    el.classList.add('is-loading');
    el.textContent = `${label} detected · starting offline runtime…`;
  } else if (state === 'error') {
    el.classList.add('is-error');
    el.textContent = error ?? 'Participant runtime error';
    console.error('Participant runtime:', error);
  } else {
    el.classList.add('is-ready');
    el.textContent = `${label} detected · offline runtime ready`;
  }
}

async function init() {
  const token = ++initToken;

  // Generate demand once. Same seed → same schedule every time.
  requests = generateDemand(SEED);

  const detected = runtimeApi.describeParticipant();
  setRuntimeStatus({ state: 'loading', info: detected, error: null });

  const { scheduler, info, error } = await runtimeApi.loadParticipantScheduler({
    baseUrl: import.meta.env.BASE_URL,
  });

  // A newer init (e.g. hot reload) superseded this one — drop these results.
  if (token !== initToken) return;

  participantInfo = info;
  currentParticipantAlgo = scheduler;
  setRuntimeStatus({ state: error ? 'error' : 'ready', info, error });

  // Build simulation with selected algorithm.
  sim = new Simulation(requests, getActiveAlgo());
  isRunning = false;
  simEnded  = false;
  lastAnalyticsTime = -1;

  // Mount building.
  const container = document.getElementById('building-mount');
  building = createBuilding(container);

  // Initialize analytics inspector
  initAnalyticsUI(requests, () => updateAnalytics(requests, sim));

  // Render initial state.
  render();
  updateAnalytics(requests, sim);
  showSimEnded(false);
  updateRunPauseButtons(false);
}

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------

/**
 * Push current simulation state to the UI.
 * Called after each batch of ticks.
 */
function render() {
  if (!sim || !building) return;

  updateClock(sim.time);
  updateLiveStats(sim);
  updateTelemetry(sim);
  updateEventLog(sim.events);

  // Throttled analytics refresh (every 5 simulation seconds)
  if (Math.abs(sim.time - lastAnalyticsTime) >= 5) {
    lastAnalyticsTime = sim.time;
    updateAnalytics(requests, sim);
  }

  for (const el of sim.elevators) {
    building.updateElevator(el);
    const doorsOpen = [
      ElevatorState.DOORS_OPENING,
      ElevatorState.BOARDING,
      ElevatorState.DOORS_CLOSING,
    ].includes(el.state);
    building.updateElevatorState(el.id, doorsOpen);
  }

  for (const floor of FLOORS) {
    const waiting = sim.waitingQueues[floor]
      .reduce((sum, req) => sum + req.count, 0);
    building.updateQueue(floor, waiting);
  }
}

/**
 * Main animation frame callback.
 * Processes a batch of simulation ticks, then renders.
 */
function frame() {
  if (!isRunning || !sim) {
    requestAnimationFrame(frame);
    return;
  }

  const ticks = getSpeed();
  for (let i = 0; i < ticks; i++) {
    const running = sim.tick();
    if (!running) {
      isRunning = false;
      simEnded  = true;
      showSimEnded(true);
      updateRunPauseButtons(false);
      break;
    }
  }

  render();
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------
// Control handlers
// ---------------------------------------------------------------------------

function handleRun() {
  if (!sim || simEnded) return;
  isRunning = true;
  updateRunPauseButtons(true);
}

function handlePause() {
  isRunning = false;
  updateRunPauseButtons(false);
}

function handleReset() {
  if (!requests) return;
  isRunning = false;
  simEnded  = false;
  lastAnalyticsTime = -1;

  // Fresh simulation run with the currently selected algorithm
  sim = new Simulation(requests, getActiveAlgo());
  updateRunPauseButtons(false);
  showSimEnded(false);
  render();
  updateAnalytics(requests, sim);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

document.getElementById('sim-algo')?.addEventListener('change', handleReset);

wireControls({
  onRun:             handleRun,
  onPause:           handlePause,
  onReset:           handleReset,
  baselineFn:        baselineAlgo,
  getParticipantFn:  getActiveAlgo,
  getParticipantLabel: getActiveAlgoLabel,
  seed:              SEED,
});

requestAnimationFrame(frame);
init();

// Vite HMR: participant.js is imported as raw text by runtime.js, so editing
// it (even into another language) rebuilds the scheduler and resets the UI.
if (import.meta.hot) {
  import.meta.hot.accept('./algorithms/runtime.js', (next) => {
    if (next) {
      runtimeApi = {
        loadParticipantScheduler: next.loadParticipantScheduler,
        describeParticipant: next.describeParticipant,
      };
    }
    init();
  });
}
