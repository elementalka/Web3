import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../apps/api/src/server.js";
import { Store } from "../apps/api/src/store.js";
import { restoreApiRequestUrl } from "../apps/api/src/services/vercelUrl.js";

const SHOWCASE_PROFILES = new Set(["showcase", "staging"]);
const PRODUCTION_ENVIRONMENT_REQUIREMENTS = [
  "DATABASE_URL",
  "TELEGRAM_BOT_TOKEN",
  "WEB_ORIGIN",
  "EVM_RPC_URL",
  "EVM_CHAIN_ID",
  "USDC_CONTRACT_ADDRESS",
  "TREASURY_SIGNER_SECRET"
] as const;

let appPromise: Promise<FastifyInstance> | undefined;

function deploymentProfile(): string {
  return process.env.DEPLOYMENT_PROFILE?.trim().toLowerCase() || "showcase";
}

function productionWasRequested(): boolean {
  return deploymentProfile() === "production"
    || process.env.APP_ENV?.trim().toLowerCase() === "production";
}

function writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

function productionGate(response: ServerResponse): void {
  const missingEnvironment = PRODUCTION_ENVIRONMENT_REQUIREMENTS.filter(
    (name) => !process.env[name]?.trim()
  );

  writeJson(response, 503, {
    error: "PRODUCTION_PROFILE_NOT_AVAILABLE",
    message: "This repository is configured for a test-funds showcase only. Real-money production is blocked until durable Postgres persistence, audited EVM payments and production authentication controls are implemented.",
    missingEnvironment,
    requiredIntegrations: [
      "Postgres-backed Store with migrations and backups",
      "audited EVM deposit indexer and withdrawal signer",
      "real admin TOTP/WebAuthn and IP allowlist",
      "KYC/AML/geo-blocking selected for the launch jurisdiction",
      "external security and smart-contract audits"
    ]
  });
}

async function createShowcaseApp(): Promise<FastifyInstance> {
  const profile = deploymentProfile();
  if (!SHOWCASE_PROFILES.has(profile)) {
    throw new Error(`Unsupported DEPLOYMENT_PROFILE: ${profile}`);
  }

  // A Vercel "Production" deployment may still host this showcase. APP_ENV stays
  // staging so the UI and API cannot be mistaken for the real-money profile.
  process.env.APP_ENV = "staging";
  process.env.DEMO_AUTH_ENABLED ??= "true";
  process.env.SANDBOX_TOOLS_ENABLED ??= "true";
  process.env.MOCK_PAYMENTS_ENABLED ??= "true";
  process.env.SHOWCASE_STATELESS_SESSIONS = "true";

  const dataFile = process.env.SHOWCASE_DATA_FILE?.trim()
    || path.join(tmpdir(), "web3-casino-showcase.json");
  const store = new Store(dataFile);

  const app = await buildServer(store);

  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("Cache-Control", "no-store");
    reply.header("X-Deployment-Profile", "showcase-test-funds");
    return payload;
  });

  await app.ready();
  return app;
}

function getShowcaseApp(): Promise<FastifyInstance> {
  appPromise ??= createShowcaseApp();
  return appPromise;
}

export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  request.url = restoreApiRequestUrl(request.url);

  if (productionWasRequested()) {
    productionGate(response);
    return;
  }

  try {
    const app = await getShowcaseApp();
    app.server.emit("request", request, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The showcase API could not start";
    const statusCode = message.toLowerCase().includes("not configured securely") ? 503 : 500;
    writeJson(response, statusCode, {
      error: "SHOWCASE_BOOT_FAILED",
      message
    });
  }
}
