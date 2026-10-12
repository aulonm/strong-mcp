#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { fetch } from "undici";
import { makeTtyPrompts, runLogin } from "./auth/login-command.js";
import type { FetchLikeWithHeaders } from "./auth/mfa.js";
import { TokenStore } from "./auth/token-store.js";
import { type CheckTarget, runCheck } from "./check.js";
import { parseServeArgs } from "./cli-args.js";
import { loadConfig } from "./config.js";
import type { FetchLike } from "./http/client.js";
import { startHttpServer } from "./http.js";
import { type BuiltServer, buildCsvServer, buildServer } from "./server.js";

async function runLoginCommand() {
  const config = loadConfig(process.env);
  // Reuse a prior deviceId if token.json is readable. A corrupt token.json must
  // NOT brick the command meant to repair it — fall back to minting a fresh id.
  let existingDeviceId: string | undefined;
  try {
    existingDeviceId = (await new TokenStore(config.dataDir).read())?.deviceId;
  } catch {
    existingDeviceId = undefined;
  }
  await runLogin({
    fetchImpl: fetch as unknown as FetchLikeWithHeaders,
    dataDir: config.dataDir,
    prompts: makeTtyPrompts(),
    existingDeviceId,
    // Deliberately NOT routed through STRONG_PROXY_URL: that is a TLS-terminating
    // debug proxy (Proxyman) and would expose the plaintext password. Login always
    // goes straight to Strong.
  });
}

async function runServer() {
  const args = parseServeArgs(process.argv.slice(2));
  const config = loadConfig(process.env);
  let built: BuiltServer;
  if (config.csvPath) {
    built = await buildCsvServer({ ...config, csvPath: config.csvPath });
    process.stderr.write(`strong-mcp: read-only CSV mode (${config.csvPath})\n`);
  } else {
    built = await buildServer(config, fetch as unknown as FetchLike);
    try {
      const { pages } = await built.sync();
      process.stderr.write(`strong-mcp: initial sync walked ${pages} page(s)\n`);
    } catch (err) {
      process.stderr.write(`strong-mcp: initial sync failed: ${(err as Error).message}\n`);
    }
  }
  if (args.transport === "http") {
    await startHttpServer({ ...args, token: config.httpToken, createServer: built.createServer });
    process.stderr.write(`strong-mcp: listening on http://${args.host}:${args.port}/mcp\n`);
    return;
  }
  await built.server.connect(new StdioServerTransport());
}

async function runCheckCommand() {
  const config = loadConfig(process.env);
  const target: CheckTarget = await (config.csvPath
    ? buildCsvServer({ ...config, csvPath: config.csvPath })
    : buildServer(config, fetch as unknown as FetchLike)
  ).then(
    (built) => ({ mode: config.csvPath ? "csv" : "live", ...built }),
    // Missing credentials or an unreadable CSV are reported like a failed sync.
    (err: Error) => ({ mode: "live", sync: () => Promise.reject(err), whoami: () => never() }),
  );
  const result = await runCheck(target);
  for (const line of result.lines) process.stdout.write(`${line}\n`);
  process.exit(result.ok ? 0 : 1);
}

function never(): never {
  throw new Error("unreachable");
}

async function main() {
  if (process.argv[2] === "check") {
    await runCheckCommand();
  }
  if (process.argv[2] === "login") {
    await runLoginCommand();
    process.exit(0); // the TTY readline keeps stdin ref'd; exit explicitly
  }
  await runServer();
}

main().catch((err) => {
  process.stderr.write(`strong-mcp fatal: ${(err as Error).message}\n`);
  process.exit(1);
});
