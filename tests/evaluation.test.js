import { describe, it, expect } from 'vitest';
import { runEvaluation, compareAlgorithms } from '../src/evaluation/evaluate.js';
import { generateDemand } from '../src/engine/demand.js';
import { assignElevator as baselineAlgo } from '../src/algorithms/baseline.js';

describe('Evaluation & Benchmarking', () => {
  const testSeed = 'TEST_EVAL_SEED';

  it('runs headless evaluation across the full day and returns all 6 required metrics', () => {
    const requests = generateDemand(testSeed);
    const metrics = runEvaluation(baselineAlgo, requests);

    expect(metrics).toHaveProperty('avgWaitTime');
    expect(metrics).toHaveProperty('maxWaitTime');
    expect(metrics).toHaveProperty('completedTrips');
    expect(metrics).toHaveProperty('avgJourneyTime');
    expect(metrics).toHaveProperty('stillWaiting');
    expect(metrics).toHaveProperty('utilisationA');
    expect(metrics).toHaveProperty('utilisationB');

    // Values should be non-negative and finite
    expect(metrics.avgWaitTime).toBeGreaterThanOrEqual(0);
    expect(metrics.maxWaitTime).toBeGreaterThanOrEqual(metrics.avgWaitTime);
    expect(metrics.completedTrips).toBeGreaterThan(0);
    expect(metrics.avgJourneyTime).toBeGreaterThanOrEqual(0);
    expect(metrics.stillWaiting).toBeGreaterThanOrEqual(0);
    expect(metrics.utilisationA).toBeGreaterThanOrEqual(0);
    expect(metrics.utilisationA).toBeLessThanOrEqual(1);
    expect(metrics.utilisationB).toBeGreaterThanOrEqual(0);
    expect(metrics.utilisationB).toBeLessThanOrEqual(1);
  });

  it('provides identical passenger requests to both algorithms in compareAlgorithms', () => {
    let baseReqCount = 0;
    let custReqCount = 0;

    const baseSpy = (req, els, t) => {
      baseReqCount++;
      return baselineAlgo(req, els, t);
    };

    const custSpy = (req, els, t) => {
      custReqCount++;
      return baselineAlgo(req, els, t);
    };

    const res = compareAlgorithms(baseSpy, custSpy, testSeed);

    expect(baseReqCount).toBe(res.requests.length);
    expect(custReqCount).toBe(res.requests.length);
    expect(baseReqCount).toBe(custReqCount);
  });

  it('ensures clean state reset between evaluation runs', () => {
    const res = compareAlgorithms(baselineAlgo, baselineAlgo, testSeed);

    // Running the same baseline algorithm twice on identical input must yield identical metrics
    expect(res.baseline.avgWaitTime).toBeCloseTo(res.participant.avgWaitTime, 5);
    expect(res.baseline.maxWaitTime).toBe(res.participant.maxWaitTime);
    expect(res.baseline.completedTrips).toBe(res.participant.completedTrips);
    expect(res.baseline.avgJourneyTime).toBeCloseTo(res.participant.avgJourneyTime, 5);
    expect(res.baseline.stillWaiting).toBe(res.participant.stillWaiting);
    expect(res.baseline.utilisationA).toBeCloseTo(res.participant.utilisationA, 5);
    expect(res.baseline.utilisationB).toBeCloseTo(res.participant.utilisationB, 5);
  });

  it('correctly accounts for passengers remaining in queue at cutoff in wait times', () => {
    // Single request arriving 10s before end of day that cannot be boarded before cutoff
    const lateReq = [{
      id: 'P99',
      requestTime: 79190, // 21:59:50 (10s before 22:00)
      origin: 10,
      dest: -1,
      count: 2,
    }];

    const metrics = runEvaluation(() => 0, lateReq);

    // 2 passengers were generated and could not board before 79200 (22:00)
    expect(metrics.stillWaiting).toBe(2);
    // Wait time must be non-zero (accounted until 22:00 cutoff: 10s)
    expect(metrics.avgWaitTime).toBe(79200 - 79190);
    expect(metrics.maxWaitTime).toBe(79200 - 79190);
  });
});
