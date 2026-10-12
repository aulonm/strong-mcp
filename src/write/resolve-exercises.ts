import type { Entity, Snapshot } from "../types.js";
import type { BuildLogInput, ExerciseInput, SetInput } from "./log-builder.js";

/** An exercise in a write request, referenced by definition id or by exact name. */
export interface ExerciseRef {
  exerciseId?: string;
  exercise?: string;
  sets: SetInput[];
}

export type LogInputWithRefs = Omit<BuildLogInput, "exercises"> & { exercises: ExerciseRef[] };

function displayName(e: Entity): string {
  const n = e.name as { custom?: string; en?: string } | undefined;
  return n?.custom ?? n?.en ?? "";
}

function exerciseDefinitions(snapshot: Snapshot): Entity[] {
  return Object.values(snapshot.entities.measurement).filter(
    (m) => m.isHidden !== true && m.measurementType === "EXERCISE",
  );
}

/**
 * Resolve a name to a single exercise definition id: case-insensitive exact
 * match only. Never guesses; zero or several matches is an error that lists
 * the candidates so the caller can pick an id.
 */
export function resolveExerciseName(snapshot: Snapshot, name: string): string {
  const q = name.trim().toLowerCase();
  const defs = exerciseDefinitions(snapshot);
  const exact = defs.filter((m) => displayName(m).trim().toLowerCase() === q);
  if (exact.length === 1) return exact[0].id;
  if (exact.length > 1) {
    const ids = exact.map((m) => m.id).join(", ");
    throw new Error(
      `Exercise name "${name}" is ambiguous; pass exerciseId instead (one of: ${ids})`,
    );
  }
  const close = defs
    .filter((m) => displayName(m).toLowerCase().includes(q))
    .slice(0, 5)
    .map((m) => `"${displayName(m)}" (${m.id})`);
  throw new Error(
    `No exercise named "${name}".` +
      (close.length
        ? ` Did you mean: ${close.join(", ")}?`
        : " Use strong_list_exercises to search."),
  );
}

export function resolveExercises(input: LogInputWithRefs, snapshot: Snapshot): BuildLogInput {
  const exercises: ExerciseInput[] = input.exercises.map((ex, i) => {
    if (ex.exerciseId) return { exerciseId: ex.exerciseId, sets: ex.sets };
    if (ex.exercise)
      return { exerciseId: resolveExerciseName(snapshot, ex.exercise), sets: ex.sets };
    throw new Error(`Exercise #${i + 1} needs either exerciseId or exercise (name)`);
  });
  return { ...input, exercises };
}
