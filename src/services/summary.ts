import type { ReadService } from "./read-service.js";

const DAY_MS = 86_400_000;

/** Monday 00:00 UTC of the week containing t. */
export function weekStart(t: number): number {
  const d = new Date(t);
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  return midnight - sinceMonday * DAY_MS;
}

const isoDate = (t: number) => new Date(t).toISOString().slice(0, 10);
const round1 = (n: number) => Math.round(n * 10) / 10;

interface WeekBucket {
  weekStart: string;
  workouts: number;
  sets: number;
  volume: number;
}

interface ExerciseTotals {
  exerciseId: string | null;
  name: string;
  sessions: number;
  sets: number;
  volume: number;
}

/**
 * Training overview for the last `weeks` calendar weeks (Monday-based, UTC),
 * including the current partial week. Volume is sum(weight x reps) over sets
 * that have both, in the display unit.
 */
export function trainingSummary(read: ReadService, weeks: number, now: number) {
  const first = weekStart(now) - (weeks - 1) * 7 * DAY_MS;
  const since = new Date(first).toISOString();
  const until = new Date(now).toISOString();

  const buckets: WeekBucket[] = Array.from({ length: weeks }, (_, i) => ({
    weekStart: isoDate(first + i * 7 * DAY_MS),
    workouts: 0,
    sets: 0,
    volume: 0,
  }));
  const exercises = new Map<string, ExerciseTotals>();
  let totalSets = 0;
  let totalVolume = 0;
  let durationMinutes = 0;
  let timedWorkouts = 0;

  const workouts = read.listWorkouts({ since, until });
  for (const row of workouts) {
    const w = read.getWorkout(row.id);
    if (!w?.startDate) continue;
    const start = Date.parse(w.startDate);
    const bucket = buckets[Math.floor((weekStart(start) - first) / (7 * DAY_MS))];
    if (!bucket) continue;
    bucket.workouts++;
    if (w.endDate) {
      const minutes = (Date.parse(w.endDate) - start) / 60_000;
      if (minutes > 0) {
        durationMinutes += minutes;
        timedWorkouts++;
      }
    }
    for (const ex of w.exercises) {
      const key = ex.exerciseId ?? ex.name;
      const totals = exercises.get(key) ?? {
        exerciseId: ex.exerciseId,
        name: ex.name,
        sessions: 0,
        sets: 0,
        volume: 0,
      };
      totals.sessions++;
      for (const set of ex.sets) {
        const volume = set.weight !== null && set.reps !== null ? set.weight * set.reps : 0;
        totals.sets++;
        totals.volume += volume;
        bucket.sets++;
        bucket.volume += volume;
        totalSets++;
        totalVolume += volume;
      }
      exercises.set(key, totals);
    }
  }

  const bodyweight = read
    .listMeasurements("WEIGHT")
    .map((m) => ({ ...m, t: m.date ? Date.parse(m.date) : Number.NaN }))
    .filter((m) => m.t >= first && m.t <= now)
    .sort((a, b) => a.t - b.t);
  const firstBw = bodyweight[0];
  const lastBw = bodyweight[bodyweight.length - 1];
  const lastWorkout = read.listWorkouts({ limit: 1 })[0];

  return {
    range: { since: isoDate(first), until: isoDate(now), weeks },
    unit: read.weightUnitLabel,
    totals: {
      workouts: workouts.length,
      sets: totalSets,
      volume: round1(totalVolume),
      workoutsPerWeek: round1(workouts.length / weeks),
      avgDurationMinutes: timedWorkouts ? Math.round(durationMinutes / timedWorkouts) : null,
    },
    weeks: buckets.map((b) => ({ ...b, volume: round1(b.volume) })),
    topExercises: [...exercises.values()]
      .sort((a, b) => b.sets - a.sets || b.volume - a.volume)
      .slice(0, 10)
      .map((e) => ({ ...e, volume: round1(e.volume) })),
    bodyweight: firstBw
      ? {
          first: { value: firstBw.value, date: firstBw.date },
          last: { value: lastBw.value, date: lastBw.date },
          change: round1(lastBw.value - firstBw.value),
          unit: lastBw.unit,
          entries: bodyweight.length,
        }
      : null,
    daysSinceLastWorkout: lastWorkout?.startDate
      ? Math.floor((now - Date.parse(lastWorkout.startDate)) / DAY_MS)
      : null,
  };
}
