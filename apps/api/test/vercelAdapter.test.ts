import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { restoreApiRequestUrl } from "../src/services/vercelUrl.js";

afterEach(() => {
  vi.resetModules();
});

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

  it("returns 503 when the Vercel Redis environment is only partially configured", async () => {
    const previous = {
      appEnv: process.env.APP_ENV,
      profile: process.env.DEPLOYMENT_PROFILE,
      storeMode: process.env.STORE_MODE,
      redisUrl: process.env.UPSTASH_REDIS_REST_URL,
      redisToken: process.env.UPSTASH_REDIS_REST_TOKEN
    };
    process.env.APP_ENV = "staging";
    process.env.DEPLOYMENT_PROFILE = "showcase";
    delete process.env.STORE_MODE;
    process.env.UPSTASH_REDIS_REST_URL = "https://example.invalid";
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    try {
      const adapterPath = "../../../api/index.js";
      const { default: handler } = await import(adapterPath) as {
        default: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
      };
      let body = "";
      const response = {
        statusCode: 0,
        setHeader: vi.fn(),
        end: vi.fn((value: string) => {
          body = value;
        })
      } as unknown as ServerResponse;
      await handler({ url: "/api/health" } as IncomingMessage, response);

      expect(response.statusCode).toBe(503);
      expect(JSON.parse(body)).toMatchObject({ error: "SHOWCASE_BOOT_FAILED" });
    } finally {
      restoreEnvironment("APP_ENV", previous.appEnv);
      restoreEnvironment("DEPLOYMENT_PROFILE", previous.profile);
      restoreEnvironment("STORE_MODE", previous.storeMode);
      restoreEnvironment("UPSTASH_REDIS_REST_URL", previous.redisUrl);
      restoreEnvironment("UPSTASH_REDIS_REST_TOKEN", previous.redisToken);
    }
  });
});

function restoreEnvironment(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
