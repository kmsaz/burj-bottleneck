import { describe, it, expect } from 'vitest';
import { assignElevator as baselineAlgo } from '../src/algorithms/baseline.js';
import { assignElevator as starterAlgo } from '../src/algorithms/starter.js';
import { assignElevator as developerAlgo } from '../src/algorithms/developer.js';
import { Simulation } from '../src/engine/simulation.js';
import { START_TIME } from '../src/engine/constants.js';

describe('Scheduling Algorithms', () => {
  const mockElevators = [
    {
      id: 0,
      floor: 0,
      state: 'IDLE',
      occupancy: 0,
      capacity: 10,
      destinations: [],
      assignmentCount: 0,
    },
    {
      id: 1,
      floor: 8,
      state: 'IDLE',
      occupancy: 0,
      capacity: 10,
      destinations: [],
      assignmentCount: 0,
    },
  ];

  it('baseline selects the closer elevator to origin', () => {
    // Request at floor 1 -> Elevator 0 is at floor 0 (dist 1), Elevator 1 is at floor 8 (dist 7)
    const req1 = { origin: 1, dest: 4, count: 1 };
    expect(baselineAlgo(req1, mockElevators, START_TIME)).toBe(0);

    // Request at floor 9 -> Elevator 1 is at floor 8 (dist 1), Elevator 0 is at floor 0 (dist 9)
    const req2 = { origin: 9, dest: 2, count: 1 };
    expect(baselineAlgo(req2, mockElevators, START_TIME)).toBe(1);
  });

  it('baseline applies capacity penalty to full elevators', () => {
    const fullElevators = [
      {
        id: 0,
        floor: 1,
        state: 'IDLE',
        occupancy: 10, // FULL
        capacity: 10,
        destinations: [],
        assignmentCount: 0,
      },
      {
        id: 1,
        floor: 5,
        state: 'IDLE',
        occupancy: 0,
        capacity: 10,
        destinations: [],
        assignmentCount: 0,
      },
    ];

    // Request at floor 2:
    // Distance to El 0 is 1 + 50 (penalty) = 51
    // Distance to El 1 is 3 + 0 = 3
    // Should choose Elevator 1 despite El 0 being closer
    const req = { origin: 2, dest: 6, count: 1 };
    expect(baselineAlgo(req, fullElevators, START_TIME)).toBe(1);
  });

  it('simulation engine safely falls back to elevator 0 on invalid or throwing algorithm outputs', () => {
    let callCount = 0;
    const buggyAlgo = () => {
      callCount++;
      if (callCount === 1) return 999;     // invalid ID
      if (callCount === 2) throw new Error('Algorithm crashed!');
      if (callCount === 3) return 'invalid'; // non-number
      return -5;
    };

    const requests = [
      { id: 'P01', requestTime: START_TIME, origin: 5, dest: 2, count: 1 },
      { id: 'P02', requestTime: START_TIME + 1, origin: 5, dest: 3, count: 1 },
      { id: 'P03', requestTime: START_TIME + 2, origin: 5, dest: 4, count: 1 },
      { id: 'P04', requestTime: START_TIME + 3, origin: 5, dest: 6, count: 1 },
    ];

    const sim = new Simulation(requests, buggyAlgo);

    // Should tick without throwing
    expect(() => {
      for (let i = 0; i < 10; i++) sim.tick();
    }).not.toThrow();

    // All assignments should have safely defaulted to elevator 0
    expect(sim.elevators[0].assignments.length).toBeGreaterThan(0);
    expect(callCount).toBe(4);
  });

  it('algorithm is called with frozen snapshot objects to prevent unauthorized state mutation', () => {
    let receivedRequest = null;
    let receivedElevators = null;

    const inspectorAlgo = (req, els) => {
      receivedRequest = req;
      receivedElevators = els;
      return 0;
    };

    const requests = [{ id: 'P01', requestTime: START_TIME, origin: 2, dest: 4, count: 1 }];
    const sim = new Simulation(requests, inspectorAlgo);
    sim.tick();

    expect(receivedRequest).not.toBeNull();
    expect(Object.isFrozen(receivedRequest)).toBe(true);
    expect(Object.isFrozen(receivedElevators[0])).toBe(true);

    // Attempting to mutate throws or fails in strict mode
    expect(() => {
      receivedRequest.origin = 99;
    }).toThrow();
  });
});

describe('Shipped reference algorithms', () => {
  const idleCars = [
    {
      id: 0,
      floor: 0,
      state: 'IDLE',
      direction: 0,
      occupancy: 0,
      capacity: 10,
      destinations: [],
      targetFloor: null,
      assignmentCount: 0,
    },
    {
      id: 1,
      floor: 8,
      state: 'IDLE',
      direction: 0,
      occupancy: 0,
      capacity: 10,
      destinations: [],
      targetFloor: null,
      assignmentCount: 0,
    },
  ];

  it('starter sends each request to the nearer car', () => {
    expect(starterAlgo({ origin: 1, dest: 4, count: 1 }, idleCars, START_TIME)).toBe(0);
    expect(starterAlgo({ origin: 9, dest: 2, count: 1 }, idleCars, START_TIME)).toBe(1);
  });

  it('starter penalises a full car', () => {
    const fullFirst = [
      { ...idleCars[0], floor: 1, occupancy: 10 },
      { ...idleCars[1], floor: 5 },
    ];
    expect(starterAlgo({ origin: 2, dest: 6, count: 1 }, fullFirst, START_TIME)).toBe(1);
  });

  it('developer sends each request to the nearer car', () => {
    expect(developerAlgo({ origin: 1, dest: 4, count: 1 }, idleCars, START_TIME)).toBe(0);
    expect(developerAlgo({ origin: 9, dest: 2, count: 1 }, idleCars, START_TIME)).toBe(1);
  });

  it('developer honours a moving car\'s committed leg', () => {
    // Car A is mid-flight to floor 9 and cannot turn back for a floor-2 call;
    // Car B is idle at the lobby and should get the request.
    const moving = [
      {
        ...idleCars[0],
        floor: 4,
        state: 'MOVING',
        direction: 1,
        targetFloor: 9,
        destinations: [9],
        assignmentCount: 0,
      },
      { ...idleCars[1], floor: 0 },
    ];
    expect(developerAlgo({ origin: 2, dest: 6, count: 1 }, moving, START_TIME)).toBe(1);
  });

  it('reference algorithms tolerate an empty elevator snapshot', () => {
    expect(starterAlgo({ origin: 2, dest: 5, count: 1 }, [], START_TIME)).toBe(0);
    expect(developerAlgo({ origin: 2, dest: 5, count: 1 }, [], START_TIME)).toBe(0);
  });
});
