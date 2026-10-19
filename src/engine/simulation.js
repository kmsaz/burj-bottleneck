/**
 * simulation.js
 * Core simulation engine. Completely independent of the UI.
 *
 * The engine is the source of truth for:
 *   - Simulation time (integer seconds, START_TIME → END_TIME)
 *   - Passenger requests arriving on schedule
 *   - Elevator positions, states, and timing
 *   - Passenger boarding, riding, and exiting
 *   - Floor waiting queues
 *   - Completed journeys and performance metrics
 *
 * Usage:
 *   const sim = new Simulation(requests, schedulerFn);
 *   while (sim.tick()) { /* optionally render *\/ }
 *   const metrics = sim.getMetrics();
 *
 * The scheduler function is called once per new request:
 *   schedulerFn(request, elevatorSnapshots, currentTime) → elevatorId (0 or 1)
 */

import { START_TIME, END_TIME, FLOORS, CAPACITY, TRAVEL_TIME, DOOR_TIME } from './constants.js';
import { createElevator, elevatorSnapshot, ElevatorState } from './elevator.js';

// Maximum events stored in the event log.
const MAX_EVENTS = 30;

export class Simulation {
  /**
   * @param {readonly Object[]} requests  Frozen request schedule from generateDemand()
   * @param {Function}          schedulerFn  Scheduling algorithm: (request, snapshots, time) → 0|1
   */
  constructor(requests, schedulerFn) {
    if (!Array.isArray(requests)) throw new Error('requests must be an array');
    if (typeof schedulerFn !== 'function') throw new Error('schedulerFn must be a function');

    this.requests     = requests;
    this.schedulerFn  = schedulerFn;
    this.time         = START_TIME;
    this.reqIdx       = 0;

    // Elevators A (id=0) and B (id=1) both start at the ground floor.
    this.elevators = [createElevator(0, 0), createElevator(1, 0)];

    // Floor waiting queues: map from floor index → array of waiting request objects.
    // A request enters the queue when it arrives (at requestTime).
    // It is removed when a passenger boards an elevator.
    this.waitingQueues = Object.fromEntries(FLOORS.map(f => [f, []]));

    // Tracking arrays for metrics.
    this.completed = [];  // { request, boardTime, arrivalTime } — fully delivered passengers
    this.events    = [];  // recent human-readable events
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  _emit(msg) {
    const h = String(Math.floor(this.time / 3600)).padStart(2, '0');
    const m = String(Math.floor((this.time % 3600) / 60)).padStart(2, '0');
    this.events.push(`[${h}:${m}] ${msg}`);
    if (this.events.length > MAX_EVENTS) this.events.shift();
  }

  /** Determine the next floor the elevator should travel to. */
  _chooseTarget(el) {
    // Priority 1: drop off passengers already on board.
    if (el.passengers.length > 0) {
      // Move toward the nearest passenger destination.
      const targets = el.passengers.map(p => p.dest);
      // If heading up, prefer the lowest destination above current floor;
      // otherwise prefer the highest destination below. Fall back to nearest.
      const nearest = targets.reduce((best, t) =>
        Math.abs(t - el.floor) < Math.abs(best - el.floor) ? t : best
      );
      return nearest;
    }
    // Priority 2: go pick up an assigned request.
    if (el.assignments.length > 0) {
      const origins = el.assignments.map(a => a.origin);
      return origins.reduce((best, t) =>
        Math.abs(t - el.floor) < Math.abs(best - el.floor) ? t : best
      );
    }
    return null;
  }

  /** Board and exit passengers at the elevator's current floor. */
  _handleBoardingAtFloor(el) {
    // Step 1: Exit passengers whose destination is this floor.
    const remaining = [];
    for (const p of el.passengers) {
      if (p.dest === el.floor) {
        // Record arrival time for each individual in the group.
        for (let i = 0; i < p.count; i++) {
          this.completed.push({
            request:     p,
            boardTime:   p.boardTime,
            arrivalTime: this.time,
          });
        }
        this._emit(`${p.count} passenger(s) exit Elevator ${el.id === 0 ? 'A' : 'B'} at floor ${el.floor}`);
      } else {
        remaining.push(p);
      }
    }
    el.passengers = remaining;

    // Step 2: Board waiting passengers assigned to this elevator from this floor.
    const stillAssigned = [];
    for (const req of el.assignments) {
      if (req.origin !== el.floor) {
        stillAssigned.push(req);
        continue;
      }
      const currentOccupancy = el.passengers.reduce((sum, p) => sum + p.count, 0);
      const space = CAPACITY - currentOccupancy;
      if (space <= 0) {
        // No room — keep in assignments, elevator will return or another will come.
        stillAssigned.push(req);
        continue;
      }
      // Board the full group if there is space, otherwise skip this tick.
      // Rule: groups board as a unit. Partial boarding is not supported.
      if (req.count <= space) {
        const boarded = { ...req, boardTime: this.time };
        el.passengers.push(boarded);
        // Remove from floor waiting queue.
        this.waitingQueues[req.origin] = this.waitingQueues[req.origin]
          .filter(r => r.id !== req.id);
        this._emit(`${req.count} passenger(s) board Elevator ${el.id === 0 ? 'A' : 'B'} at floor ${req.origin}`);
      } else {
        // Not enough room right now; keep assigned.
        stillAssigned.push(req);
      }
    }
    el.assignments = stillAssigned;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Advance simulation by one second.
   * Returns true while the simulation day is active; false when it has ended.
   */
  tick() {
    if (this.time >= END_TIME) return false;

    // ------ 1. Dispatch newly arrived requests ------
    while (
      this.reqIdx < this.requests.length &&
      this.requests[this.reqIdx].requestTime <= this.time
    ) {
      const req = this.requests[this.reqIdx];
      this.reqIdx++;

      // Add to the floor waiting queue.
      this.waitingQueues[req.origin].push(req);
      this._emit(`${req.count} passenger(s) arrive at floor ${req.origin} → ${req.dest}`);

      // Ask the scheduling algorithm which elevator should handle this request.
      const snapshots = this.elevators.map(elevatorSnapshot);
      let chosenId = 0;
      try {
        const result = this.schedulerFn(
          Object.freeze({ ...req }),   // algorithm gets a read-only copy
          snapshots,
          this.time,
        );
        chosenId = (result === 0 || result === 1) ? result : 0;
      } catch (_) {
        // Faulty algorithm falls back to elevator 0.
        chosenId = 0;
      }

      // Assign to chosen elevator.
      this.elevators[chosenId].assignments.push(req);
      this._emit(`Elevator ${chosenId === 0 ? 'A' : 'B'} assigned to floor ${req.origin}`);
    }

    // ------ 2. Advance each elevator state machine ------
    for (const el of this.elevators) {
      if (el.timer > 0) {
        el.timer--;
        // Track service time while doors are active.
        if (el.state !== ElevatorState.IDLE && el.state !== ElevatorState.MOVING) {
          el.serviceTicks++;
        }
        if (el.state === ElevatorState.MOVING) {
          el.movingTicks++;
        }
        continue;
      }

      switch (el.state) {
        case ElevatorState.IDLE: {
          const target = this._chooseTarget(el);
          if (target !== null) {
            el.targetFloor = target;
            el.direction   = target > el.floor ? 1 : target < el.floor ? -1 : 0;
            if (el.floor === target) {
              // Already here — open doors immediately.
              el.state = ElevatorState.DOORS_OPENING;
              el.timer = DOOR_TIME - 1;
            } else {
              el.state = ElevatorState.MOVING;
            }
          }
          break;
        }

        case ElevatorState.MOVING: {
          el.movingTicks++;
          if (el.floor === el.targetFloor) {
            el.direction = 0;
            el.state     = ElevatorState.DOORS_OPENING;
            el.timer     = DOOR_TIME - 1;
          } else {
            // Move one floor.
            el.floor    += el.direction;
            el.timer     = TRAVEL_TIME - 1;
          }
          break;
        }

        case ElevatorState.DOORS_OPENING: {
          el.serviceTicks++;
          el.state = ElevatorState.BOARDING;
          el.timer = DOOR_TIME - 1;
          this._handleBoardingAtFloor(el);
          break;
        }

        case ElevatorState.BOARDING: {
          el.serviceTicks++;
          el.state = ElevatorState.DOORS_CLOSING;
          el.timer = DOOR_TIME - 1;
          break;
        }

        case ElevatorState.DOORS_CLOSING: {
          el.serviceTicks++;
          const target = this._chooseTarget(el);
          el.targetFloor = target;
          if (target !== null) {
            el.direction = target > el.floor ? 1 : target < el.floor ? -1 : 0;
            if (target === el.floor) {
              el.state = ElevatorState.DOORS_OPENING;
              el.timer = DOOR_TIME - 1;
            } else {
              el.state = ElevatorState.MOVING;
            }
          } else {
            el.direction = 0;
            el.state     = ElevatorState.IDLE;
          }
          break;
        }
      }
    }

    this.time++;
    return true;
  }

  /**
   * Count passengers still waiting at the end of the simulation.
   * This includes passengers in floor queues who never boarded.
   */
  _countStillWaiting() {
    let total = 0;
    for (const floor of FLOORS) {
      for (const req of this.waitingQueues[floor]) {
        total += req.count;
      }
    }
    // Also count passengers assigned to an elevator but not yet boarded.
    for (const el of this.elevators) {
      for (const req of el.assignments) {
        // Only count if still in the queue (not already removed on boarding).
        if (this.waitingQueues[req.origin]?.some(r => r.id === req.id)) {
          // Already counted above via waitingQueues.
        } else {
          // This assignment's passengers left the queue when assigned but
          // haven't boarded yet — they're in transit to be picked up.
          total += req.count;
        }
      }
    }
    return total;
  }

  /**
   * Compute all six evaluation metrics.
   *
   * Returned object:
   *   {
   *     avgWaitTime:      number  seconds (includes passengers never boarded)
   *     maxWaitTime:      number  seconds
   *     completedTrips:   number  individual passengers (not groups) who arrived
   *     avgJourneyTime:   number  seconds (boarding → arrival, completed only)
   *     stillWaiting:     number  individual passengers not yet boarded at END_TIME
   *     utilisationA:     number  0–1, fraction of simulation time Elevator A was active
   *     utilisationB:     number  0–1, fraction of simulation time Elevator B was active
   *   }
   *
   * Waiting time for passengers who never board = END_TIME − requestTime.
   * Elevator utilisation = (movingTicks + serviceTicks) / totalSimulationTicks.
   */
  getMetrics() {
    const totalTicks = END_TIME - START_TIME;

    // --- Wait times ---
    let totalWait = 0;
    let maxWait   = 0;
    let waitCount = 0;

    // Passengers who completed their journey.
    for (const entry of this.completed) {
      const wait = entry.boardTime - entry.request.requestTime;
      totalWait += wait;
      if (wait > maxWait) maxWait = wait;
      waitCount++;
    }

    // Passengers currently riding in elevators at the cutoff (waited until boarding).
    for (const el of this.elevators) {
      for (const p of el.passengers) {
        const wait = p.boardTime - p.requestTime;
        for (let i = 0; i < p.count; i++) {
          totalWait += wait;
          if (wait > maxWait) maxWait = wait;
          waitCount++;
        }
      }
    }

    // Passengers still waiting at the end of the day.
    const endTime = this.time; // may be END_TIME or wherever sim stopped
    for (const floor of FLOORS) {
      for (const req of this.waitingQueues[floor]) {
        const wait = endTime - req.requestTime;
        const perPerson = wait;
        for (let i = 0; i < req.count; i++) {
          totalWait += perPerson;
          if (perPerson > maxWait) maxWait = perPerson;
          waitCount++;
        }
      }
    }
    // Also count assigned-but-not-boarded passengers.
    for (const el of this.elevators) {
      for (const req of el.assignments) {
        // Skip if still in the floor queue (counted above).
        if (this.waitingQueues[req.origin]?.some(r => r.id === req.id)) continue;
        const wait = endTime - req.requestTime;
        for (let i = 0; i < req.count; i++) {
          totalWait += wait;
          if (wait > maxWait) maxWait = wait;
          waitCount++;
        }
      }
    }

    // --- Journey times (completed only) ---
    let totalJourney = 0;
    for (const entry of this.completed) {
      totalJourney += entry.arrivalTime - entry.boardTime;
    }

    // --- Completed trips (individual passengers) ---
    const completedTrips = this.completed.length;

    // --- Still waiting ---
    const stillWaiting = this._countStillWaiting();

    // --- Elevator utilisation ---
    // Utilisation = (movingTicks + serviceTicks) / total simulation ticks.
    // A value of 1.0 means the elevator was busy for the entire day.
    const { movingTicks: mA, serviceTicks: sA } = this.elevators[0];
    const { movingTicks: mB, serviceTicks: sB } = this.elevators[1];
    const utilisationA = Math.min(1, (mA + sA) / totalTicks);
    const utilisationB = Math.min(1, (mB + sB) / totalTicks);

    return {
      avgWaitTime:    waitCount > 0 ? totalWait / waitCount : 0,
      maxWaitTime:    maxWait,
      completedTrips,
      avgJourneyTime: completedTrips > 0 ? totalJourney / completedTrips : 0,
      stillWaiting,
      utilisationA,
      utilisationB,
    };
  }

  /** Total passengers waiting on all floors right now (live stat). */
  get totalWaiting() {
    let n = 0;
    for (const floor of FLOORS) {
      for (const req of this.waitingQueues[floor]) {
        n += req.count;
      }
    }
    return n;
  }

  /** Total passengers currently inside elevators (live stat). */
  get totalRiding() {
    let n = 0;
    for (const el of this.elevators) {
      for (const p of el.passengers) n += p.count;
    }
    return n;
  }
}
