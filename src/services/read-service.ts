import { personalRecords } from "../analytics.js";
import type { Entity, Snapshot } from "../types.js";
import { formatKg, formatLb, toDisplayMeasuredValue, type WeightUnit } from "../units.js";

interface Options {
  getSnapshot: () => Snapshot;
  getWeightUnit: () => WeightUnit;
  userId: string;
}

const WEIGHT_CELL_TYPES = new Set([
  "DUMBBELL_WEIGHT",
  "BARBELL_WEIGHT",
  "WEIGHTED_BODYWEIGHT",
  "WEIGHT",
]);

function customName(e: Entity): string {
  const n = e.name as { custom?: string; en?: string } | undefined;
  return n?.custom ?? n?.en ?? "";
}

function measurementIdOf(group: any): string | null {
  const href = group?._links?.measurement?.href;
  if (typeof href !== "string") return null;
  return href.split("/").pop() ?? null;
}

export interface DateRange {
  /** Inclusive lower bound, ISO date or datetime (e.g. "2026-09-01"). */
  since?: string;
  /** Inclusive upper bound. A bare date ("2026-09-30") covers that whole day. */
  until?: string;
}

/** Bare YYYY-MM-DD `until` means end of that day, not midnight at its start. */
function untilBound(until: string): number {
  return /^\d{4}-\d{2}-\d{2}$/.test(until)
    ? Date.parse(`${until}T23:59:59.999Z`)
    : Date.parse(until);
}

function inRange(date: string | undefined, range?: DateRange): boolean {
  if (!range?.since && !range?.until) return true;
  if (!date) return false;
  const t = Date.parse(date);
  if (Number.isNaN(t)) return false;
  if (range.since && t < Date.parse(range.since)) return false;
  if (range.until && t > untilBound(range.until)) return false;
  return true;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

export class ReadService {
  constructor(private readonly opts: Options) {}
  private get snap() {
    return this.opts.getSnapshot();
  }

  private displayWeightKg(kg: number): number {
    return this.opts.getWeightUnit() === "KILOGRAMS" ? formatKg(kg) : formatLb(kg);
  }
  get weightUnitLabel(): string {
    return this.opts.getWeightUnit() === "KILOGRAMS" ? "kg" : "lb";
  }

  private visible(map: Record<string, Entity>): Entity[] {
    return Object.values(map).filter((e) => e.isHidden !== true);
  }

  whoami() {
    const s = this.snap;
    const counts: Record<string, number> = {};
    for (const [name, map] of Object.entries(s.entities)) {
      counts[name] = this.visible(map as Record<string, Entity>).length;
    }
    return {
      userId: this.opts.userId,
      weightUnit: this.opts.getWeightUnit(),
      syncedAt: s.syncedAt,
      counts,
    };
  }

  private groups(log: Entity): any[] {
    const g = (log._embedded as any)?.cellSetGroup;
    return Array.isArray(g) ? g : [];
  }

  /** Extracts working sets (weight/reps/rpe) for one exercise group, skipping REST_TIMER-only cellSets. */
  private setsOf(group: any): {
    reps: number | null;
    weight: number | null;
    unit: string;
    rpe: number | null;
    otherCells?: { cellType: string; value: unknown }[];
  }[] {
    const cellSets = Array.isArray(group?.cellSets) ? group.cellSets : [];
    const out: any[] = [];
    for (const cs of cellSets) {
      if (cs?.isHidden === true) continue;
      const cells = Array.isArray(cs?.cells) ? cs.cells : [];
      const isRestOnly = cells.length > 0 && cells.every((c: any) => c.cellType === "REST_TIMER");
      if (isRestOnly) continue;
      let reps: number | null = null;
      let weight: number | null = null;
      let rpe: number | null = null;
      // Cell types we don't model yet (cardio distance/time, etc.) are passed
      // through raw rather than silently dropped. Values are as stored by Strong.
      const otherCells: { cellType: string; value: unknown }[] = [];
      for (const c of cells) {
        if (c.cellType === "REPS") reps = num(c.value);
        else if (c.cellType === "RPE") rpe = num(c.value);
        else if (WEIGHT_CELL_TYPES.has(c.cellType)) {
          const kg = num(c.value);
          weight = kg === null ? null : this.displayWeightKg(kg);
        } else if (c.isHidden !== true && c.value !== null && c.value !== undefined) {
          otherCells.push({ cellType: String(c.cellType), value: c.value });
        }
      }
      const set = { reps, weight, unit: this.weightUnitLabel, rpe };
      out.push(otherCells.length ? { ...set, otherCells } : set);
    }
    return out;
  }

  private exerciseName(measurementId: string | null): string {
    if (!measurementId) return "Unknown";
    const m = this.snap.entities.measurement[measurementId];
    return m ? customName(m) : "Unknown";
  }

  listWorkouts(opts?: { limit?: number } & DateRange) {
    const rows = this.visible(this.snap.entities.log)
      .filter((w) => inRange(w.startDate as string | undefined, opts))
      .map((w) => ({
        id: w.id,
        name: customName(w),
        startDate: w.startDate as string | undefined,
        exerciseCount: this.groups(w).length,
      }))
      .sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? ""));
    return opts?.limit ? rows.slice(0, opts.limit) : rows;
  }

  getWorkout(id: string) {
    const w = this.snap.entities.log[id];
    if (!w || w.isHidden === true) return null;
    return {
      id: w.id,
      name: customName(w),
      startDate: w.startDate as string | undefined,
      endDate: w.endDate as string | undefined,
      exercises: this.exercisesOf(w),
    };
  }

  /** Exercises in a log or template, with the definition id needed by the write tools. */
  private exercisesOf(entity: Entity) {
    return this.groups(entity).map((g) => {
      const exerciseId = measurementIdOf(g);
      return { exerciseId, name: this.exerciseName(exerciseId), sets: this.setsOf(g) };
    });
  }

  getTemplate(id: string) {
    const t = this.snap.entities.template[id];
    if (!t || t.isHidden === true) return null;
    return { id: t.id, name: customName(t), exercises: this.exercisesOf(t) };
  }

  listTemplates() {
    return this.visible(this.snap.entities.template).map((t) => ({
      id: t.id,
      name: customName(t),
    }));
  }

  listExercises(search?: string) {
    const q = search?.toLowerCase();
    return this.visible(this.snap.entities.measurement)
      .filter((m) => m.measurementType === "EXERCISE")
      .map((m) => ({
        id: m.id,
        name: customName(m),
        cellTypes: (Array.isArray(m.cellTypeConfigs) ? (m.cellTypeConfigs as any[]) : []).map(
          (c) => c.cellType,
        ),
      }))
      .filter((m) => !q || m.name.toLowerCase().includes(q));
  }

  getExerciseHistory(exerciseId: string, range?: DateRange) {
    const out: {
      workoutId: string;
      date?: string;
      sets: { reps: number | null; weight: number | null; unit: string }[];
    }[] = [];
    for (const w of this.visible(this.snap.entities.log)) {
      if (!inRange(w.startDate as string | undefined, range)) continue;
      for (const g of this.groups(w)) {
        if (measurementIdOf(g) !== exerciseId) continue;
        out.push({
          workoutId: w.id,
          date: w.startDate as string | undefined,
          sets: this.setsOf(g).map(({ reps, weight, unit }) => ({ reps, weight, unit })),
        });
      }
    }
    return out.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  }

  /**
   * Personal records for one exercise, or for every exercise that has logged
   * sets when exerciseId is omitted. Weights are in the display unit.
   */
  personalRecords(exerciseId?: string, range?: DateRange) {
    const ids = exerciseId ? [exerciseId] : this.loggedExerciseIds(range);
    return ids
      .map((id) => ({
        exerciseId: id,
        name: this.exerciseName(id),
        unit: this.weightUnitLabel,
        ...personalRecords(this.getExerciseHistory(id, range)),
      }))
      .filter((r) => r.sessions > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private loggedExerciseIds(range?: DateRange): string[] {
    const ids = new Set<string>();
    for (const w of this.visible(this.snap.entities.log)) {
      if (!inRange(w.startDate as string | undefined, range)) continue;
      for (const g of this.groups(w)) {
        const id = measurementIdOf(g);
        if (id) ids.add(id);
      }
    }
    return [...ids];
  }

  listMeasurements(type?: string) {
    return this.visible(this.snap.entities.measuredValue)
      .filter((v) => !type || v.measurementTypeValue === type)
      .map((v) => {
        const t = String(v.measurementTypeValue);
        const { value, unit } = toDisplayMeasuredValue(
          t,
          Number(v.value),
          this.opts.getWeightUnit(),
        );
        return { id: v.id, type: t, value, unit, date: v.startDate as string | undefined };
      });
  }
}
