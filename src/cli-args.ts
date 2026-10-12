export interface ServeArgs {
  transport: "stdio" | "http";
  host: string;
  port: number;
}

/** `strong-mcp [--http] [--host 127.0.0.1] [--port 3000]`. Defaults to stdio. */
export function parseServeArgs(argv: string[]): ServeArgs {
  const out: ServeArgs = { transport: "stdio", host: "127.0.0.1", port: 3000 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${arg} needs a value`);
      return v;
    };
    if (arg === "--http") out.transport = "http";
    else if (arg === "--host") out.host = value();
    else if (arg === "--port") {
      const port = Number(value());
      if (!Number.isInteger(port) || port < 0 || port > 65535) {
        throw new Error(`Invalid --port: ${argv[i]}`);
      }
      out.port = port;
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}
