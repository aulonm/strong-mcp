import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { parseStrongCsv } from "../src/csv/parse.js";
import { csvToSnapshot } from "../src/csv/to-snapshot.js";
import { buildCsvServer } from "../src/server.js";
import { ReadService } from "../src/services/read-service.js";

const v6Path = fileURLToPath(new URL("./fixtures/csv/strong-v6.csv", import.meta.url));
const legacyPath = fileURLToPath(new URL("./fixtures/csv/strong-legacy.csv", import.meta.url));

const readerFor = (path: string) => {
  const snapshot = csvToSnapshot(parseStrongCsv(readFileSync(path, "utf8")));
  const unit = snapshot.preferences.weightUnit as "KILOGRAMS" | "POUNDS";
  return new ReadService({ getSnapshot: () => snapshot, getWeightUnit: () => unit, userId: "csv" });
};

describe("csvToSnapshot", () => {
  it("is readable by ReadService: workouts, sets, cardio cells", () => {
    const read = readerFor(v6Path);
    const list = read.listWorkouts();
    expect(list.map((w) => w.name)).toEqual(["Push", "Leg day"]);
    const leg = read.getWorkout(list[1].id)!;
    expect(leg.startDate).toBe("2026-09-29T17:00:00.000Z");
    expect(leg.endDate).toBe("2026-09-29T18:00:00.000Z");
    expect(leg.exercises[0].sets.map((s) => [s.weight, s.reps])).toEqual([
      [60, 8],
      [100, 5],
      [100, 5],
      [80, 8],
    ]);
    expect(leg.exercises[1].sets[0].otherCells).toEqual([
      { cellType: "DISTANCE", value: "2000" },
      { cellType: "DURATION", value: "480" },
    ]);
  });

  it("converts lbs to kg on the way in and back to lb on the way out", () => {
    const read = readerFor(legacyPath);
    const w = read.getWorkout(read.listWorkouts()[0].id)!;
    expect(w.exercises[0].sets[0]).toMatchObject({ weight: 315, unit: "lb" });
  });

  it("gives exercises stable ids that survive names with slashes", () => {
    const snapshot = csvToSnapshot({
      weightUnit: "kg",
      distanceUnit: null,
      workouts: [
        {
          date: "2026-01-01T10:00:00",
          name: "A",
          durationSeconds: null,
          notes: null,
          exercises: [{ name: "Lat Pulldown/Cable", notes: null, sets: [] }],
        },
      ],
    });
    const read = new ReadService({
      getSnapshot: () => snapshot,
      getWeightUnit: () => "KILOGRAMS",
      userId: "csv",
    });
    const [ex] = read.getWorkout("csv-w:2026-01-01T10:00:00:A")!.exercises;
    expect(ex.name).toBe("Lat Pulldown/Cable");
    expect(read.listExercises()[0].id).toBe(ex.exerciseId);
  });
});

describe("buildCsvServer", () => {
  it("serves read tools only and answers a summary from the file", async () => {
    const { server } = await buildCsvServer({ dataDir: "/unused", csvPath: v6Path });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "c", version: "0" });
    await Promise.all([server.connect(a), client.connect(b)]);

    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain("strong_training_summary");
    expect(names.some((n) => /log_|create_|update_|delete_|archive_/.test(n))).toBe(false);

    const res = await client.callTool({ name: "strong_personal_records", arguments: {} });
    const records = JSON.parse((res.content as { text: string }[])[0].text);
    const squat = records.find((r: { name: string }) => r.name === "Squat (Barbell)");
    expect(squat).toMatchObject({ unit: "kg", heaviestWeight: { weight: 100 } });
  });
});
