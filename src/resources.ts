import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ReadService } from "./services/read-service.js";

const json = (uri: URL, data: unknown) => ({
  contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(data) }],
});

/** Read-only context a client can attach without a tool call. Served from the local snapshot. */
export function registerResources(server: McpServer, service: ReadService): void {
  server.registerResource(
    "user",
    "strong://user",
    {
      description: "Strong user id, weight unit, last sync time and entity counts.",
      mimeType: "application/json",
    },
    async (uri) => json(uri, service.whoami()),
  );

  server.registerResource(
    "exercises",
    "strong://exercises",
    {
      description:
        "Every exercise definition (id, name, cell types). Use the ids with write tools.",
      mimeType: "application/json",
    },
    async (uri) => json(uri, service.listExercises()),
  );

  server.registerResource(
    "templates",
    "strong://templates",
    { description: "Saved workout templates (id and name).", mimeType: "application/json" },
    async (uri) => json(uri, service.listTemplates()),
  );
}
