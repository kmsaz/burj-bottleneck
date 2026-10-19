// Example C# algorithm.
//
// NOTE: C# cannot run offline in the browser today — .NET + Roslyn are not
// bundled, so the app recognises this source and reports that clearly rather
// than failing silently. Kept as a reference / local judging input.

using System;

public struct ElevatorView
{
    public int Id;
    public int Floor;
    public int Occupancy;
    public int Capacity;
    public int AssignmentCount;
}

public static class Participant
{
    public static int AssignElevator(int origin, int dest, int count, ElevatorView[] cars)
    {
        int bestId = 0;
        int bestScore = int.MaxValue;

        foreach (var car in cars)
        {
            int score = Math.Abs(car.Floor - origin);
            if (car.Occupancy >= car.Capacity) score += 50;
            score += car.AssignmentCount * 2;

            if (score < bestScore)
            {
                bestScore = score;
                bestId = car.Id;
            }
        }

        return bestId;
    }
}
