import { describe, expect, it } from "vitest";
import { restoreApiRequestUrl } from "../src/services/vercelUrl.js";

describe("Vercel API adapter", () => {
  it("restores a one-level API route from the rewrite transport parameter", () => {
    expect(restoreApiRequestUrl("/api?__path=health")).toBe("/api/health");
  });

  it("restores nested routes and preserves public query parameters", () => {
    expect(restoreApiRequestUrl("/api?__path=games/history&gameId=dice"))
      .toBe("/api/games/history?gameId=dice");
  });

  it("leaves direct function requests unchanged", () => {
    expect(restoreApiRequestUrl("/api/health?probe=1")).toBe("/api/health?probe=1");
  });
});
