/**
 * developer.js — reference (ideal) dispatch algorithm.
 *
 * This is the "ideal situation" implementation: it assigns every request to
 * the car that will physically board that group at the earliest moment, by
 * mirroring the simulation engine's exact service model:
 *
 *   • A car with passengers aboard ALWAYS serves drop-off destinations first,
 *     picking the nearest destination after every stop (no SCAN logic), and
 *     ignores its pickup queue until it is empty.
 *   • A MOVING car is committed to its current target floor; it does not
 *     re-route mid-flight even if a closer pickup appears.
 *   • An empty car serves pending pickups nearest-first, and must fully
 *     deliver each boarded group before returning for the next pickup.
 *   • Every stop costs a full door cycle; a group boards partway into it.
 *   • A stop at a floor also boards any assignment queued for that floor
 *     (drop-offs alight first, so capacity frees up before boarding).
 *
 * The estimator simulates each car's future service sequence (committed leg →
 * passenger delivery chain → pickup queue) and returns the predicted boarding
 * time for the new request. The car with the lower predicted time wins; within
 * a small epsilon the car with the shorter sticky pickup queue wins, which
 * caps the worst-case wait for requests that would otherwise queue behind a
 * long chain of nearer pickups.
 *
 * "Ideal" is bounded by what the engine exposes: per-group passenger counts
 * and pickup destinations are withheld, so those are estimated. It is optimal
 * with respect to the observable snapshot, not provably optimal overall.
 *
 * Use this file as the target to beat. Edit participant.js instead if you are
 * competing — this reference is what a complete solution looks like.
 */

import { TRAVEL_TIME, DOOR_TIME, CAPACITY } from '../engine/constants.js';

/** Seconds for one floor of travel (engine: TRAVEL_TIME). */
const TRAVEL_PER_FLOOR = TRAVEL_TIME;
/** Seconds a car is stopped at a floor: open + board + close (3 × DOOR_TIME). */
const DOOR_STOP = DOOR_TIME * 3;
/** Boarding is recorded one door phase into the stop. */
const BOARD_OFFSET = DOOR_TIME;
/** Remaining door-cycle charged when a car is mid-stop somewhere else. */
const DOOR_REMAINDER = DOOR_TIME * 2;
/** Within this many seconds, prefer the car with the shorter pickup queue. */
const TIE_EPSILON = 8;

/**
 * Expected values for detail the snapshot withholds:
 * - occupancy/destinations count passenger GROUPS, not individuals, so the
 *   aboard load is estimated with the demand generator's average group size.
 * - pending pickups expose only their origin, so the delivery detour a queued
 *   group adds before our pickup is estimated with the average trip length.
 */
const AVG_PAX_PER_GROUP = 1.4;
const AVG_DELIVERY_FLOORS = 3.5;

/**
 * Assign an elevator to handle a new passenger request.
 *
 * @param {Object}   request        { origin, dest, count }
 * @param {Object[]} elevators      Read-only snapshots of both cars.
 * @param {number}   currentTime    Simulation seconds (unused: the engine
 *                                  dispatches each request the moment it arrives).
 * @returns {number} 0 for Elevator A, 1 for Elevator B.
 */
export function assignElevator(request, elevators, currentTime) {
  if (!Array.isArray(elevators) || elevators.length === 0) {
    return 0;
  }

  const origin = Number.isFinite(request?.origin) ? request.origin : 0;
  const count = Math.max(1, Math.floor(request?.count ?? 1));

  let bestId = Number.isFinite(elevators[0]?.id) ? elevators[0].id : 0;
  let bestEta = Infinity;
  let bestQueue = Infinity;

  for (const el of elevators) {
    const id = Number.isFinite(el?.id) ? el.id : 0;
    const { eta, queueDepth } = estimatePickupEta(el, origin, count);

    const clearlyBetter = eta < bestEta - TIE_EPSILON;
    const withinEpsilon = Math.abs(eta - bestEta) <= TIE_EPSILON;
    const balancedBetter =
      withinEpsilon &&
      (queueDepth < bestQueue ||
        (queueDepth === bestQueue && id < bestId));

    if (clearlyBetter || balancedBetter) {
      bestEta = eta;
      bestQueue = queueDepth;
      bestId = id;
    }
  }

  return bestId === 1 ? 1 : 0;
}

/**
 * Predict how many seconds until the given car boards the given group,
 * following the engine's target-selection and timing rules.
 *
 * @returns {{ eta: number, queueDepth: number }}
 */
function estimatePickupEta(el, origin, count) {
  const floor = Number.isFinite(el.floor) ? el.floor : 0;
  const state = typeof el.state === 'string' ? el.state : 'IDLE';
  const targets = Array.isArray(el.destinations)
    ? el.destinations.filter(Number.isFinite)
    : [];
  const queueDepth = Math.max(
    0,
    Math.min(
      Number.isFinite(el.assignmentCount) ? el.assignmentCount : 0,
      targets.length,
    ),
  );

  // destinations = [...passengerDropOffs, ...pendingPickupOrigins]
  const dropoffs = targets.slice(0, targets.length - queueDepth);
  const pickups = targets.slice(targets.length - queueDepth);

  // Snapshot occupancy counts groups; estimate the people aboard.
  let loadEstimate = dropoffs.length * AVG_PAX_PER_GROUP;

  let t = 0;
  let f = floor;

  // --- Phase 0: committed leg / currently open doors -----------------------
  const target = Number.isFinite(el.targetFloor) ? el.targetFloor : null;

  if (state === 'MOVING' && target !== null && target !== f) {
    // The car finishes its current leg before re-choosing any target.
    t += Math.abs(target - f) * TRAVEL_PER_FLOOR;
    f = target;

    const wasDropoff = dropoffs.includes(f);
    loadEstimate = alight(loadEstimate, dropoffs, f);
    removeOne(dropoffs, f);
    t += DOOR_STOP;

    // Passengers alight first; our group boards here if it fits.
    if (origin === f && hasSpace(loadEstimate, count)) {
      return { eta: t - DOOR_STOP + BOARD_OFFSET, queueDepth };
    }
    if (!wasDropoff && pickups.includes(f)) {
      // The committed target was a pickup: it boards, then the engine
      // delivers that group before touching the queue again.
      removeOne(pickups, f);
      t += AVG_DELIVERY_FLOORS * TRAVEL_PER_FLOOR + DOOR_STOP;
    }
  } else if (state !== 'MOVING' && state !== 'IDLE' && origin === f) {
    // The car is mid door-cycle at the requesting floor.
    if (state === 'DOORS_OPENING' && hasSpace(loadEstimate, count)) {
      // Boarding has not happened yet — the group rides this very cycle.
      return { eta: BOARD_OFFSET + DOOR_REMAINDER, queueDepth };
    }
    // Doors already closing: the car misses this cycle and re-chooses after.
    t += DOOR_REMAINDER;
  }

  // --- Phase 1: deliver current passengers (nearest-first, as the engine) --
  while (dropoffs.length > 0) {
    const next = nearest(dropoffs, f);
    t += Math.abs(next - f) * TRAVEL_PER_FLOOR + DOOR_STOP;
    f = next;
    loadEstimate = alight(loadEstimate, dropoffs, f);
    removeOne(dropoffs, f);

    // A stop at our floor lets the group board (drop-offs freed space first).
    if (origin === f && hasSpace(loadEstimate, count)) {
      return { eta: t - DOOR_STOP + BOARD_OFFSET, queueDepth };
    }
  }

  // --- Phase 2: empty car serves the pickup queue, nearest-first, one
  //     full delivery round-trip at a time. -------------------------------
  const queue = [...pickups];
  while (queue.length > 0) {
    const next = nearest(queue, f);
    t += Math.abs(next - f) * TRAVEL_PER_FLOOR + DOOR_STOP;
    f = next;

    if (next === origin) {
      // The car is empty here — capacity is guaranteed.
      return { eta: t - DOOR_STOP + BOARD_OFFSET, queueDepth };
    }

    // A nearer queued group boards first; the engine delivers it entirely
    // (passengers outrank pickups) before returning for our request.
    removeOne(queue, next);
    t += AVG_DELIVERY_FLOORS * TRAVEL_PER_FLOOR + DOOR_STOP;
  }

  // Fallback: only our request remains — direct run from the last floor.
  t += Math.abs(origin - f) * TRAVEL_PER_FLOOR + BOARD_OFFSET;
  return { eta: t, queueDepth };
}

/** Nearest value in a numeric array (ties resolve to the first occurrence). */
function nearest(values, from) {
  let best = null;
  let bestDist = Infinity;
  for (const v of values) {
    const d = Math.abs(v - from);
    if (d < bestDist) {
      bestDist = d;
      best = v;
    }
  }
  return best;
}

/** Remove the first occurrence of a value from an array, if present. */
function removeOne(values, value) {
  const i = values.indexOf(value);
  if (i >= 0) values.splice(i, 1);
}

/** Reduce the estimated aboard load by the groups alighting at a floor. */
function alight(loadEstimate, dropoffs, floor) {
  let leaving = 0;
  for (const d of dropoffs) {
    if (d === floor) leaving++;
  }
  return Math.max(0, loadEstimate - leaving * AVG_PAX_PER_GROUP);
}

/**
 * Whether a group of `count` can board given the estimated load.
 * Half-seat tolerance absorbs the group-size estimation error.
 */
function hasSpace(loadEstimate, count) {
  return loadEstimate + count <= CAPACITY + 0.5;
}
