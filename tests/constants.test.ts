import { describe, expect, it } from "vitest";
import { CLIENT_BUILD, CLIENT_VERSION, clientHeaders } from "../src/constants.js";

describe("clientHeaders", () => {
  it("defaults to the captured iOS version", () => {
    expect(clientHeaders({})).toMatchObject({
      "X-Client-Version": CLIENT_VERSION,
      "X-Client-Build": CLIENT_BUILD,
      "User-Agent": "Strong iOS",
    });
  });

  it("lets env override version and build, ignoring blanks", () => {
    const h = clientHeaders({ STRONG_CLIENT_VERSION: "6.9.0", STRONG_CLIENT_BUILD: " " });
    expect(h["X-Client-Version"]).toBe("6.9.0");
    expect(h["X-Client-Build"]).toBe(CLIENT_BUILD);
  });
});
