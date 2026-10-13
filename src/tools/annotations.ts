import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

/**
 * MCP tool annotations, so clients can tell reads from writes and ask for
 * confirmation before anything that changes the Strong account.
 * Every tool talks to back.strong.app (directly or via sync), hence openWorldHint.
 */

/** Reads the local snapshot (or syncs it); never changes the Strong account. */
export const READ: ToolAnnotations = { readOnlyHint: true, openWorldHint: true };

/** Adds a new entity. Not idempotent: calling twice creates two. */
export const CREATE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

/** Overwrites fields on an existing entity; repeating with the same input is a no-op. */
export const UPDATE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: true,
};

/** Soft-deletes (hides) an entity. Strong has no undo for this in the app. */
export const DELETE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: true,
};
