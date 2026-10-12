import { describe, expect, it } from "vitest";
import type { Snapshot } from "../src/types.js";
import { resolveExerciseName, resolveExercises } from "../src/write/resolve-exercises.js";

const ex = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  measurementType: "EXERCISE",
  name: { custom: name },
  ...extra,
});

const snapshot = {
  userId: "u",
  continuation: null,
  syncedAt: null,
  preferences: {},
  entities: {
    template: {},
    log: {},
    measurement: {
      m1: ex("m1", "Bench Press (Barbell)"),
      m2: ex("m2", "Bench Press (Dumbbell)"),
      m3: ex("m3", "Squat"),
      m4: ex("m4", "Squat"),
      gone: ex("gone", "Deadlift", { isHidden: true }),
      bw: { id: "bw", measurementType: "BODY", name: { custom: "Bodyweight" } },
    },
    measuredValue: {},
    folder: {},
    tag: {},
    metric: {},
    widget: {},
  },
} as unknown as Snapshot;

describe("resolveExerciseName", () => {
  it("matches an exact name case-insensitively", () => {
    expect(resolveExerciseName(snapshot, "bench press (barbell)")).toBe("m1");
  });

  it("rejects a partial name and suggests close matches", () => {
    expect(() => resolveExerciseName(snapshot, "Bench Press")).toThrow(
      /No exercise named "Bench Press"\. Did you mean: "Bench Press \(Barbell\)" \(m1\)/,
    );
  });

  it("rejects an ambiguous name and lists the ids", () => {
    expect(() => resolveExerciseName(snapshot, "Squat")).toThrow(/ambiguous.*m3, m4/);
  });

  it("ignores hidden exercises and non-exercise measurements", () => {
    expect(() => resolveExerciseName(snapshot, "Deadlift")).toThrow(/No exercise named/);
    expect(() => resolveExerciseName(snapshot, "Bodyweight")).toThrow(/No exercise named/);
  });
});

describe("resolveExercises", () => {
  const sets = [{ reps: 5, weight: 100 }];

  it("keeps ids, resolves names, and prefers the id when both are given", () => {
    const out = resolveExercises(
      {
        name: "Push",
        exercises: [
          { exerciseId: "m2", sets },
          { exercise: "Bench Press (Barbell)", sets },
          { exerciseId: "m3", exercise: "Bench Press (Barbell)", sets },
        ],
      },
      snapshot,
    );
    expect(out.exercises.map((e) => e.exerciseId)).toEqual(["m2", "m1", "m3"]);
  });

  it("requires either an id or a name", () => {
    expect(() => resolveExercises({ name: "x", exercises: [{ sets }] }, snapshot)).toThrow(
      /Exercise #1 needs either exerciseId or exercise/,
    );
  });
});
