import { describe, it, expect } from 'vitest';
import { generateDemand, buildRng } from '../src/engine/demand.js';
import { FLOORS, START_TIME, END_TIME } from '../src/engine/constants.js';

describe('Demand Generation', () => {
  const seedA = 'SEED_ALPHA';
  const seedB = 'SEED_BETA';

  it('generates identical passenger schedules for the same seed', () => {
    const run1 = generateDemand(seedA);
    const run2 = generateDemand(seedA);

    expect(run1.length).toBeGreaterThan(0);
    expect(run1.length).toBe(run2.length);
    expect(run1).toEqual(run2);
  });

  it('generates different passenger schedules for different seeds', () => {
    const runA = generateDemand(seedA);
    const runB = generateDemand(seedB);

    expect(runA).not.toEqual(runB);
  });

  it('ensures all requests have valid origins, destinations, times, and counts', () => {
    const validFloors = new Set(FLOORS);
    const schedule = generateDemand(seedA);

    expect(schedule.length).toBeGreaterThan(50);

    for (const req of schedule) {
      // Valid ID
      expect(typeof req.id).toBe('string');
      expect(req.id).toMatch(/^P\d+$/);

      // Valid timing within operating hours
      expect(req.requestTime).toBeGreaterThanOrEqual(START_TIME);
      expect(req.requestTime).toBeLessThanOrEqual(END_TIME);

      // Valid floors
      expect(validFloors.has(req.origin)).toBe(true);
      expect(validFloors.has(req.dest)).toBe(true);
      expect(req.origin).not.toBe(req.dest);

      // Valid passenger count
      expect(req.count).toBeGreaterThanOrEqual(1);
      expect(req.count).toBeLessThanOrEqual(10);
    }
  });

  it('returns requests sorted in ascending order of requestTime', () => {
    const schedule = generateDemand(seedA);
    for (let i = 1; i < schedule.length; i++) {
      expect(schedule[i].requestTime).toBeGreaterThanOrEqual(schedule[i - 1].requestTime);
    }
  });

  it('freezes the demand array and each request to prevent mutation', () => {
    const schedule = generateDemand(seedA);
    expect(Object.isFrozen(schedule)).toBe(true);
    if (schedule.length > 0) {
      expect(Object.isFrozen(schedule[0])).toBe(true);
    }
  });

  it('deterministic RNG produces stable numbers', () => {
    const rng1 = buildRng('TEST_SEED');
    const rng2 = buildRng('TEST_SEED');
    const vals1 = [rng1(), rng1(), rng1()];
    const vals2 = [rng2(), rng2(), rng2()];
    expect(vals1).toEqual(vals2);
  });
});
