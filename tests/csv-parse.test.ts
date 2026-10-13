import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseDuration, parseStrongCsv, splitCsv } from "../src/csv/parse.js";

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/csv/${name}`, import.meta.url), "utf8");

describe("splitCsv", () => {
  it("handles quotes, doubled quotes, CRLF and newlines inside quotes", () => {
    expect(splitCsv('a;"b;c";"say ""hi"""\r\n"x\ny";2\n', ";")).toEqual([
      ["a", "b;c", 'say "hi"'],
      ["x\ny", "2"],
    ]);
  });
});

describe("parseDuration", () => {
  it("reads v6 seconds and legacy h/m strings", () => {
    expect(parseDuration("3600")).toBe(3600);
    expect(parseDuration("1h 5m")).toBe(3900);
    expect(parseDuration("45m")).toBe(2700);
    expect(parseDuration("")).toBeNull();
    expect(parseDuration("soon")).toBeNull();
  });
});

describe("parseStrongCsv (v6)", () => {
  const out = parseStrongCsv(fixture("strong-v6.csv"));

  it("reads units from the header and groups rows into workouts", () => {
    expect(out.weightUnit).toBe("kg");
    expect(out.distanceUnit).toBe("meters");
    expect(out.workouts.map((w) => [w.date, w.name, w.durationSeconds])).toEqual([
      ["2026-09-29T17:00:00", "Leg day", 3600],
      ["2026-10-06T18:30:00", "Push", 2400],
    ]);
    expect(out.workouts[0].notes).toBe("Felt good,\nslept well");
  });

  it("keeps warm-up and drop sets, skips rest timers, and attaches notes", () => {
    const [squat, row] = out.workouts[0].exercises;
    expect(squat.name).toBe("Squat (Barbell)");
    expect(squat.sets.map((s) => [s.kind, s.order, s.weight, s.reps, s.rpe])).toEqual([
      ["warmup", "W", 60, 8, null],
      ["working", "1", 100, 5, 8],
      ["working", "2", 100, 5, 8.5],
      ["drop", "D", 80, 8, null],
    ]);
    expect(squat.sets[2].notes).toBe('last rep "grindy"');
    expect(row.notes).toBe("Damper 5");
    expect(row.sets).toMatchObject([{ distance: 2000, seconds: 480, weight: null }]);
  });
});

describe("parseStrongCsv (legacy)", () => {
  it("reads comma format with per-row units and h/m duration", () => {
    const out = parseStrongCsv(fixture("strong-legacy.csv"));
    expect(out.weightUnit).toBe("lbs");
    expect(out.workouts).toHaveLength(1);
    expect(out.workouts[0].durationSeconds).toBe(3900);
    expect(out.workouts[0].exercises.map((e) => [e.name, e.sets.length])).toEqual([
      ["Deadlift (Barbell)", 2],
      ["Pull Up", 1],
    ]);
  });
});

describe("parseStrongCsv (errors)", () => {
  it("rejects a file that is not a Strong export", () => {
    expect(() => parseStrongCsv("foo,bar\n1,2\n")).toThrow(/Not a Strong export/);
  });

  it("returns nothing for an empty file", () => {
    expect(parseStrongCsv("").workouts).toEqual([]);
  });
});
