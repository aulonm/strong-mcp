import { KG_PER_LB } from "../constants.js";
import type { Entity, Snapshot } from "../types.js";
import type { CsvExport, CsvSet } from "./parse.js";

/**
 * Shape a parsed CSV export like a synced snapshot so the existing read
 * services work on it unchanged.
 *
 * - Weights are converted to kg strings, as Strong stores them.
 * - Distance and seconds become DISTANCE / DURATION cells; the reader passes
 *   these through as otherCells.
 * - Strong exports local wall-clock time without a zone. It is labelled UTC
 *   here, which keeps dates and weekday buckets as they appear in the app.
 * - IDs are derived from content (exercise name, workout date + name), so they
 *   stay stable across re-imports of a newer export.
 */
export function csvToSnapshot(data: CsvExport, userId = "csv"): Snapshot {
  const toKg = (w: number) => (data.weightUnit === "lbs" ? w * KG_PER_LB : w);
  const measurement: Record<string, Entity> = {};
  const log: Record<string, Entity> = {};

  const exerciseId = (name: string) => {
    // Encoded: the reader takes the id from the last "/" segment of the href.
    const id = `csv-ex-${encodeURIComponent(name.toLowerCase())}`;
    measurement[id] ??= {
      id,
      isHidden: false,
      measurementType: "EXERCISE",
      name: { custom: name },
      cellTypeConfigs: [{ cellType: "WEIGHT" }, { cellType: "REPS" }, { cellType: "RPE" }],
    };
    return id;
  };

  const cells = (s: CsvSet) => {
    const out: { cellType: string; value: string }[] = [];
    if (s.weight !== null) out.push({ cellType: "WEIGHT", value: String(toKg(s.weight)) });
    if (s.reps !== null) out.push({ cellType: "REPS", value: String(s.reps) });
    if (s.rpe !== null) out.push({ cellType: "RPE", value: String(s.rpe) });
    if (s.distance !== null) out.push({ cellType: "DISTANCE", value: String(s.distance) });
    if (s.seconds !== null) out.push({ cellType: "DURATION", value: String(s.seconds) });
    return out;
  };

  for (const w of data.workouts) {
    const id = `csv-w:${w.date}:${w.name}`;
    const startMs = Date.parse(`${w.date}Z`);
    if (Number.isNaN(startMs)) continue;
    const startDate = new Date(startMs).toISOString();
    log[id] = {
      id,
      isHidden: false,
      logType: "WORKOUT",
      name: { custom: w.name },
      startDate,
      endDate: w.durationSeconds
        ? new Date(startMs + w.durationSeconds * 1000).toISOString()
        : undefined,
      notes: w.notes,
      _embedded: {
        cellSetGroup: w.exercises.map((ex, gi) => ({
          id: `${id}:g${gi}`,
          notes: ex.notes,
          _links: { measurement: { href: `/csv/measurements/${exerciseId(ex.name)}` } },
          cellSets: ex.sets.map((s, si) => ({
            id: `${id}:g${gi}:s${si}`,
            setKind: s.kind,
            cells: cells(s),
          })),
        })),
      },
    };
  }

  return {
    userId,
    continuation: null,
    syncedAt: new Date().toISOString(),
    preferences: { weightUnit: data.weightUnit === "lbs" ? "POUNDS" : "KILOGRAMS" },
    entities: {
      template: {},
      log,
      measurement,
      measuredValue: {},
      folder: {},
      tag: {},
      metric: {},
      widget: {},
    },
  };
}
