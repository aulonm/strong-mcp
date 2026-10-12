import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { beforeAll, describe, expect, it } from "vitest";
import { registerPrompts } from "../src/prompts.js";
import { registerResources } from "../src/resources.js";

const service = {
  whoami: () => ({ userId: "u", weightUnit: "KILOGRAMS", syncedAt: null, counts: {} }),
  listExercises: () => [{ id: "m1", name: "Squat", cellTypes: ["BARBELL_WEIGHT", "REPS"] }],
  listTemplates: () => [{ id: "t1", name: "Leg day" }],
} as any;

let client: Client;

beforeAll(async () => {
  const server = new McpServer({ name: "test", version: "0" });
  registerResources(server, service);
  registerPrompts(server);
  const [a, b] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "c", version: "0" });
  await Promise.all([server.connect(a), client.connect(b)]);
});

describe("resources", () => {
  it("lists the three snapshot resources", async () => {
    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri).sort()).toEqual([
      "strong://exercises",
      "strong://templates",
      "strong://user",
    ]);
  });

  it("serves exercises as JSON", async () => {
    const res = await client.readResource({ uri: "strong://exercises" });
    expect(res.contents[0].mimeType).toBe("application/json");
    expect(JSON.parse(res.contents[0].text as string)).toEqual(service.listExercises());
  });
});

describe("prompts", () => {
  it("lists both prompts", async () => {
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name).sort()).toEqual(["log-from-template", "weekly-review"]);
  });

  it("weekly-review defaults to 4 weeks and names the summary tool", async () => {
    const res = await client.getPrompt({ name: "weekly-review", arguments: {} });
    const text = (res.messages[0].content as { text: string }).text;
    expect(text).toContain("last 4 weeks");
    expect(text).toContain("strong_training_summary");
  });

  it("log-from-template asks for confirmation before writing", async () => {
    const res = await client.getPrompt({
      name: "log-from-template",
      arguments: { template: "Leg day" },
    });
    const text = (res.messages[0].content as { text: string }).text;
    expect(text).toContain('"Leg day"');
    expect(text).toContain("wait for my confirmation");
  });
});
