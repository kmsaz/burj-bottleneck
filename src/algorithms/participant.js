/**
 * participant.js — YOUR ALGORITHM (blank template).
 *
 * This file is intentionally empty. Everything in it is yours to write.
 * The simulation calls assignElevator() once for every passenger group that
 * arrives, and the car you return becomes that group's pickup car for the
 * rest of its journey — assignments are never re-dispatched.
 *
 * LANGUAGE SUPPORT
 *   This file is read as text and its language is detected automatically, so
 *   you can write Python here instead of JavaScript:
 *
 *       def assign_elevator(request, elevators, current_time):
 *           return 0
 *
 *   JavaScript and Python both run fully offline in the browser (Python via a
 *   bundled Pyodide runtime). C++, C#, Java, Go, Rust and TypeScript are
 *   recognised and reported in the UI, but no offline runtime ships for them.
 *
 * WHAT YOU RECEIVE
 *   request     { origin, dest, count }
 *                 origin  floor the group is waiting on (-1 = B1, 0 = G, 1–10)
 *                 dest    floor they are travelling to
 *                 count   number of people in the group
 *   elevators   [Elevator A snapshot, Elevator B snapshot], each:
 *                 id             0 (A) or 1 (B)
 *                 floor          current floor
 *                 state          'IDLE' | 'MOVING' | 'DOORS_OPENING' |
 *                                'BOARDING' | 'DOORS_CLOSING'
 *                 direction      1 up, -1 down, 0 stationary
 *                 occupancy      people currently inside
 *                 capacity       maximum people (10)
 *                 destinations   floors the car is committed to visit
 *                 targetFloor    floor it is currently heading to (if any)
 *                 assignmentCount pending pickups assigned to this car
 *   currentTime simulation seconds since midnight (25200 = 07:00:00)
 *
 * WHAT IS ASKED OF YOU
 *   Return 0 for Elevator A or 1 for Elevator B. Any other value is treated as
 *   0 by the engine. Do not mutate the arguments (they are frozen and shared),
 *   do not reach into engine internals, and do not make network calls.
 *
 * WHERE TO LOOK
 *   starter.js    a working nearest-car baseline you can edit or extend
 *   developer.js  the reference "ideal" implementation to aim at
 *   baseline.js   the protected benchmark (do not modify)
 */

/**
 * Assign an elevator to handle a new passenger request.
 *
 * @param {Object}   request        The incoming passenger group.
 * @param {Object[]} elevators      Read-only snapshots of both cars.
 * @param {number}   currentTime    Simulation seconds since midnight.
 * @returns {number} 0 for Elevator A, 1 for Elevator B.
 */
export function assignElevator(request, elevators, currentTime) {
  // TODO: implement your scheduling strategy.
  // Right now every group is sent to Elevator A.
  return 0;
}
