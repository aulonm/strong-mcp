import { describe, expect, it } from "vitest";
import { hintFor, runCheck } from "../src/check.js";

const whoami = () => ({
  weightUnit: "KILOGRAMS",
  syncedAt: null,
  counts: { log: 12, template: 3, measurement: 40, measuredValue: 5 },
});

describe("runCheck", () => {
  it("reports counts after a successful sync", async () => {
    const out = await runCheck({ mode: "live", sync: async () => ({ pages: 2 }), whoami });
    expect(out.ok).toBe(true);
    expect(out.lines).toEqual([
      "ok: synced 2 page(s) from Strong",
      "unit: KILOGRAMS",
      "workouts: 12, templates: 3, exercises: 40, body measurements: 5",
    ]);
  });

  it("reports a failure with a next step", async () => {
    const sync = async () => {
      throw new Error("GET /api/users/u/ → HTTP 403");
    };
    const out = await runCheck({ mode: "live", sync, whoami });
    expect(out.ok).toBe(false);
    expect(out.lines[0]).toBe("failed: GET /api/users/u/ → HTTP 403");
    expect(out.lines[1]).toMatch(/STRONG_CLIENT_VERSION/);
  });
});

describe("hintFor", () => {
  it.each([
    ["No Strong credentials found. Run `strong-mcp login`", /strong-mcp login/],
    ["Strong token refresh failed — re-seed (underlying: refresh HTTP 401)", /strong-mcp login/],
    ["GET /api/users/u/ → HTTP 426", /STRONG_CLIENT_VERSION/],
    ["GET /api/users/u/ → HTTP 429", /Try again later/],
    ["ENOENT: no such file or directory, open '/x.csv'", /STRONG_CSV_PATH/],
    ["GET /api/users/u/ failed: fetch failed", /network/],
    ["something new", /Unexpected error/],
  ])("%s", (message, hint) => {
    expect(hintFor(message)).toMatch(hint);
  });
});
