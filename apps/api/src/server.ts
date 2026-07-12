import "dotenv/config";
import { pathToFileURL } from "node:url";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { ZodError } from "zod";
import { Store } from "./store";
import { registerAuthRoutes } from "./routes/authRoutes";
import { registerUserRoutes } from "./routes/userRoutes";
import { registerGameRoutes } from "./routes/gameRoutes";
import { registerAdminRoutes } from "./routes/adminRoutes";
import { registerSandboxRoutes } from "./routes/sandboxRoutes";
import { registerTelegramRoutes } from "./routes/telegramRoutes";

export async function buildServer(store = new Store()) {
  const app = Fastify({ logger: true });
  const allowedOrigins = corsOrigins();

  await app.register(cors, {
    origin: allowedOrigins.length > 0 ? allowedOrigins : false,
    credentials: allowedOrigins.length > 0
  });

  await app.register(rateLimit, {
    global: true,
    max: 240,
    timeWindow: "1 minute",
    keyGenerator: (request) => {
      const bearer = request.headers.authorization;
      if (bearer?.startsWith("Bearer ")) return `session:${bearer.slice(7)}`;
      const forwarded = process.env.VERCEL ? request.headers["x-forwarded-for"] : undefined;
      const firstAddress = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0];
      return firstAddress?.trim() || request.ip;
    },
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      errorCode: "RATE_LIMITED",
      message: "Rate limit exceeded. Try again shortly.",
      retryAfterMs: context.ttl
    })
  });

  app.get("/api/health", async () => ({
    ok: true,
    appEnv: process.env.APP_ENV ?? "development",
    telegramConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    telegramWebAppConfigured: Boolean(process.env.TELEGRAM_WEBAPP_URL),
    telegramWebhookConfigured: Boolean(process.env.TELEGRAM_WEBHOOK_URL),
    demoAuthEnabled: process.env.APP_ENV !== "production" && process.env.DEMO_AUTH_ENABLED !== "false",
    storeMode: store.mode,
    sandboxEnabled: process.env.APP_ENV !== "production" && process.env.SANDBOX_TOOLS_ENABLED === "true",
    time: new Date().toISOString()
  }));

  await registerAuthRoutes(app, store);
  await registerUserRoutes(app, store);
  await registerGameRoutes(app, store);
  await registerAdminRoutes(app, store);
  await registerTelegramRoutes(app, store);

  if (process.env.APP_ENV !== "production" && process.env.SANDBOX_TOOLS_ENABLED === "true") {
    await registerSandboxRoutes(app, store);
  }

  app.setErrorHandler((error: Error, request, reply) => {
    const statusCode = statusForError(error);
    const isProduction = process.env.APP_ENV === "production";
    const message = isProduction && statusCode >= 500
      ? statusCode === 503 ? "Service is not configured" : "Internal server error"
      : error.message;
    reply.status(statusCode).send({
      errorCode: errorCodeFor(statusCode, error),
      message,
      details: !isProduction && error instanceof ZodError ? error.issues : undefined,
      requestId: request.id,
      timestamp: new Date().toISOString()
    });
  });

  return app;
}

function corsOrigins(): string[] {
  const configured = process.env.WEB_ORIGIN
    ?.split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);
  if (configured?.length) return configured;
  if (process.env.APP_ENV === "production") return [];
  return ["http://localhost:5173", "http://127.0.0.1:5173"];
}

function statusForError(error: Error): number {
  const explicitStatus = (error as Error & { statusCode?: number }).statusCode;
  if (explicitStatus === 429) return 429;
  if (error instanceof ZodError) return 400;
  const message = error.message.toLowerCase();
  if (message.includes("not configured securely")) return 503;
  if (
    message.includes("missing bearer") ||
    message.includes("session expired") ||
    message.includes("signature is invalid") ||
    message.includes("nonce expired") ||
    message.includes("telegram auth") ||
    message.includes("initdata")
  ) return 401;
  if (
    message.includes("permission") ||
    message.includes("2fa") ||
    message.includes("self-exclusion") ||
    message.includes("account is blocked") ||
    message.includes("responsible gambling lock")
  ) return 403;
  if (message.includes("not found")) return 404;
  if (
    message.includes("independent approver") ||
    message.includes("already") ||
    message.includes("cannot be revealed") ||
    message.includes("not been revealed") ||
    message.includes("pending review")
  ) return 409;
  if (
    message.includes("limit") ||
    message.includes("minimum bet") ||
    message.includes("exceeds") ||
    message.includes("insufficient") ||
    message.includes("must be positive") ||
    message.includes("idempotencykey") ||
    message.includes("open at least") ||
    message.includes("would make user balance negative") ||
    message.includes("invalid address") ||
    message.includes("bad address checksum") ||
    message.includes("outside the") ||
    message.includes("unknown signal") ||
    message.includes("locked until") ||
    message.includes("unavailable") ||
    message.includes("disabled")
  ) return 422;
  return 500;
}

function errorCodeFor(statusCode: number, error: Error): string {
  if (error instanceof ZodError) return "VALIDATION_ERROR";
  return ({
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    429: "RATE_LIMITED",
    422: "BUSINESS_RULE_VIOLATION",
    503: "SERVICE_MISCONFIGURED"
  } as Record<number, string>)[statusCode] ?? "INTERNAL_ERROR";
}

async function main() {
  const app = await buildServer();
  const port = Number(process.env.PORT ?? 4000);
  await app.listen({ port, host: "0.0.0.0" });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
