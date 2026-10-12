# strong-mcp

An [MCP](https://modelcontextprotocol.io) server for the [Strong](https://www.strong.app) workout app. It gives an MCP client (Claude, etc.) read **and** write access to your Strong data — workouts, templates, exercises, and body measurements — over stdio.

> **Unofficial.** This project is not affiliated with or endorsed by Strong. It talks to Strong's private sync API, reverse-engineered from captured traffic. The two edit/delete shapes marked _inferred_ below were never observed directly and verify themselves against the server after each write. Use at your own risk against your own account.

## How it works

Strong is a **sync-document API**, not a REST API: the client GETs a paginated snapshot of the user document and every write is a `PUT /api/users/{id}` carrying a partial document. strong-mcp mirrors that model:

- **Sync** — pulls the snapshot (delta when possible, full otherwise) and caches it locally as `snapshot.json`.
- **Reads** — served entirely from the local snapshot, so they're instant and offline-friendly.
- **Writes** — serialized one at a time: re-sync → build the minimal change → `PUT` → apply optimistically → persist. A write is only considered landed on an HTTP 2xx; on any error the local snapshot is left untouched.
- **Units** — you speak your account's display unit (pounds by default). Weights are converted to kilograms at the API boundary, since Strong stores everything in kg.

## Requirements

- Node.js ≥ 20
- A Strong account. Sign in once with `strong-mcp login` (below). **Your password is never stored** — login exchanges it for a token pair on the spot, saves only the tokens, and the server refreshes them itself from then on.

## Install

Once published to npm, no clone is needed:

```bash
npx -y @aulonm/strong-mcp login   # sign in once
```

```json
{
  "mcpServers": {
    "strong": { "command": "npx", "args": ["-y", "@aulonm/strong-mcp"] }
  }
}
```

From source:

```bash
npm install
npm run build
```

Releasing: `npm publish` builds first (`prepack`) and ships only `dist/`, the README and the licence.

## Sign in

Run the login command once, in a terminal:

```bash
node dist/index.js login
```

It prompts for your Strong email and password (the password is not echoed), exchanges them for a token pair via `POST /auth/login`, generates a stable `deviceId`, and writes everything to `token.json` (mode `600`) in the data directory. **Your password is never written to disk.** From then on the server reads `token.json` and refreshes the rotating tokens itself — you only need to log in again if the session fully lapses.

If Strong doesn't recognize the `deviceId` (e.g. your first login from this machine), it'll email you a verification code instead of logging in directly. The CLI prompts for that code and completes the challenge automatically — you don't need to do anything in the Strong app itself.

## HTTP transport

stdio is the default. For clients that connect to a URL, run:

```bash
strong-mcp --http                 # http://127.0.0.1:3000/mcp
strong-mcp --http --port 8080
```

- Streamable HTTP, stateless: `POST /mcp`. `GET /health` returns `ok`.
- On loopback, requests with a non-loopback `Host` header are rejected (DNS-rebinding guard).
- Binding to another interface (`--host 0.0.0.0`) requires `STRONG_MCP_HTTP_TOKEN`; clients send `Authorization: Bearer <token>`. You can also set the token on loopback.
- This is for your own machine or network. It holds your Strong session, so don't expose it publicly.

## Read-only CSV mode (no login)

If you'd rather not sign in, or the private API changes, the server can run from a Strong export instead. In the app: **Settings → Export Strong Data**. Then point the server at the file:

```json
{
  "mcpServers": {
    "strong": {
      "command": "node",
      "args": ["/absolute/path/to/strong-mcp/dist/index.js"],
      "env": { "STRONG_CSV_PATH": "/absolute/path/to/strong.csv" }
    }
  }
}
```

All read tools, resources and prompts work. Write tools are not registered. `strong_sync` re-reads the file, so you can drop in a newer export without restarting. The export holds workouts only, so templates and body measurements are empty in this mode. Times are shown as exported (Strong's local wall-clock time).

## Configuration

Once you've logged in, **no secrets are needed** — the server finds `token.json` on its own. The remaining settings are all optional environment variables (see [`.env.example`](.env.example)):

| Variable | Description |
| --- | --- |
| `STRONG_DATA_DIR` | Where `token.json` + `snapshot.json` live. Default: `~/.strong-mcp`. |
| `STRONG_WEIGHT_UNIT` | Force display unit `POUNDS` or `KILOGRAMS`. Default: your account preference. |
| `STRONG_MCP_HTTP_TOKEN` | Bearer token for `--http`; required off loopback. |
| `STRONG_CSV_PATH` | Serve a Strong CSV export read-only instead of the live account. |
| `STRONG_PROXY_URL` | HTTP proxy (e.g. Proxyman at `http://localhost:9090`) for debugging. |

### Bootstrapping from a captured token pair (optional)

Instead of `login`, you can seed a token pair captured with an HTTPS proxy such as [Proxyman](https://proxyman.io) by setting `STRONG_ACCESS_TOKEN`, `STRONG_REFRESH_TOKEN`, and `STRONG_DEVICE_ID` together. They're used only to bootstrap the first `token.json`; after that `token.json` is authoritative.

## Usage

Run over stdio from an MCP client. After you've logged in, the Claude Desktop / Claude Code config holds **no secrets** — just a pointer to the built server:

```json
{
  "mcpServers": {
    "strong": {
      "command": "node",
      "args": ["/absolute/path/to/strong-mcp/dist/index.js"]
    }
  }
}
```

If your `token.json` lives somewhere non-default, add `"env": { "STRONG_DATA_DIR": "/path/to/dir" }`. On startup the server does an initial sync (reported on stderr) and then serves the tools below. If it can't find credentials it exits with `Run \`strong-mcp login\` to sign in`.

## Tools

### Read

| Tool | Description |
| --- | --- |
| `strong_sync` | Sync the local snapshot from Strong (delta if possible, else full). |
| `strong_whoami` | Current user id, unit preference, last sync time, and entity counts. |
| `strong_list_workouts` | List recent workouts (newest first); optional `limit` and `since`/`until`. |
| `strong_get_workout` | One workout in full, with sets in display units. |
| `strong_list_templates` | List saved workout templates. |
| `strong_get_template` | One template with its exercises (ids included) and planned sets. |
| `strong_list_exercises` | List exercise definitions; optional name `search`. |
| `strong_get_exercise_history` | All logged sets for one exercise over time; optional `since`/`until`. |
| `strong_training_summary` | Last 1-12 weeks: workouts, sets and volume per week, top exercises, bodyweight trend. |
| `strong_personal_records` | Heaviest weight, best estimated 1RM, most reps and best set volume per exercise. |
| `strong_list_measurements` | List body measurements; optional `type` filter (e.g. `WEIGHT`). |

### Write

| Tool | Description |
| --- | --- |
| `strong_log_workout` | Log a completed workout (exercises by id or exact name; weights in display unit). |
| `strong_delete_workout` | Soft-delete a logged workout by id. |
| `strong_create_template` | Create a workout template (optional `folderId`, defaults to My Templates). |
| `strong_update_template` | Rename a template by id. |
| `strong_delete_template` | Soft-delete a template by id (also unlinks it from its folder). |
| `strong_log_measurement` | Log a body measurement (`WEIGHT`, `BODY_FAT_PERCENTAGE`, `CALORIC_INTAKE`, …). |
| `strong_create_exercise` | Create a custom exercise definition. |
| `strong_update_exercise` | Rename a custom exercise by id. |
| `strong_archive_exercise` | Archive (soft-delete) a custom exercise by id. |
| `strong_update_workout` | _Inferred._ Edit sets in a logged workout; verifies the edit against the server (`serverConfirmed`). |
| `strong_delete_measurement` | _Inferred._ Soft-delete a body measurement; verifies against the server (`serverConfirmed`). |

Deletes are **soft** (Strong has no hard delete): the entity is flagged `isHidden` rather than removed.

The two _inferred_ tools re-sync server truth after the write and report `serverConfirmed`: `true` (Strong accepted it), `false` (local view is optimistic and unverified — run `strong_sync` to reconcile), or `undefined` (the confirmation re-sync failed; the write itself still succeeded).

### Resources

| URI | Description |
| --- | --- |
| `strong://user` | User id, weight unit, last sync time and entity counts. |
| `strong://exercises` | Every exercise definition with its id and cell types. |
| `strong://templates` | Saved templates (id and name). |

### Prompts

| Prompt | Description |
| --- | --- |
| `weekly-review` | Review the last N weeks (default 4): summary, records, bodyweight. |
| `log-from-template` | Log a finished workout from a template, asking for actual results and confirming before writing. |

## Development

```bash
npm run dev        # run from source via tsx
npm test           # run the vitest suite
npm run typecheck  # tsc --noEmit
npm run lint       # biome check
npm run lint:fix   # biome check --write
npm run build      # compile to dist/
```

CI (GitHub Actions) runs lint → typecheck → test → build on every push and PR to `main`.

Design and implementation notes live under [`docs/`](docs/).

## License

[MIT](LICENSE) © 2026 Justin Rhinesmith
