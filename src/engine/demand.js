/**
 * demand.js
 * Deterministic passenger demand generator.
 *
 * Produces a fixed schedule of passenger requests for the full simulation day
 * (07:00 – 22:00). The schedule is generated once from a seed string and never
 * changes for that seed, regardless of which scheduling algorithm is used.
 *
 * Request shape:
 *   {
 *     id:          string   — unique identifier, e.g. "P001"
 *     requestTime: number   — simulation seconds when passenger arrives at floor
 *     origin:      number   — floor index (-1..10) where passenger is waiting
 *     dest:        number   — floor index (-1..10), always different from origin
 *     count:       number   — number of people in this group (1–4)
 *   }
 */

import { FLOORS, START_TIME, END_TIME } from './constants.js';

// ---------------------------------------------------------------------------
// Deterministic PRNG (xmur3 seed → mulberry32 generator)
// These are well-known, compact, public-domain algorithms.
// ---------------------------------------------------------------------------

function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0);
  };
}

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Build a seeded PRNG from a string seed. Returns a function that yields [0, 1). */
export function buildRng(seedStr) {
  const seeder = xmur3(String(seedStr));
  return mulberry32(seeder());
}

// ---------------------------------------------------------------------------
// Demand generation
// ---------------------------------------------------------------------------

const VALID_FLOORS = new Set(FLOORS);

/** Pick a random element from an array using the provided rng. */
function pick(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

/** Random integer in [lo, hi) using rng. */
function randInt(lo, hi, rng) {
  return lo + Math.floor(rng() * (hi - lo));
}

/** Random float in [lo, hi) using rng. */
function randFloat(lo, hi, rng) {
  return lo + rng() * (hi - lo);
}

/**
 * Generate the complete passenger schedule for a given seed.
 * Returns a sorted, frozen array of request objects.
 * The array is the same for the same seed every time.
 */
export function generateDemand(seedStr) {
  const rng = buildRng(seedStr);
  const requests = [];
  let nextId = 1;

  function addRequest(time, origin, dest, count) {
    if (!VALID_FLOORS.has(origin) || !VALID_FLOORS.has(dest)) return;
    if (origin === dest) return;
    if (count < 1) return;
    requests.push({
      id:          `P${String(nextId++).padStart(3, '0')}`,
      requestTime: Math.floor(time),
      origin,
      dest,
      count:       Math.max(1, Math.floor(count)),
    });
  }

  // ------------------------------------------------------------------
  // Morning arrivals: 07:00 – 09:30
  // Heavy traffic from B1 (parking) and G (lobby) up to office floors.
  // ------------------------------------------------------------------
  for (let t = START_TIME; t < START_TIME + 2.5 * 3600; t += randFloat(20, 60, rng)) {
    const origin = rng() < 0.55 ? 0 : -1;  // mostly lobby, some parking
    const dest   = pick([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], rng);
    const count  = rng() < 0.3 ? randInt(2, 5, rng) : 1;
    addRequest(t, origin, dest, count);
  }

  // ------------------------------------------------------------------
  // Midday mixed traffic: 09:30 – 13:00
  // Internal floor-to-floor movements, some lobby traffic.
  // ------------------------------------------------------------------
  for (let t = START_TIME + 2.5 * 3600; t < START_TIME + 6 * 3600; t += randFloat(40, 120, rng)) {
    let origin = pick(FLOORS, rng);
    let dest   = pick(FLOORS, rng);
    if (origin === dest) dest = dest === 0 ? 1 : 0;
    const count = rng() < 0.2 ? randInt(2, 4, rng) : 1;
    addRequest(t, origin, dest, count);
  }

  // ------------------------------------------------------------------
  // Medical centre traffic: 10:00 – 16:00 (floor 5)
  // Arrivals from lobby and departures from floor 5.
  // ------------------------------------------------------------------
  for (let t = START_TIME + 3 * 3600; t < START_TIME + 9 * 3600; t += randFloat(90, 300, rng)) {
    if (rng() < 0.5) {
      // Patient arriving at medical floor
      const origin = rng() < 0.6 ? 0 : pick([-1, 1, 2, 3, 4, 6, 7, 8, 9, 10], rng);
      addRequest(t, origin, 5, 1);
    } else {
      // Patient leaving medical floor
      const dest = rng() < 0.6 ? 0 : pick([-1, 1, 2, 3, 4, 6, 7, 8, 9, 10], rng);
      addRequest(t, 5, dest, 1);
    }
  }

  // ------------------------------------------------------------------
  // Events floor bursts: 11:00 – 14:00 and 17:00 – 19:00 (floor 10)
  // Groups heading up for conferences, leaving after.
  // ------------------------------------------------------------------
  for (const [windowStart, windowEnd] of [
    [START_TIME + 4 * 3600, START_TIME + 7 * 3600],
    [17 * 3600, 19 * 3600],
  ]) {
    for (let t = windowStart; t < windowEnd; t += randFloat(300, 900, rng)) {
      if (rng() < 0.6) {
        // Groups going up to events floor
        const origin = rng() < 0.5 ? 0 : pick([1, 2, 3, 4, 6, 7, 8, 9], rng);
        const count  = randInt(2, 5, rng);
        addRequest(t, origin, 10, count);
      } else {
        // Groups leaving events floor
        const dest = rng() < 0.5 ? 0 : pick([1, 2, 3, 4, 6, 7, 8, 9], rng);
        addRequest(t, 10, dest, randInt(2, 5, rng));
      }
    }
  }

  // ------------------------------------------------------------------
  // Afternoon departures: 17:00 – 19:30
  // Heavy flow from upper floors down to lobby and parking.
  // ------------------------------------------------------------------
  for (let t = 17 * 3600; t < 19.5 * 3600; t += randFloat(15, 45, rng)) {
    const origin = pick([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], rng);
    const dest   = rng() < 0.6 ? 0 : -1;
    const count  = rng() < 0.35 ? randInt(2, 5, rng) : 1;
    addRequest(t, origin, dest, count);
  }

  // ------------------------------------------------------------------
  // Evening wind-down: 19:30 – 22:00
  // Sparse, occasional departures and late arrivals.
  // ------------------------------------------------------------------
  for (let t = 19.5 * 3600; t < END_TIME; t += randFloat(120, 360, rng)) {
    const origin = rng() < 0.4 ? pick([1, 2, 3, 7, 8, 9, 10], rng) : 0;
    let   dest   = pick(FLOORS, rng);
    if (origin === dest) dest = dest === 0 ? 1 : 0;
    addRequest(t, origin, dest, 1);
  }

  // Sort by request time; freeze so the engine cannot mutate the schedule.
  requests.sort((a, b) => a.requestTime - b.requestTime);
  return Object.freeze(requests.map(r => Object.freeze(r)));
}
