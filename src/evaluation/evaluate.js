/**
 * evaluate.js
 * Headless evaluation engine.
 *
 * Runs the full 15-hour simulation without rendering, compares baseline and
 * participant algorithms on identical passenger schedules, and returns
 * standardised metrics.
 *
 * Both algorithms receive a frozen copy of the same request array.
 * Fresh Simulation instances are created for each run so no state leaks.
 */

import { Simulation } from '../engine/simulation.js';
import { generateDemand } from '../engine/demand.js';

/**
 * Run one full simulation headlessly and return all six metrics.
 *
 * @param {Function}        schedulerFn  The algorithm function.
 * @param {readonly Object[]} requests  Pre-generated, frozen demand schedule.
 * @returns {Object}  Six metrics (see Simulation.getMetrics() for shape).
 */
export function runEvaluation(schedulerFn, requests) {
  const sim = new Simulation(requests, schedulerFn);
  while (sim.tick()) { /* headless — no rendering */ }
  return sim.getMetrics();
}

/**
 * Compare baseline and participant algorithms on the same demand schedule.
 *
 * @param {Function} baselineFn     Baseline scheduling algorithm.
 * @param {Function} participantFn  Participant scheduling algorithm.
 * @param {string}   seedStr        Seed string for demand generation.
 * @returns {{ requests, baseline, participant }}
 *   - requests:    the shared demand schedule used for both runs
 *   - baseline:    metrics object from the baseline run
 *   - participant: metrics object from the participant run
 */
export function compareAlgorithms(baselineFn, participantFn, seedStr) {
  // Generate the schedule once. Both algorithms use exactly this array.
  const requests = generateDemand(seedStr);

  const baseline    = runEvaluation(baselineFn, requests);
  const participant = runEvaluation(participantFn, requests);

  return { requests, baseline, participant };
}

/**
 * Format a metric value for display.
 *
 * @param {string} key    One of the metric keys.
 * @param {number} value  Raw metric value.
 * @returns {string}      Human-readable string with units.
 */
export function formatMetric(key, value) {
  switch (key) {
    case 'avgWaitTime':
    case 'maxWaitTime':
    case 'avgJourneyTime':
      return formatSeconds(value);
    case 'utilisationA':
    case 'utilisationB':
      return `${(value * 100).toFixed(1)}%`;
    case 'completedTrips':
    case 'stillWaiting':
      return String(Math.round(value));
    default:
      return String(value);
  }
}

function formatSeconds(s) {
  if (s < 60)  return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

/** Human-readable labels for each metric key. */
export const METRIC_LABELS = {
  avgWaitTime:    'Avg Wait Time',
  maxWaitTime:    'Max Wait Time',
  completedTrips: 'Completed Trips',
  avgJourneyTime: 'Avg Journey Time',
  stillWaiting:   'Still Waiting at 22:00',
  utilisationA:   'Elevator A Utilisation',
  utilisationB:   'Elevator B Utilisation',
};

/** Which direction is "better" for each metric (1 = higher is better, -1 = lower is better). */
export const METRIC_DIRECTION = {
  avgWaitTime:    -1,
  maxWaitTime:    -1,
  completedTrips:  1,
  avgJourneyTime: -1,
  stillWaiting:   -1,
  utilisationA:    1,
  utilisationB:    1,
};
