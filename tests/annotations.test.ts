import { describe, expect, it, vi } from "vitest";
import { registerReadTools } from "../src/tools/read-tools.js";
import { registerWriteTools } from "../src/tools/write-tools.js";

function collectDefs() {
  const defs: Record<string, any> = {};
  const server = {
    registerTool(name: string, def: any) {
      defs[name] = def;
    },
  };
  registerReadTools(server as any, { service: {} as any, sync: vi.fn() });
  registerWriteTools(server as any, {} as any);
  return defs;
}

describe("tool annotations", () => {
  const defs = collectDefs();

  it("every tool declares annotations", () => {
    for (const [name, def] of Object.entries(defs)) {
      expect(def.annotations, name).toBeDefined();
    }
  });

  it("read tools are read-only", () => {
    const reads = ["strong_sync", "strong_whoami", "strong_list_workouts", "strong_get_workout"];
    for (const name of reads) expect(defs[name].annotations.readOnlyHint, name).toBe(true);
  });

  it("delete and archive tools are destructive", () => {
    const deletes = Object.keys(defs).filter((n) => /_(delete|archive)_/.test(n));
    expect(deletes.length).toBe(4);
    for (const name of deletes) {
      expect(defs[name].annotations.readOnlyHint, name).toBe(false);
      expect(defs[name].annotations.destructiveHint, name).toBe(true);
    }
  });

  it("create tools are neither read-only nor idempotent", () => {
    for (const name of ["strong_log_workout", "strong_create_template", "strong_log_measurement"]) {
      expect(defs[name].annotations.readOnlyHint, name).toBe(false);
      expect(defs[name].annotations.idempotentHint, name).toBe(false);
    }
  });
});
