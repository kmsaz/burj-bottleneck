/**
 * constants.js
 * Shared simulation constants. Edit here to change building configuration.
 */

/** Floor indices in simulation order (B1 = -1, Ground = 0, floors 1–10). */
export const FLOORS = [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** Human-readable labels for each floor index. */
export const FLOOR_LABELS = {
  '-1': 'B1 · Parking',
   '0': 'G  · Lobby',
   '1': ' 1 · Retail',
   '2': ' 2 · Corporate',
   '3': ' 3 · Technology',
   '4': ' 4 · Real Estate',
   '5': ' 5 · Medical',
   '6': ' 6 · Media',
   '7': ' 7 · Shared Offices',
   '8': ' 8 · Finance',
   '9': ' 9 · Corporate',
  '10': '10 · Events',
};

/** Short floor labels used on the building diagram. */
export const FLOOR_SHORT = {
  '-1': 'B1',
   '0': 'G',
   '1': '1',
   '2': '2',
   '3': '3',
   '4': '4',
   '5': '5',
   '6': '6',
   '7': '7',
   '8': '8',
   '9': '9',
  '10': '10',
};

/** Simulation clock: seconds since midnight. Day runs 07:00 – 22:00. */
export const START_TIME = 7 * 3600;   // 25 200
export const END_TIME   = 22 * 3600;  // 79 200

/** Maximum passengers per elevator car. */
export const CAPACITY = 10;

/**
 * Movement timing (in simulation seconds).
 * One floor of travel takes TRAVEL_TIME seconds.
 * Door cycle (open → board → close) takes DOOR_TIME seconds per phase.
 */
export const TRAVEL_TIME = 4;  // seconds per floor
export const DOOR_TIME   = 3;  // seconds per door phase

/** Default seed used during development. */
export const DEFAULT_SEED = 'BURJ_DEV_2024';
