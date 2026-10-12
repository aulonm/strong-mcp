import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { registerReadTools } from "../src/tools/read-tools.js";
import { registerWriteTools } from "../src/tools/write-tools.js";

const skill = readFileSync(new URL("../skills/strong-workouts/SKILL.md", import.meta.url), "utf8");

describe("strong-workouts skill", () => {
  it("only names tools that the server registers", () => {
    const registered = new Set<string>();
    const server = { registerTool: (name: string) => registered.add(name) };
    registerReadTools(server as any, { service: {} as any, sync: vi.fn() });
    registerWriteTools(server as any, {} as any);

    const mentioned = [...new Set(skill.match(/\bstrong_[a-z_]+/g))];
    expect(mentioned.length).toBeGreaterThan(5);
    expect(mentioned.filter((n) => !registered.has(n))).toEqual([]);
  });
});
