import { request } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseServeArgs } from "../src/cli-args.js";
import { isLoopback, startHttpServer } from "../src/http.js";
import { buildCsvServer } from "../src/server.js";

const csvPath = fileURLToPath(new URL("./fixtures/csv/strong-v6.csv", import.meta.url));
const TOKEN = "test-token-0123456789";

/** Raw request so tests control the Host and Authorization headers. */
function raw(
  port: number,
  opts: { method?: string; path?: string; headers?: Record<string, string> },
) {
  return new Promise<number>((resolve, reject) => {
    const req = request(
      {
        host: "127.0.0.1",
        port,
        method: opts.method ?? "GET",
        path: opts.path ?? "/",
        headers: opts.headers,
      },
      (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      },
    );
    req.on("error", reject);
    req.end();
  });
}

describe("parseServeArgs", () => {
  it("defaults to stdio on loopback:3000", () => {
    expect(parseServeArgs([])).toEqual({ transport: "stdio", host: "127.0.0.1", port: 3000 });
  });
  it("reads --http, --host and --port", () => {
    expect(parseServeArgs(["--http", "--host", "0.0.0.0", "--port", "8080"])).toEqual({
      transport: "http",
      host: "0.0.0.0",
      port: 8080,
    });
  });
  it("rejects bad input", () => {
    expect(() => parseServeArgs(["--port", "x"])).toThrow(/Invalid --port/);
    expect(() => parseServeArgs(["--port"])).toThrow(/needs a value/);
    expect(() => parseServeArgs(["--nope"])).toThrow(/Unknown argument/);
  });
});

describe("isLoopback", () => {
  it("recognises loopback names", () => {
    expect(["127.0.0.1", "localhost", "::1", "[::1]"].every(isLoopback)).toBe(true);
    expect(isLoopback("0.0.0.0")).toBe(false);
  });
});

describe("startHttpServer", () => {
  it("refuses a non-loopback bind without a token", async () => {
    const { createServer } = await buildCsvServer({ dataDir: "/unused", csvPath });
    await expect(startHttpServer({ host: "0.0.0.0", port: 0, createServer })).rejects.toThrow(
      /without a token/,
    );
  });

  describe("with a token on loopback", () => {
    let port: number;
    let close: () => void;

    beforeAll(async () => {
      const { createServer } = await buildCsvServer({ dataDir: "/unused", csvPath });
      const server = await startHttpServer({
        host: "127.0.0.1",
        port: 0,
        token: TOKEN,
        createServer,
      });
      port = (server.address() as AddressInfo).port;
      close = () => server.close();
    });
    afterAll(() => close());

    it("answers health, rejects other paths, methods and missing tokens", async () => {
      expect(await raw(port, { path: "/health" })).toBe(200);
      expect(await raw(port, { path: "/elsewhere" })).toBe(404);
      expect(await raw(port, { method: "POST", path: "/mcp" })).toBe(401);
      expect(await raw(port, { path: "/mcp", headers: { Authorization: `Bearer ${TOKEN}` } })).toBe(
        405,
      );
    });

    it("rejects a non-loopback Host header (DNS rebinding)", async () => {
      expect(await raw(port, { path: "/health", headers: { Host: "evil.example:80" } })).toBe(403);
    });

    it("serves MCP over Streamable HTTP, several requests in a row", async () => {
      const client = new Client({ name: "c", version: "0" });
      await client.connect(
        new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
          requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
        }),
      );
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name)).toContain("strong_training_summary");
      const res = await client.callTool({ name: "strong_list_workouts", arguments: {} });
      const workouts = JSON.parse((res.content as { text: string }[])[0].text);
      expect(workouts.map((w: { name: string }) => w.name)).toEqual(["Push", "Leg day"]);
      await client.close();
    });
  });
});
