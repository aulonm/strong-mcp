import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

export interface HttpOptions {
  host: string;
  port: number;
  /** Required unless host is loopback. Clients send `Authorization: Bearer <token>`. */
  token?: string;
  /** Builds a fresh MCP server; the services and snapshot behind it are shared. */
  createServer: () => McpServer;
}

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1"]);

export function isLoopback(host: string): boolean {
  return LOOPBACK.has(host.replace(/^\[|\]$/g, ""));
}

/** Hostname part of a Host header, e.g. "localhost:3000" -> "localhost", "[::1]:3000" -> "::1". */
function hostnameOf(header: string | undefined): string {
  if (!header) return "";
  const v6 = /^\[([^\]]+)\]/.exec(header);
  return v6 ? v6[1] : header.split(":")[0];
}

function bearerMatches(req: IncomingMessage, token: string): boolean {
  const got = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1] ?? "";
  const a = Buffer.from(got);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

function send(res: ServerResponse, status: number, body: string) {
  res.writeHead(status, { "Content-Type": "text/plain" }).end(body);
}

/**
 * Streamable HTTP on /mcp, stateless: each POST gets its own McpServer and
 * transport. GET /health answers "ok". On loopback, requests whose Host
 * header is not loopback are rejected (DNS-rebinding guard); a non-loopback
 * bind requires a bearer token.
 */
export async function startHttpServer(opts: HttpOptions): Promise<Server> {
  const loopback = isLoopback(opts.host);
  if (!loopback && !opts.token) {
    throw new Error(
      `Refusing to listen on ${opts.host} without a token. Set STRONG_MCP_HTTP_TOKEN, or bind to 127.0.0.1.`,
    );
  }

  const server = createServer(async (req, res) => {
    const path = (req.url ?? "/").split("?")[0];
    if (loopback && !isLoopback(hostnameOf(req.headers.host))) {
      return send(res, 403, "Forbidden host");
    }
    if (path === "/health" && req.method === "GET") return send(res, 200, "ok");
    if (path !== "/mcp") return send(res, 404, "Not found");
    if (opts.token && !bearerMatches(req, opts.token)) return send(res, 401, "Unauthorized");
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return send(res, 405, "Method not allowed (stateless server: POST only)");
    }

    const mcp = opts.createServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      void transport.close();
      void mcp.close();
    });
    try {
      await mcp.connect(transport);
      await transport.handleRequest(req, res);
    } catch (err) {
      if (!res.headersSent) send(res, 500, (err as Error).message);
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port, opts.host, () => resolve());
  });
  return server;
}
