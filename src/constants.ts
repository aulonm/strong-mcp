export const BASE_URL = "https://back.strong.app";
export const KG_PER_LB = 0.45359237;
// Strong's API rejects anything above 200 with "Limit must be between 1 and
// 200." (verified live 2026-09-18) — this was 300 pre-launch and no longer works.
export const SYNC_LIMIT = 200;

export const COLLECTIONS = [
  "template",
  "log",
  "measurement",
  "widget",
  "tag",
  "folder",
  "metric",
  "measuredValue",
] as const;

export const SYNC_INCLUDE = COLLECTIONS.map((c) => `include=${c}`).join("&");

export const CLIENT_VERSION = "6.4.2";
export const CLIENT_BUILD = "8332";

/**
 * Headers that identify us as the Strong iOS app. Strong may start rejecting
 * an old app version at any time; when that happens, set STRONG_CLIENT_VERSION
 * and STRONG_CLIENT_BUILD to a current release instead of waiting for a code
 * change.
 */
export function clientHeaders(env: NodeJS.ProcessEnv): Record<string, string> {
  return {
    "X-Client-Platform": "ios",
    "X-Client-Version": env.STRONG_CLIENT_VERSION?.trim() || CLIENT_VERSION,
    "X-Client-Build": env.STRONG_CLIENT_BUILD?.trim() || CLIENT_BUILD,
    "User-Agent": "Strong iOS",
    Accept: "application/json",
  };
}

export const CLIENT_HEADERS: Record<string, string> = clientHeaders(process.env);
