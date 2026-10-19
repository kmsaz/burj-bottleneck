/**
 * elevator.js
 * Elevator factory and state helpers.
 *
 * Elevator state object shape:
 *   {
 *     id:          number          — 0 (Elevator A) or 1 (Elevator B)
 *     floor:       number          — current floor index (integer, -1..10)
 *     state:       ElevatorState   — one of the constants below
 *     direction:   1 | -1 | 0     — current travel direction (0 = idle)
 *     targetFloor: number | null   — next floor to travel to
 *     passengers:  PassengerInCar[] — passengers currently inside
 *     assignments: Request[]       — requests assigned to this elevator (awaiting pickup)
 *     timer:       number          — ticks remaining in current timed phase
 *     movingTicks: number          — accumulated ticks spent moving (for utilisation)
 *     serviceTicks:number          — accumulated ticks spent with doors open (for utilisation)
 *   }
 */

import { CAPACITY } from './constants.js';

/** All valid elevator states. */
export const ElevatorState = Object.freeze({
  IDLE:           'IDLE',
  MOVING:         'MOVING',
  DOORS_OPENING:  'DOORS_OPENING',
  BOARDING:       'BOARDING',
  DOORS_CLOSING:  'DOORS_CLOSING',
});

/**
 * Create a fresh elevator state object.
 * @param {number} id  0 or 1
 * @param {number} startFloor  starting floor index
 */
export function createElevator(id, startFloor = 0) {
  return {
    id,
    floor:        startFloor,
    state:        ElevatorState.IDLE,
    direction:    0,
    targetFloor:  null,
    passengers:   [],   // { ...request, boardTime, arrivalTime? }
    assignments:  [],   // frozen request objects waiting for pickup
    timer:        0,
    movingTicks:  0,
    serviceTicks: 0,
  };
}

/**
 * Return a read-only snapshot of an elevator suitable for passing to the
 * scheduling algorithm. Prevents the algorithm from mutating simulation state.
 */
export function elevatorSnapshot(el) {
  return Object.freeze({
    id:          el.id,
    floor:       el.floor,
    state:       el.state,
    direction:   el.direction,
    targetFloor: el.targetFloor,
    occupancy:   el.passengers.length,
    capacity:    CAPACITY,
    // Expose pending destinations so algorithms can reason about workload.
    destinations: Object.freeze([
      ...el.passengers.map(p => p.dest),
      ...el.assignments.map(p => p.origin),
    ]),
    assignmentCount: el.assignments.length,
  });
}
