/**
 * building.js
 * Renders the building, two elevator shafts, elevator cars, and floor queues.
 *
 * Uses plain DOM and CSS transforms — no canvas, no external library.
 * All positions are derived from the actual simulation state; nothing is
 * independently animated.
 */

import { FLOORS, FLOOR_SHORT, FLOOR_LABELS } from '../engine/constants.js';

const TOTAL_FLOORS = FLOORS.length;  // 12 (B1 through 10)

// Colour identifiers — must match CSS variables.
const EL_CLASSES = ['elevator-a', 'elevator-b'];
const EL_NAMES   = ['A', 'B'];

/**
 * Build the static building DOM and return an object with update functions.
 *
 * @param {HTMLElement} container  The element to mount the building into.
 * @returns {{ updateElevator, updateQueue, updateElevatorState }}
 */
export function createBuilding(container) {
  container.innerHTML = '';
  container.classList.add('building');

  // ── Building structure ──────────────────────────────────────────────────
  // Layout (left → right):
  //   floor-labels | shaft-A | shaft-divider | shaft-B | queue-indicators

  const grid = document.createElement('div');
  grid.className = 'building-grid';
  container.appendChild(grid);

  // Floor label column
  const labelCol = document.createElement('div');
  labelCol.className = 'floor-label-col';
  grid.appendChild(labelCol);

  // Shaft A
  const shaftA = document.createElement('div');
  shaftA.className = 'shaft shaft-a';
  grid.appendChild(shaftA);

  // Shaft divider
  const divider = document.createElement('div');
  divider.className = 'shaft-divider';
  grid.appendChild(divider);

  // Shaft B
  const shaftB = document.createElement('div');
  shaftB.className = 'shaft shaft-b';
  grid.appendChild(shaftB);

  // Queue column
  const queueCol = document.createElement('div');
  queueCol.className = 'queue-col';
  grid.appendChild(queueCol);

  // ── Per-floor rows ──────────────────────────────────────────────────────
  // Floors rendered top-to-bottom (floor 10 first, B1 last) so the visual
  // matches a real building. The CSS uses flex-column so rows are ordered
  // from the top of the container.
  const floorsDescending = [...FLOORS].reverse(); // [10, 9, …, 0, -1]

  const floorDivs   = {};  // floor → {label, rowA, rowB, queue}
  const elevatorEls = [null, null]; // [elevator A el, elevator B el]

  floorsDescending.forEach((floor, i) => {
    const key = String(floor);

    // Label cell
    const lbl = document.createElement('div');
    lbl.className = 'floor-cell floor-label-cell';
    lbl.setAttribute('data-floor', floor);
    const floorDesc = (FLOOR_LABELS[key] || '').split('·')[1]?.trim() || '';
    lbl.innerHTML = `<span class="floor-short">${FLOOR_SHORT[key]}</span><span class="floor-desc">${floorDesc}</span>`;
    lbl.title = FLOOR_LABELS[key] || floor;
    labelCol.appendChild(lbl);

    // Shaft A floor cell
    const cellA = document.createElement('div');
    cellA.className = 'floor-cell shaft-cell';
    cellA.setAttribute('data-floor', floor);
    shaftA.appendChild(cellA);

    // Shaft B floor cell
    const cellB = document.createElement('div');
    cellB.className = 'floor-cell shaft-cell';
    cellB.setAttribute('data-floor', floor);
    shaftB.appendChild(cellB);

    // Queue cell
    const qCell = document.createElement('div');
    qCell.className = 'floor-cell queue-cell';
    qCell.setAttribute('data-floor', floor);
    qCell.setAttribute('id', `queue-floor-${floor}`);
    queueCol.appendChild(qCell);

    // Divider line cell (purely visual)
    const divCell = document.createElement('div');
    divCell.className = 'floor-cell divider-cell';
    divider.appendChild(divCell);

    floorDivs[floor] = { lbl, cellA, cellB, qCell };
  });

  // ── Elevator car elements ───────────────────────────────────────────────
  // Each elevator car is a child of its respective shaft and is positioned
  // with CSS `top` relative to the shaft. Position is recalculated on each
  // update based on the actual floor index.

  [shaftA, shaftB].forEach((shaft, idx) => {
    const car = document.createElement('div');
    car.className = `elevator-car ${EL_CLASSES[idx]}`;
    car.setAttribute('id', `elevator-car-${idx}`);
    car.innerHTML = `
      <div class="car-label">${EL_NAMES[idx]}</div>
      <div class="car-occupancy" id="car-occ-${idx}">0/10</div>
      <div class="car-dest" id="car-dest-${idx}">–</div>
    `;
    shaft.appendChild(car);
    elevatorEls[idx] = car;
  });

  // ── Compute geometry ────────────────────────────────────────────────────
  // Floor percentage height for positioning.
  const floorPct = 100 / TOTAL_FLOORS;

  /**
   * Compute the CSS `top` percentage for an elevator at the given floor.
   * Floor 10 is at the top; B1 is at the bottom.
   * @param {number} floor  Floor index (-1..10)
   */
  function floorToTopPct(floor) {
    // floorsDescending[0] = 10 (top), floorsDescending[last] = -1 (bottom)
    const rank = floorsDescending.indexOf(floor);
    return rank * floorPct;
  }

  // ── Update functions (called each animation frame) ──────────────────────

  /**
   * Update an elevator car's visual position and label.
   * @param {Object} el  Elevator state object from simulation.
   */
  function updateElevator(el) {
    const car = elevatorEls[el.id];
    if (!car) return;

    const topPct = floorToTopPct(el.floor);
    car.style.top = `calc(${topPct}% + 2px)`;

    const occ  = document.getElementById(`car-occ-${el.id}`);
    const dest = document.getElementById(`car-dest-${el.id}`);
    if (occ)  occ.textContent  = `${el.passengers.reduce((s, p) => s + p.count, 0)}/10`;
    if (dest) {
      const target = el.targetFloor;
      dest.textContent = target !== null ? `→ ${FLOOR_SHORT[String(target)] ?? target}` : 'idle';
    }
  }

  /**
   * Apply or remove the doors-open CSS class on an elevator car.
   * @param {number} id     Elevator id (0 or 1)
   * @param {boolean} open  True when doors are open.
   */
  function updateElevatorState(id, open) {
    const car = elevatorEls[id];
    if (!car) return;
    car.classList.toggle('doors-open', open);
  }

  /**
   * Update the waiting passenger queue display for a single floor.
   * @param {number} floor       Floor index.
   * @param {number} waitCount   Total number of passengers waiting.
   */
  function updateQueue(floor, waitCount) {
    const cell = document.getElementById(`queue-floor-${floor}`);
    if (!cell) return;

    if (waitCount === 0) {
      cell.innerHTML = '';
      cell.classList.remove('has-waiting');
      return;
    }

    cell.classList.add('has-waiting');
    // Show up to 5 dots then a "+N" overflow label.
    const dots = Math.min(waitCount, 5);
    const overflow = waitCount > 5 ? waitCount - 5 : 0;
    cell.innerHTML =
      Array(dots).fill('<span class="pax-dot"></span>').join('') +
      (overflow > 0 ? `<span class="pax-overflow">+${overflow}</span>` : '');
  }

  return { updateElevator, updateElevatorState, updateQueue };
}
