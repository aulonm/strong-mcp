/** Pure training math over working sets. Weights are in whatever unit the caller uses. */

export interface WorkingSet {
  reps: number | null;
  weight: number | null;
}

/** Above this rep count rep-max formulas get unreliable, so no estimate is given. */
export const E1RM_MAX_REPS = 12;

/** Estimated one-rep max via the Epley formula; a single is its own 1RM. */
export function estimateOneRepMax(weight: number | null, reps: number | null): number | null {
  if (weight === null || reps === null || weight <= 0 || reps < 1 || reps > E1RM_MAX_REPS) {
    return null;
  }
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

export interface SessionSets {
  workoutId: string;
  date?: string;
  sets: WorkingSet[];
}

export interface RecordSet {
  workoutId: string;
  date?: string;
  weight: number | null;
  reps: number | null;
}

export interface PersonalRecords {
  heaviestWeight: (RecordSet & { weight: number }) | null;
  bestEstimatedOneRepMax: (RecordSet & { e1rm: number }) | null;
  mostReps: (RecordSet & { reps: number }) | null;
  bestSetVolume: (RecordSet & { volume: number }) | null;
  sessions: number;
}

/**
 * Best sets across sessions. Ties keep the earliest occurrence, since that is
 * when the record was first set. Sessions are expected oldest first.
 */
export function personalRecords(sessions: SessionSets[]): PersonalRecords {
  const out: PersonalRecords = {
    heaviestWeight: null,
    bestEstimatedOneRepMax: null,
    mostReps: null,
    bestSetVolume: null,
    sessions: sessions.length,
  };
  for (const s of sessions) {
    for (const set of s.sets) {
      const base = { workoutId: s.workoutId, date: s.date, weight: set.weight, reps: set.reps };
      if (set.weight !== null && set.weight > (out.heaviestWeight?.weight ?? 0)) {
        out.heaviestWeight = { ...base, weight: set.weight };
      }
      const e1rm = estimateOneRepMax(set.weight, set.reps);
      if (e1rm !== null && e1rm > (out.bestEstimatedOneRepMax?.e1rm ?? 0)) {
        out.bestEstimatedOneRepMax = { ...base, e1rm };
      }
      if (set.reps !== null && set.reps > (out.mostReps?.reps ?? 0)) {
        out.mostReps = { ...base, reps: set.reps };
      }
      if (set.weight !== null && set.reps !== null) {
        const volume = Math.round(set.weight * set.reps * 10) / 10;
        if (volume > (out.bestSetVolume?.volume ?? 0)) out.bestSetVolume = { ...base, volume };
      }
    }
  }
  return out;
}
