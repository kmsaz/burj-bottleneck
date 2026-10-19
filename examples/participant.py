# Example Python algorithm — copy this into src/algorithms/participant.js.
# It runs fully offline: the app detects Python and starts the bundled runtime.
#
# request / elevators arrive as plain Python dicts and lists:
#   request   {"origin": 3, "dest": 9, "count": 2, "id": "...", "requestTime": 25200}
#   elevators [{"id": 0, "floor": 0, "state": "IDLE", "direction": 0,
#               "occupancy": 0, "capacity": 10, "destinations": [],
#               "assignmentCount": 0, "targetFloor": None}, ...]
#
# Return 0 for Elevator A or 1 for Elevator B.


def assign_elevator(request, elevators, current_time):
    origin = request["origin"]
    best_id = 0
    best_score = None

    for car in elevators:
        score = abs(car["floor"] - origin)

        # A full car cannot pick anyone up.
        if car["occupancy"] >= car["capacity"]:
            score += 50

        # Spread work across both cars.
        score += car["assignmentCount"] * 2

        if best_score is None or score < best_score:
            best_score = score
            best_id = car["id"]

    return best_id
