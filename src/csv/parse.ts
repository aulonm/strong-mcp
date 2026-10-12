/**
 * Parser for Strong's "Export Strong Data" CSV. Pure: text in, workouts out.
 *
 * Two formats exist:
 *  - v6 (2024+): `;`-delimited; unit lives in the header ("Weight (kg)" /
 *    "Weight (lbs)", "Distance (meters)"); duration in seconds; a
 *    "Workout #" column; rest timers and notes appear as their own rows.
 *  - legacy: `,`-delimited; "Weight Unit"/"Distance Unit" columns; duration
 *    like "1h 5m".
 * Files may start with a UTF-8 BOM and fields may contain quoted newlines.
 */

export type SetKind = "working" | "warmup" | "drop" | "failure";

export interface CsvSet {
  kind: SetKind;
  /** Strong's own "Set Order" value, e.g. "1", "W", "D". */
  order: string;
  weight: number | null;
  reps: number | null;
  rpe: number | null;
  distance: number | null;
  seconds: number | null;
  notes: string | null;
}

export interface CsvExercise {
  name: string;
  sets: CsvSet[];
  notes: string | null;
}

export interface CsvWorkout {
  /** "YYYY-MM-DDTHH:mm:ss", no zone: Strong exports local wall-clock time. */
  date: string;
  name: string;
  durationSeconds: number | null;
  notes: string | null;
  exercises: CsvExercise[];
}

export interface CsvExport {
  weightUnit: "kg" | "lbs" | null;
  distanceUnit: string | null;
  workouts: CsvWorkout[];
}

/** RFC 4180-style split: quoted fields, doubled quotes, newlines inside quotes. */
export function splitCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

const num = (v: string | undefined): number | null => {
  if (v === undefined) return null;
  const t = v.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

const text = (v: string | undefined): string | null => {
  const t = v?.trim();
  return t ? t : null;
};

/** "1h 5m" / "45m" / "30s" (legacy) or plain seconds (v6). */
export function parseDuration(v: string | undefined): number | null {
  const t = v?.trim();
  if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) return Math.round(Number(t));
  const m = /^(?:(\d+)h)?\s*(?:(\d+)m(?:in)?)?\s*(?:(\d+)s)?$/.exec(t);
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

function normalizeDate(v: string): string {
  return v.trim().replace(" ", "T");
}

function setKind(order: string): SetKind | null {
  if (/^\d+$/.test(order)) return "working";
  if (order === "W") return "warmup";
  if (order === "D") return "drop";
  if (order === "F") return "failure";
  return null;
}

export function parseStrongCsv(input: string): CsvExport {
  const body = input.replace(/^﻿/, "");
  const firstLine = body.slice(0, body.search(/\r?\n|$/));
  const delimiter = firstLine.split(";").length > firstLine.split(",").length ? ";" : ",";
  const [header, ...rows] = splitCsv(body, delimiter);
  if (!header) return { weightUnit: null, distanceUnit: null, workouts: [] };

  const cols = header.map((h) => h.trim());
  const find = (re: RegExp) => cols.findIndex((c) => re.test(c));
  const idx = {
    date: find(/^Date$/i),
    workoutName: find(/^Workout Name$/i),
    duration: find(/^(Duration|Workout Duration)/i),
    exercise: find(/^Exercise Name$/i),
    order: find(/^Set Order$/i),
    weight: find(/^Weight( \(|$)/i),
    weightUnit: find(/^Weight Unit$/i),
    reps: find(/^Reps$/i),
    rpe: find(/^RPE$/i),
    distance: find(/^Distance( \(|$)/i),
    distanceUnit: find(/^Distance Unit$/i),
    seconds: find(/^Seconds$/i),
    notes: find(/^Notes$/i),
    workoutNotes: find(/^Workout Notes$/i),
  };
  for (const key of ["date", "workoutName", "exercise", "order"] as const) {
    if (idx[key] < 0) {
      throw new Error(`Not a Strong export: missing "${key}" column (header: ${cols.join(", ")})`);
    }
  }

  const headerUnit = (i: number) => (i >= 0 ? (/\(([^)]+)\)/.exec(cols[i])?.[1] ?? null) : null);
  let weightUnit = headerUnit(idx.weight) as CsvExport["weightUnit"];
  let distanceUnit = headerUnit(idx.distance);

  const workouts = new Map<string, CsvWorkout>();
  for (const r of rows) {
    const at = (i: number) => (i >= 0 ? r[i] : undefined);
    const date = normalizeDate(at(idx.date) ?? "");
    const name = (at(idx.workoutName) ?? "").trim();
    const key = `${date}\u0000${name}`;
    let w = workouts.get(key);
    if (!w) {
      w = {
        date,
        name,
        durationSeconds: parseDuration(at(idx.duration)),
        notes: text(at(idx.workoutNotes)),
        exercises: [],
      };
      workouts.set(key, w);
    }
    const exName = (at(idx.exercise) ?? "").trim();
    let ex = w.exercises[w.exercises.length - 1];
    if (!ex || ex.name !== exName) {
      ex = { name: exName, sets: [], notes: null };
      w.exercises.push(ex);
    }
    const order = (at(idx.order) ?? "").trim();
    if (order === "Note") {
      ex.notes = text(at(idx.notes));
      continue;
    }
    const kind = setKind(order);
    if (!kind) continue; // "Rest Timer" rows and anything unrecognised
    if (!weightUnit) weightUnit = (text(at(idx.weightUnit)) as CsvExport["weightUnit"]) ?? null;
    if (!distanceUnit) distanceUnit = text(at(idx.distanceUnit));
    ex.sets.push({
      kind,
      order,
      weight: num(at(idx.weight)),
      reps: num(at(idx.reps)),
      rpe: num(at(idx.rpe)),
      distance: num(at(idx.distance)),
      seconds: num(at(idx.seconds)),
      notes: text(at(idx.notes)),
    });
  }
  return { weightUnit, distanceUnit, workouts: [...workouts.values()] };
}
