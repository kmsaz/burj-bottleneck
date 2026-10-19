import { describe, it, expect } from 'vitest';
import { generateDemand } from '../src/engine/demand.js';
import { Simulation } from '../src/engine/simulation.js';
import { assignElevator as baselineAlgo } from '../src/algorithms/baseline.js';
import {
  getHourlyDemandDistribution,
  analyzeTimeWindow,
  TIME_PRESETS,
} from '../src/evaluation/analytics.js';

describe('Performance Analytics & Time-Window Analysis', () => {
  const seed = 'TEST_ANALYTICS_SEED';
  const requests = generateDemand(seed);

  it('generates 15 hourly demand buckets covering the full operating day (07:00–22:00)', () => {
    const buckets = getHourlyDemandDistribution(requests);
    expect(buckets.length).toBe(15);

    expect(buckets[0].hour).toBe(7);
    expect(buckets[0].label).toBe('07:00');

    expect(buckets[14].hour).toBe(21);
    expect(buckets[14].label).toBe('21:00');

    const totalPax = buckets.reduce((sum, b) => sum + b.passengers, 0);
    const expectedPax = requests.reduce((sum, r) => sum + r.count, 0);
    expect(totalPax).toBe(expectedPax);
  });

  it('accurately analyzes a specific time window for traffic patterns and bottlenecks', () => {
    const sim = new Simulation(requests, baselineAlgo);
    // Run for a bit to generate completed data
    for (let i = 0; i < 500; i++) sim.tick();

    // Analyze morning rush (07:00 to 09:30)
    const morningStart = 7 * 3600;
    const morningEnd   = 9.5 * 3600;
    const analysis = analyzeTimeWindow(requests, sim, morningStart, morningEnd);

    expect(analysis.totalPassengers).toBeGreaterThan(0);
    expect(analysis.windowRequestsCount).toBeGreaterThan(0);
    expect(analysis.busiestOrigin).toHaveProperty('floor');
    expect(analysis.busiestOrigin).toHaveProperty('label');
    expect(analysis.busiestDest).toHaveProperty('floor');
    expect(analysis.avgWaitTime).toBeGreaterThanOrEqual(0);

    expect(analysis.workload).toHaveProperty('pctA');
    expect(analysis.workload).toHaveProperty('pctB');
    expect(analysis.workload.pctA + analysis.workload.pctB).toBe(100);
  });

  it('validates all predefined time presets are within valid simulation hours', () => {
    for (const preset of TIME_PRESETS) {
      expect(preset.start).toBeGreaterThanOrEqual(7 * 3600);
      expect(preset.end).toBeLessThanOrEqual(22 * 3600);
      expect(preset.start).toBeLessThan(preset.end);
      expect(typeof preset.label).toBe('string');
    }
  });
});
