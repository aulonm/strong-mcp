import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const user = (text: string) => ({
  messages: [{ role: "user" as const, content: { type: "text" as const, text } }],
});

/** Ready-made workflows that steer the model to the right tools in the right order. */
export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "weekly-review",
    {
      title: "Training review",
      description: "Review recent training: consistency, volume, records and bodyweight.",
      argsSchema: { weeks: z.string().optional().describe("Number of weeks, 1-12. Default 4.") },
    },
    ({ weeks }) =>
      user(
        `Review my Strong training for the last ${weeks || "4"} weeks.\n` +
          "1. Call strong_sync, then strong_training_summary with that number of weeks.\n" +
          "2. Call strong_personal_records with since set to the summary's range.since.\n" +
          "3. Report workouts per week, gaps, the most trained exercises, any new records " +
          "and the bodyweight trend. Cite workout dates. Keep observations separate from " +
          "recommendations.",
      ),
  );

  server.registerPrompt(
    "log-from-template",
    {
      title: "Log a workout from a template",
      description: "Log a completed workout based on a saved template, asking for actual results.",
      argsSchema: {
        template: z.string().describe("Template name or id."),
      },
    },
    ({ template }) =>
      user(
        `I just finished a workout based on my "${template}" template.\n` +
          "1. Find it with strong_list_templates, then load it with strong_get_template.\n" +
          "2. Show me the exercises and planned sets, and ask me for the reps and weight I " +
          "actually did. Do not guess any numbers.\n" +
          "3. Summarise what you are about to write and wait for my confirmation.\n" +
          "4. Then call strong_log_workout with the template id and the exerciseIds from " +
          "the template.",
      ),
  );
}
