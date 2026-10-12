import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ReadService } from "../services/read-service.js";
import { READ } from "./annotations.js";

type Deps = { service: ReadService; sync: () => Promise<{ pages: number }> };

const dateRange = {
  since: z
    .string()
    .optional()
    .describe("Only include workouts on or after this ISO date/datetime, e.g. 2026-09-01."),
  until: z
    .string()
    .optional()
    .describe(
      "Only include workouts on or before this ISO date; a bare date covers the whole day.",
    ),
};

const text = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

export function registerReadTools(server: McpServer, deps: Deps): void {
  const { service, sync } = deps;

  server.registerTool(
    "strong_sync",
    {
      annotations: READ,
      description: "Sync the local snapshot from Strong (delta if possible, else full).",
      inputSchema: {},
    },
    async () => {
      const { pages } = await sync();
      return text({ ok: true, pagesWalked: pages });
    },
  );

  server.registerTool(
    "strong_whoami",
    {
      annotations: READ,
      description: "Show the current user id, unit preference, last sync time, and entity counts.",
      inputSchema: {},
    },
    async () => text(service.whoami()),
  );

  server.registerTool(
    "strong_list_workouts",
    {
      annotations: READ,
      description:
        "List recent workouts (newest first); optional limit and since/until date range.",
      inputSchema: { limit: z.number().int().positive().optional(), ...dateRange },
    },
    async (args: { limit?: number; since?: string; until?: string }) =>
      text(service.listWorkouts(args)),
  );

  server.registerTool(
    "strong_get_workout",
    {
      annotations: READ,
      description: "Get one workout in full, with sets in display units.",
      inputSchema: { id: z.string() },
    },
    async (args: { id: string }) => text(service.getWorkout(args.id)),
  );

  server.registerTool(
    "strong_list_templates",
    {
      annotations: READ,
      description: "List saved workout templates.",
      inputSchema: {},
    },
    async () => text(service.listTemplates()),
  );

  server.registerTool(
    "strong_list_exercises",
    {
      annotations: READ,
      description: "List exercise definitions; optional name search.",
      inputSchema: { search: z.string().optional() },
    },
    async (args: { search?: string }) => text(service.listExercises(args.search)),
  );

  server.registerTool(
    "strong_get_exercise_history",
    {
      annotations: READ,
      description:
        "All logged sets for one exercise over time (by exercise id); optional since/until date range.",
      inputSchema: { exerciseId: z.string(), ...dateRange },
    },
    async (args: { exerciseId: string; since?: string; until?: string }) =>
      text(service.getExerciseHistory(args.exerciseId, { since: args.since, until: args.until })),
  );

  server.registerTool(
    "strong_list_measurements",
    {
      annotations: READ,
      description: "List body measurements; optional type filter (e.g. WEIGHT).",
      inputSchema: { type: z.string().optional() },
    },
    async (args: { type?: string }) => text(service.listMeasurements(args.type)),
  );
}
