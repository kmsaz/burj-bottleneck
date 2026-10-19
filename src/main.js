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
import { assignElevator as participantAlgo } from './algorithms/participant.js';
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

let currentParticipantAlgo = participantAlgo;

function getActiveAlgo() {
  const sel = document.getElementById('sim-algo');
  return sel?.value === 'baseline' ? baselineAlgo : currentParticipantAlgo;
}

function getSpeed() {
  const sel = document.getElementById('sim-speed');
  return SPEED_OPTIONS[sel?.value] ?? 30;
}

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

let lastAnalyticsTime = -1;

function init() {
  // Generate demand once. Same seed → same schedule every time.
  requests = generateDemand(SEED);

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

  // Switch active algorithm cleanly on selection change
  document.getElementById('sim-algo')?.addEventListener('change', handleReset);
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
  if (!isRunning) {
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
  if (simEnded) return;
  isRunning = true;
  updateRunPauseButtons(true);
}

function handlePause() {
  isRunning = false;
  updateRunPauseButtons(false);
}

function handleReset() {
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

init();
requestAnimationFrame(frame);

wireControls({
  onRun:        handleRun,
  onPause:      handlePause,
  onReset:      handleReset,
  baselineFn:   baselineAlgo,
  participantFn: currentParticipantAlgo,
  seed:         SEED,
});

// Vite HMR: if the participant module is updated, reset the simulation
// so the new code takes effect without a full page reload.
if (import.meta.hot) {
  import.meta.hot.accept('./algorithms/participant.js', (newModule) => {
    if (newModule) {
      currentParticipantAlgo = newModule.assignElevator;
      sim = new Simulation(requests, getActiveAlgo());
      isRunning = false;
      simEnded  = false;
      showSimEnded(false);
      updateRunPauseButtons(false);
      render();
      // Also update the eval button's reference.
      wireControls({
        onRun:         handleRun,
        onPause:       handlePause,
        onReset:       handleReset,
        baselineFn:    baselineAlgo,
        participantFn: currentParticipantAlgo,
        seed:          SEED,
      });
    }
  });
}
