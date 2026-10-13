import { describe, expect, it } from "vitest";
import { estimateOneRepMax, personalRecords } from "../src/analytics.js";

describe("estimateOneRepMax", () => {
  it("uses Epley and treats a single as its own max", () => {
    expect(estimateOneRepMax(100, 1)).toBe(100);
    expect(estimateOneRepMax(100, 5)).toBe(116.7);
    expect(estimateOneRepMax(100, 10)).toBe(133.3);
  });

  it("gives no estimate for missing weight, bodyweight or high reps", () => {
    expect(estimateOneRepMax(null, 5)).toBeNull();
    expect(estimateOneRepMax(0, 5)).toBeNull();
    expect(estimateOneRepMax(100, null)).toBeNull();
    expect(estimateOneRepMax(100, 13)).toBeNull();
  });
});

describe("personalRecords", () => {
  const sessions = [
    {
      workoutId: "w1",
      date: "2026-08-01",
      sets: [
        { weight: 100, reps: 5 },
        { weight: 110, reps: 1 },
      ],
    },
    {
      workoutId: "w2",
      date: "2026-09-01",
      sets: [
        { weight: 105, reps: 5 },
        { weight: 110, reps: 2 },
        { weight: 60, reps: 15 },
      ],
    },
  ];

  it("finds each record and where it was set", () => {
    const pr = personalRecords(sessions);
    expect(pr.sessions).toBe(2);
    // 110 x1 in w1 came first; the later 110 x2 ties on weight and does not replace it.
    expect(pr.heaviestWeight).toMatchObject({ workoutId: "w1", weight: 110, reps: 1 });
    expect(pr.bestEstimatedOneRepMax).toMatchObject({ workoutId: "w2", e1rm: 122.5 });
    expect(pr.mostReps).toMatchObject({ workoutId: "w2", reps: 15 });
    expect(pr.bestSetVolume).toMatchObject({ workoutId: "w2", volume: 900 });
  });

  it("handles bodyweight-only sets", () => {
    const pr = personalRecords([{ workoutId: "w", sets: [{ weight: null, reps: 20 }] }]);
    expect(pr.heaviestWeight).toBeNull();
    expect(pr.bestEstimatedOneRepMax).toBeNull();
    expect(pr.mostReps).toMatchObject({ reps: 20 });
  });
});
