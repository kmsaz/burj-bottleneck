import { describe, it, expect } from 'vitest';
import { Simulation } from '../src/engine/simulation.js';
import { START_TIME, END_TIME, CAPACITY, TRAVEL_TIME, DOOR_TIME, FLOORS } from '../src/engine/constants.js';
import { ElevatorState } from '../src/engine/elevator.js';

describe('Simulation Engine', () => {
  const dummyScheduler = () => 0; // always choose elevator 0

  it('initializes at START_TIME with two idle elevators at floor 0', () => {
    const sim = new Simulation([], dummyScheduler);
    expect(sim.time).toBe(START_TIME);
    expect(sim.elevators.length).toBe(2);
    expect(sim.elevators[0].floor).toBe(0);
    expect(sim.elevators[1].floor).toBe(0);
    expect(sim.elevators[0].state).toBe(ElevatorState.IDLE);
    expect(sim.elevators[1].state).toBe(ElevatorState.IDLE);
    expect(sim.completed.length).toBe(0);
  });

  it('stops ticking and returns false at END_TIME (22:00)', () => {
    const sim = new Simulation([], dummyScheduler);
    sim.time = END_TIME - 2;

    expect(sim.tick()).toBe(true);
    expect(sim.time).toBe(END_TIME - 1);

    expect(sim.tick()).toBe(true);
    expect(sim.time).toBe(END_TIME);

    expect(sim.tick()).toBe(false);
    expect(sim.time).toBe(END_TIME);
  });

  it('moves elevators between valid floors and follows door timing rules', () => {
    // Single request: from 0 to 2 at START_TIME
    const testReq = [{
      id: 'P01',
      requestTime: START_TIME,
      origin: 0,
      dest: 2,
      count: 1,
    }];

    const sim = new Simulation(testReq, () => 0);

    // Tick 0: request arrives, elevator 0 is at floor 0 (origin).
    // Target is set to 0. Since it is already at 0, transitions to DOORS_OPENING with timer = DOOR_TIME.
    sim.tick();
    const el = sim.elevators[0];
    expect(el.state).toBe(ElevatorState.DOORS_OPENING);
    expect(el.timer).toBe(DOOR_TIME - 1);

    // Advance door opening
    for (let i = 0; i < DOOR_TIME; i++) {
      sim.tick();
    }
    // Now state should transition to BOARDING and passengers board
    expect(el.state).toBe(ElevatorState.BOARDING);
    expect(el.passengers.length).toBe(1);
    expect(el.passengers[0].id).toBe('P01');

    // Advance boarding
    for (let i = 0; i < DOOR_TIME; i++) {
      sim.tick();
    }
    expect(el.state).toBe(ElevatorState.DOORS_CLOSING);

    // Advance doors closing
    for (let i = 0; i < DOOR_TIME; i++) {
      sim.tick();
    }
    // Now doors closed, sets target to destination (2), state becomes MOVING
    expect(el.state).toBe(ElevatorState.MOVING);
    expect(el.targetFloor).toBe(2);

    // Travel to floor 1: TRAVEL_TIME seconds
    for (let i = 0; i < TRAVEL_TIME; i++) {
      sim.tick();
    }
    expect(el.floor).toBe(1);

    // Travel to floor 2: TRAVEL_TIME seconds
    for (let i = 0; i < TRAVEL_TIME; i++) {
      sim.tick();
    }
    expect(el.floor).toBe(2);
  });

  it('strictly enforces elevator capacity (CAPACITY = 10)', () => {
    // 3 requests at floor 0: 4 passengers, 4 passengers, 4 passengers. Total = 12.
    const requests = [
      { id: 'P01', requestTime: START_TIME, origin: 0, dest: 3, count: 4 },
      { id: 'P02', requestTime: START_TIME, origin: 0, dest: 4, count: 4 },
      { id: 'P03', requestTime: START_TIME, origin: 0, dest: 5, count: 4 },
    ];

    const sim = new Simulation(requests, () => 0); // all assigned to el 0

    // Advance through doors opening & boarding
    for (let i = 0; i < 20; i++) {
      sim.tick();
    }

    const el = sim.elevators[0];
    const totalOnBoard = el.passengers.reduce((sum, p) => sum + p.count, 0);

    // 4 + 4 = 8 passengers can board, but 8 + 4 = 12 exceeds 10.
    // So exactly 8 should board, and P03 must stay assigned/waiting.
    expect(totalOnBoard).toBeLessThanOrEqual(CAPACITY);
    expect(totalOnBoard).toBe(8);
  });

  it('never loses passengers or boards them twice', () => {
    const requests = [
      { id: 'P01', requestTime: START_TIME, origin: 0, dest: 1, count: 2 },
      { id: 'P02', requestTime: START_TIME, origin: 0, dest: 1, count: 3 },
    ];

    const sim = new Simulation(requests, () => 0);

    // Run until completion of both
    for (let i = 0; i < 50; i++) {
      sim.tick();
    }

    // Both groups (2 + 3 = 5 individual trips) completed
    expect(sim.completed.length).toBe(5);
    // Floor waiting queues must now be empty
    expect(sim.waitingQueues[0].length).toBe(0);
    // Elevator must have no passengers left
    expect(sim.elevators[0].passengers.length).toBe(0);
  });

  it('calculates completed journeys and waiting times correctly', () => {
    const testReq = [{
      id: 'P01',
      requestTime: START_TIME,
      origin: 0,
      dest: 1,
      count: 2,
    }];

    const sim = new Simulation(testReq, () => 0);

    // Run until completed
    while (sim.completed.length < 2 && sim.tick()) {}

    const metrics = sim.getMetrics();
    expect(metrics.completedTrips).toBe(2);
    expect(metrics.avgWaitTime).toBeGreaterThanOrEqual(0);
    expect(metrics.maxWaitTime).toBeGreaterThanOrEqual(metrics.avgWaitTime);
    expect(metrics.avgJourneyTime).toBeGreaterThan(0);
    expect(metrics.stillWaiting).toBe(0);
  });

  it('tracks elevator positions strictly within valid building floors', () => {
    const validFloors = new Set(FLOORS);
    const testReq = [
      { id: 'P01', requestTime: START_TIME, origin: -1, dest: 10, count: 1 },
      { id: 'P02', requestTime: START_TIME + 10, origin: 10, dest: 0, count: 1 },
    ];

    const sim = new Simulation(testReq, (req) => req.origin === -1 ? 0 : 1);

    for (let i = 0; i < 200; i++) {
      sim.tick();
      for (const el of sim.elevators) {
        expect(validFloors.has(el.floor)).toBe(true);
      }
    }
  });
});
