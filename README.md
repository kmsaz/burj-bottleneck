# The Burj Bottleneck — Elevator Scheduling Simulation

Welcome to **The Burj Bottleneck**, a student hackathon programming challenge!

Your mission is to write an intelligent elevator scheduling algorithm for **Al Noor Business Tower** in Abu Dhabi. Two elevator cars (Elevator A and Elevator B) serve 12 floors throughout a busy 15-hour working day (07:00 to 22:00). Your algorithm decides which elevator handles each incoming passenger request.

Can you beat the provided baseline algorithm and minimize waiting times across the tower?

**Live demo:** https://kmsaz.github.io/burj-bottleneck/ — the full simulation runs in your browser, no install required.

---

## 1. Quick Start

### Installation
Clone the repository and install the dependencies (Node.js 18+ required):

```bash
npm install
```

### Start the Live Simulation
Launch the local development server:

```bash
npm run dev
```

Open the displayed URL in your browser (typically `http://localhost:5173`).

### Run Automated Tests
Verify that all unit tests and simulation checks pass:

```bash
npm test
```

---

## 2. Which File to Edit

You only need to edit **one file**:

```text
src/algorithms/participant.js
```

The baseline algorithm is located in `src/algorithms/baseline.js` for reference. **Do not modify the baseline, engine, or evaluation files.**

---

## 3. Algorithm Interface

Every time passengers arrive at a floor, the simulation invokes your function:

```javascript
export function assignElevator(request, elevators, currentTime) {
  // Your scheduling logic here...
  return 0; // Return 0 for Elevator A, or 1 for Elevator B
}
```

### Parameters

1. **`request`** `{Object}`: The new passenger group.
   - `origin` (`number`): Floor where passengers are waiting (`-1` = B1, `0` = G, `1` through `10`).
   - `dest` (`number`): Floor the passengers want to travel to.
   - `count` (`number`): Number of passengers in the group.

2. **`elevators`** `{Object[]}`: Snapshots of both elevators (`[0]` is Elevator A, `[1]` is Elevator B).
   - `id` (`number`): `0` (Elevator A) or `1` (Elevator B).
   - `floor` (`number`): Current floor (`-1` to `10`).
   - `state` (`string`): `'IDLE'`, `'MOVING'`, `'DOORS_OPENING'`, `'BOARDING'`, or `'DOORS_CLOSING'`.
   - `direction` (`number`): `1` (moving up), `-1` (moving down), or `0` (stationary).
   - `occupancy` (`number`): Passengers currently inside the car.
   - `capacity` (`number`): Maximum capacity (always `10`).
   - `destinations` (`number[]`): Array of floors this elevator is scheduled to visit.
   - `assignmentCount` (`number`): Number of pending pickup requests assigned to this elevator.

3. **`currentTime`** `{number}`: Simulation seconds since midnight (`25200` = 07:00:00).

### Return Value
- Return `0` to assign the request to **Elevator A**.
- Return `1` to assign the request to **Elevator B**.
- Any other return value defaults to `0`.

### Rules & Restrictions
- **Allowed:** You may analyze the current request, elevator positions, directions, occupancies, pending destinations, and the current time to make your decision.
- **Forbidden:** You must not access future requests, mutate incoming parameters or engine internals, or import external network libraries.

---

## 4. The Building: Al Noor Business Tower

The tower consists of 12 distinct levels:

| Level | Floor Index | Description |
|---|---|---|
| **10** | `10` | Events and conference spaces |
| **9** | `9` | Corporate offices and meeting rooms |
| **8** | `8` | Financial and accounting firms |
| **7** | `7` | Shared offices and small businesses |
| **6** | `6` | Marketing and media companies |
| **5** | `5` | Medical centre and pharmacy |
| **4** | `4` | Real estate and consultancy offices |
| **3** | `3` | Technology companies |
| **2** | `2` | Corporate offices |
| **1** | `1` | Retail shops and businesses |
| **G** | `0` | Main lobby and ground entrance |
| **B1** | `-1` | Underground parking |

Elevator specs:
- **Capacity:** 10 passengers per car.
- **Travel Time:** 4 seconds per floor.
- **Door Cycle:** 3 seconds per phase (opening → boarding → closing).

---

## 5. How Evaluation Works

Click **"Run Full Evaluation"** in the web interface (or run via tests) to evaluate both your algorithm and the baseline headlessly across the entire 15-hour day.

Both algorithms run on the **exact same pre-generated passenger schedule** starting from identical initial conditions.

### The 6 Official Metrics

1. **Average Wait Time:** Average time (seconds) from when a passenger requests an elevator to when they board. For passengers who never board by 22:00, wait time is calculated as `22:00 − requestTime`. *(Lower is better)*
2. **Maximum Wait Time:** Longest wait time (seconds) experienced by any passenger, including those still waiting at the end of the day. *(Lower is better)*
3. **Completed Trips:** Total individual passengers who reached their destination. *(Higher is better)*
4. **Average Journey Time:** Average time (seconds) spent inside the elevator from boarding to arrival. *(Lower is better)*
5. **Passengers Still Waiting:** Individual passengers who were never picked up by 22:00. *(Lower is better)*
6. **Elevator Utilisation:** Percentage of total operating time each elevator spent moving or boarding passengers.

---

## 6. Reproducibility & Scenarios

Passenger schedules are deterministically generated from seed strings using a PRNG. The default development seed (`BURJ_DEV_2024`) models realistic demand patterns throughout the day:
- **07:00–09:30:** Morning rush from Lobby (G) and Parking (B1) to offices.
- **10:00–16:00:** Consistent patient traffic to and from the Medical Centre (Floor 5).
- **11:00–14:00 & 17:00–19:00:** Group surges to the Events & Conference floor (Floor 10).
- **17:00–19:30:** Evening departure rush down to G and B1.

Because demand generation is seeded and decoupled from the scheduler, test runs are 100% reproducible.

---

## 7. Project Structure

```text
burj-bottleneck/
├── index.html                  # Minimal HTML entry point
├── package.json                # Project scripts and dependencies
├── README.md                   # Participant guide and documentation
├── src/
│   ├── main.js                 # App boot, render loop, and HMR
│   ├── styles.css              # Minimal, clean technical styling
│   ├── engine/
│   │   ├── constants.js        # Building constants, timing, floors
│   │   ├── demand.js           # Deterministic PRNG demand generator
│   │   ├── elevator.js         # Elevator factory and snapshot helper
│   │   └── simulation.js       # Independent simulation engine & metrics
│   ├── algorithms/
│   │   ├── baseline.js         # Reference nearest-elevator algorithm
│   │   └── participant.js      # <--- EDIT THIS FILE
│   ├── evaluation/
│   │   ├── evaluate.js         # Headless evaluation & 6-metric benchmarking
│   │   └── analytics.js        # Hourly demand patterns & time-window analytics
│   └── ui/
│       ├── building.js         # 2D building and elevator shaft visualizer
│       └── controls.js         # Controls, clock, stats, and results table
└── tests/
    ├── demand.test.js          # Demand determinism & schedule tests
    ├── simulation.test.js      # State machine, capacity, & timing tests
    ├── algorithms.test.js      # Baseline & participant interface tests
    ├── evaluation.test.js      # Headless benchmark & metrics tests
    ├── analytics.test.js       # Hourly distribution & time-window analytics tests
    └── interface.test.js       # UI rendering, controls, & event log tests
```

Good luck and optimize those elevators!
