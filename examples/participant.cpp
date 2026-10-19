// Example C++ algorithm.
//
// NOTE: C++ cannot run offline in the browser today — there is no compiler in
// the page, so the app recognises this file and explains that instead of
// executing it. Keep it here as a reference / for a local judging pipeline.
//
// Signature mirrors the JavaScript contract:
//   request    origin, dest, count
//   elevators  two cars, index 0 = A, 1 = B

#include <cmath>

struct ElevatorView {
    int id;
    int floor;
    int occupancy;
    int capacity;
    int assignmentCount;
};

int assignElevator(int origin, int dest, int count, const ElevatorView cars[2]) {
    int bestId = 0;
    int bestScore = 1 << 30;

    for (int i = 0; i < 2; i++) {
        const ElevatorView& car = cars[i];
        int score = std::abs(car.floor - origin);
        if (car.occupancy >= car.capacity) score += 50;
        score += car.assignmentCount * 2;

        if (score < bestScore) {
            bestScore = score;
            bestId = car.id;
        }
    }

    return bestId;
}
