/**
 * analytics.js
 * Deep performance analytics and hourly demand pattern analyzer.
 *
 * Allows participants to inspect elevator performance, passenger volume,
 * wait times, bottleneck floors, and workload distribution for any selected
 * time period or hour of the day.
 */

import { START_TIME, END_TIME, FLOORS, FLOOR_SHORT, FLOOR_LABELS } from '../engine/constants.js';

/** Predefined time windows for quick pattern inspection. */
export const TIME_PRESETS = [
  { id: 'all',      label: 'All Day (07:00 → 22:00)',      start: 7 * 3600,    end: 22 * 3600 },
  { id: 'morning',  label: 'Morning Rush (07:00 → 09:30)', start: 7 * 3600,    end: 9.5 * 3600 },
  { id: 'midday',   label: 'Midday Traffic (09:30 → 13:00)', start: 9.5 * 3600, end: 13 * 3600 },
  { id: 'medical',  label: 'Medical & Events (10:00 → 16:00)', start: 10 * 3600, end: 16 * 3600 },
  { id: 'evening',  label: 'Evening Rush (17:00 → 19:30)', start: 17 * 3600,   end: 19.5 * 3600 },
  { id: 'night',    label: 'Night Wind-Down (19:30 → 22:00)', start: 19.5 * 3600, end: 22 * 3600 },
];

/**
 * Compute 15 hourly demand buckets (07:00 to 22:00).
 * Returns array of 15 objects: { hour: 7, label: "07:00", passengers: N, requests: M }
 * @param {readonly Object[]} requests
 */
export function getHourlyDemandDistribution(requests) {
  const buckets = [];
  for (let h = 7; h < 22; h++) {
    const tStart = h * 3600;
    const tEnd   = (h + 1) * 3600;
    const hourReqs = requests.filter(r => r.requestTime >= tStart && r.requestTime < tEnd);
    const passengers = hourReqs.reduce((sum, r) => sum + r.count, 0);

    buckets.push({
      hour:       h,
      label:      `${String(h).padStart(2, '0')}:00`,
      passengers,
      requests:   hourReqs.length,
    });
  }
  return buckets;
}

/**
 * Analyze elevator and passenger traffic for a specific time window [tStart, tEnd].
 *
 * @param {readonly Object[]} requests   Full demand schedule.
 * @param {Object}           sim        Active or completed Simulation instance.
 * @param {number}           tStart     Window start in simulation seconds.
 * @param {number}           tEnd       Window end in simulation seconds.
 */
export function analyzeTimeWindow(requests, sim, tStart, tEnd) {
  const windowRequests = requests.filter(r => r.requestTime >= tStart && r.requestTime < tEnd);
  const totalPassengers = windowRequests.reduce((sum, r) => sum + r.count, 0);

  // Origin distribution & Destination distribution
  const originCounts = {};
  const destCounts   = {};
  FLOORS.forEach(f => { originCounts[f] = 0; destCounts[f] = 0; });

  for (const req of windowRequests) {
    originCounts[req.origin] = (originCounts[req.origin] || 0) + req.count;
    destCounts[req.dest]     = (destCounts[req.dest] || 0) + req.count;
  }

  // Find busiest origin and destination
  let busiestOrigin = 0;
  let maxOriginPax  = -1;
  let busiestDest   = 1;
  let maxDestPax    = -1;

  for (const floor of FLOORS) {
    if (originCounts[floor] > maxOriginPax) {
      maxOriginPax  = originCounts[floor];
      busiestOrigin = floor;
    }
    if (destCounts[floor] > maxDestPax) {
      maxDestPax  = destCounts[floor];
      busiestDest = floor;
    }
  }

  // Calculate wait times for requests in this window
  let totalWait = 0;
  let waitCount = 0;
  let maxWait   = 0;

  // Check completed passengers
  const completedMap = new Map();
  if (sim && sim.completed) {
    for (const c of sim.completed) {
      completedMap.set(c.request.id, c.boardTime);
    }
  }

  const cutoff = sim ? sim.time : END_TIME;

  for (const req of windowRequests) {
    const boardTime = completedMap.get(req.id);
    let wait = 0;
    if (boardTime !== undefined) {
      wait = Math.max(0, boardTime - req.requestTime);
    } else {
      // Unboarded yet
      wait = Math.max(0, cutoff - req.requestTime);
    }
    for (let i = 0; i < req.count; i++) {
      totalWait += wait;
      if (wait > maxWait) maxWait = wait;
      waitCount++;
    }
  }

  const avgWait = waitCount > 0 ? totalWait / waitCount : 0;

  // Workload assignment split between Elevator A (id 0) and Elevator B (id 1)
  let assignedA = 0;
  let assignedB = 0;

  if (sim && sim.elevators) {
    const idsInA = new Set(sim.elevators[0].assignments.map(r => r.id));
    const idsInB = new Set(sim.elevators[1].assignments.map(r => r.id));

    // Also check passengers currently on board or completed
    for (const p of sim.elevators[0].passengers) idsInA.add(p.id);
    for (const p of sim.elevators[1].passengers) idsInB.add(p.id);

    for (const req of windowRequests) {
      if (idsInA.has(req.id)) assignedA += req.count;
      else if (idsInB.has(req.id)) assignedB += req.count;
      else {
        // Fallback default
        assignedA += req.count;
      }
    }
  }

  const totalAssigned = assignedA + assignedB;
  const pctA = totalAssigned > 0 ? Math.round((assignedA / totalAssigned) * 100) : 50;
  const pctB = totalAssigned > 0 ? 100 - pctA : 50;

  const originDesc = (FLOOR_LABELS[String(busiestOrigin)] || '').split('·')[1]?.trim() || '';
  const destDesc   = (FLOOR_LABELS[String(busiestDest)] || '').split('·')[1]?.trim() || '';

  return {
    windowRequestsCount: windowRequests.length,
    totalPassengers,
    busiestOrigin: {
      floor: busiestOrigin,
      label: FLOOR_SHORT[String(busiestOrigin)] || String(busiestOrigin),
      name:  originDesc,
      passengers: maxOriginPax > 0 ? maxOriginPax : 0,
    },
    busiestDest: {
      floor: busiestDest,
      label: FLOOR_SHORT[String(busiestDest)] || String(busiestDest),
      name:  destDesc,
      passengers: maxDestPax > 0 ? maxDestPax : 0,
    },
    avgWaitTime: avgWait,
    maxWaitTime: maxWait,
    workload: {
      assignedA,
      assignedB,
      pctA,
      pctB,
    },
  };
}
