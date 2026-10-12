export interface CheckTarget {
  mode: "live" | "csv";
  sync: () => Promise<{ pages: number }>;
  whoami: () => { weightUnit: string; syncedAt: string | null; counts: Record<string, number> };
}

/** Turn a failure into a next step the user can act on. */
export function hintFor(message: string): string {
  if (/credentials|login|token refresh failed|refresh HTTP 4\d\d|HTTP 401/i.test(message)) {
    return "Your session has expired or was never set up. Run `strong-mcp login`.";
  }
  if (/HTTP (400|403|426)/.test(message)) {
    return (
      "Strong refused the request. If it is rejecting the app version, set " +
      "STRONG_CLIENT_VERSION / STRONG_CLIENT_BUILD to a current release."
    );
  }
  if (/HTTP 429|HTTP 5\d\d/.test(message))
    return "Strong is busy or rate limiting. Try again later.";
  if (/ENOENT/.test(message)) return "The file in STRONG_CSV_PATH was not found.";
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT/.test(message)) {
    return "Could not reach Strong. Check your network connection.";
  }
  return "Unexpected error. Run with STRONG_PROXY_URL to inspect traffic, or open an issue.";
}

/**
 * One-shot health check: sync, then report what the snapshot holds. Returns
 * the lines to print and whether everything worked, so the CLI can set its
 * exit code. Never prints tokens.
 */
export async function runCheck(target: CheckTarget): Promise<{ ok: boolean; lines: string[] }> {
  try {
    const { pages } = await target.sync();
    const who = target.whoami();
    const c = who.counts;
    return {
      ok: true,
      lines: [
        `ok: ${target.mode === "csv" ? "read CSV export" : `synced ${pages} page(s) from Strong`}`,
        `unit: ${who.weightUnit}`,
        `workouts: ${c.log ?? 0}, templates: ${c.template ?? 0}, exercises: ${c.measurement ?? 0}, body measurements: ${c.measuredValue ?? 0}`,
      ],
    };
  } catch (err) {
    const message = (err as Error).message;
    return { ok: false, lines: [`failed: ${message}`, `next step: ${hintFor(message)}`] };
  }
}
