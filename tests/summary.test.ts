import { describe, expect, it } from "vitest";
import { ReadService } from "../src/services/read-service.js";
import { trainingSummary, weekStart } from "../src/services/summary.js";
import type { Entity, Snapshot } from "../src/types.js";

function workout(id: string, start: string, minutes: number, sets: [number, number][]): Entity {
  return {
    id,
    isHidden: false,
    logType: "WORKOUT",
    name: { custom: id },
    startDate: start,
    endDate: new Date(Date.parse(start) + minutes * 60_000).toISOString(),
    _embedded: {
      cellSetGroup: [
        {
          id: `${id}-g`,
          _links: { measurement: { href: "/api/users/u/measurements/squat" } },
          cellSets: sets.map(([kg, reps], i) => ({
            id: `${id}-s${i}`,
            cells: [
              { cellType: "BARBELL_WEIGHT", value: String(kg) },
              { cellType: "REPS", value: String(reps) },
            ],
          })),
        },
      ],
    },
  };
}

function snap(): Snapshot {
  return {
    userId: "u",
    continuation: null,
    syncedAt: null,
    preferences: {},
    entities: {
      template: {},
      log: {
        // Week of Mon 2026-09-28
        a: workout("a", "2026-09-29T17:00:00Z", 60, [
          [100, 5],
          [100, 5],
        ]),
        // Week of Mon 2026-10-05
        b: workout("b", "2026-10-06T17:00:00Z", 40, [[110, 3]]),
        // Outside a 2-week window
        old: workout("old", "2026-08-01T17:00:00Z", 30, [[90, 5]]),
      },
      measurement: {
        squat: { id: "squat", measurementType: "EXERCISE", name: { custom: "Squat" } },
      },
      measuredValue: {
        v1: {
          id: "v1",
          measurementTypeValue: "WEIGHT",
          value: 82,
          startDate: "2026-09-30T07:00:00Z",
        },
        v2: {
          id: "v2",
          measurementTypeValue: "WEIGHT",
          value: 81,
          startDate: "2026-10-07T07:00:00Z",
        },
        vOld: { id: "vOld", measurementTypeValue: "WEIGHT", value: 60, startDate: "2026-01-01" },
      },
      folder: {},
      tag: {},
      metric: {},
      widget: {},
    },
  };
}

const read = new ReadService({ getSnapshot: snap, getWeightUnit: () => "KILOGRAMS", userId: "u" });
const NOW = Date.parse("2026-10-08T12:00:00Z"); // Thursday

describe("weekStart", () => {
  it("returns Monday 00:00 UTC, including on a Sunday and a Monday", () => {
    expect(new Date(weekStart(NOW)).toISOString()).toBe("2026-10-05T00:00:00.000Z");
    expect(new Date(weekStart(Date.parse("2026-10-11T23:00:00Z"))).toISOString()).toBe(
      "2026-10-05T00:00:00.000Z",
    );
    expect(new Date(weekStart(Date.parse("2026-10-05T00:00:00Z"))).toISOString()).toBe(
      "2026-10-05T00:00:00.000Z",
    );
  });
});

describe("trainingSummary", () => {
  const s = trainingSummary(read, 2, NOW);

  it("covers whole calendar weeks up to now", () => {
    expect(s.range).toEqual({ since: "2026-09-28", until: "2026-10-08", weeks: 2 });
    expect(s.unit).toBe("kg");
  });

  it("buckets workouts, sets and volume per week", () => {
    expect(s.weeks).toEqual([
      { weekStart: "2026-09-28", workouts: 1, sets: 2, volume: 1000 },
      { weekStart: "2026-10-05", workouts: 1, sets: 1, volume: 330 },
    ]);
    expect(s.totals).toEqual({
      workouts: 2,
      sets: 3,
      volume: 1330,
      workoutsPerWeek: 1,
      avgDurationMinutes: 50,
    });
  });

  it("ranks top exercises and reports the bodyweight trend in range", () => {
    expect(s.topExercises).toEqual([
      { exerciseId: "squat", name: "Squat", sessions: 2, sets: 3, volume: 1330 },
    ]);
    expect(s.bodyweight).toMatchObject({ change: -1, entries: 2, unit: "kg" });
    expect(s.daysSinceLastWorkout).toBe(1);
  });

  it("keeps empty weeks so gaps are visible", () => {
    const four = trainingSummary(read, 4, NOW);
    expect(four.weeks.map((w) => w.workouts)).toEqual([0, 0, 1, 1]);
    expect(four.totals.workoutsPerWeek).toBe(0.5);
  });
});
