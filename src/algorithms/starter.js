/**
 * starter.js — editable starting point.
 *
 * A working, deliberately simple strategy: send whichever car is closest to
 * the requesting floor, penalise cars that are already full, and nudge the
 * score by how many pickups are already queued so work spreads across the two
 * cars. It matches the protected baseline's behaviour, so it is the "par"
 * benchmark to improve on.
 *
 * Copy ideas from here into participant.js — this file exists so you always
 * have a known-good implementation to compare against or fall back to.
 */

/**
 * Assign an elevator to handle a new passenger request.
 *
 * @param {Object}   request        { origin, dest, count }
 * @param {Object[]} elevators      Read-only snapshots of both cars.
 * @param {number}   currentTime    Simulation seconds since midnight.
 * @returns {number} 0 for Elevator A, 1 for Elevator B.
 */
export function assignElevator(request, elevators, currentTime) {
  if (!Array.isArray(elevators) || elevators.length === 0) {
    return 0;
  }

  const origin = Number.isFinite(request?.origin) ? request.origin : 0;

  let bestId = 0;
  let bestScore = Infinity;

  for (const el of elevators) {
    const floor = Number.isFinite(el?.floor) ? el.floor : 0;
    const occupancy = Number.isFinite(el?.occupancy) ? el.occupancy : 0;
    const capacity = Number.isFinite(el?.capacity) ? el.capacity : 10;
    const queued = Number.isFinite(el?.assignmentCount) ? el.assignmentCount : 0;

    // Distance is the dominant term: closer cars arrive sooner.
    let score = Math.abs(floor - origin);

    // A full car cannot pick anyone up, so heavily discourage sending it.
    if (occupancy >= capacity) score += 50;

    // Spread load across the two cars so one car does not become a queue.
    score += queued * 2;

    const id = Number.isFinite(el?.id) ? el.id : 0;
    if (score < bestScore) {
      bestScore = score;
      bestId = id;
    }
  }

  return bestId === 1 ? 1 : 0;
}
