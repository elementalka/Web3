import { createHmac, timingSafeEqual } from "node:crypto";
import type { SessionToken, User } from "../types.js";

const TOKEN_PREFIX = "sc1";
const ISSUER = "lumina-showcase";
const SESSION_TTL_SECONDS = 60 * 60;
const MAX_TOKEN_LENGTH = 4096;
const MAX_PAYLOAD_LENGTH = 3072;

export interface ShowcaseSessionClaims {
  v: 1;
  iss: typeof ISSUER;
  aud: string;
  sub: string;
  username: string;
  telegramId?: string;
  walletAddress?: string;
  iat: number;
  exp: number;
}

export function statelessShowcaseSessionsEnabled(): boolean {
  return process.env.APP_ENV !== "production"
    && process.env.SHOWCASE_STATELESS_SESSIONS === "true";
}

export function createShowcaseSession(user: User): SessionToken {
  const now = Math.floor(Date.now() / 1000);
  const claims: ShowcaseSessionClaims = {
    v: 1,
    iss: ISSUER,
    aud: showcaseAudience(),
    sub: user.id,
    username: user.username,
    telegramId: user.telegramId,
    walletAddress: user.walletAddress,
    iat: now,
    exp: now + SESSION_TTL_SECONDS
  };
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  const signingInput = `${TOKEN_PREFIX}.${payload}`;
  const signature = sign(signingInput);

  return {
    token: `${signingInput}.${signature}`,
    userId: user.id,
    createdAt: new Date(claims.iat * 1000).toISOString(),
    expiresAt: new Date(claims.exp * 1000).toISOString()
  };
}

export function verifyShowcaseSession(tokenValue: string): {
  token: SessionToken;
  claims: ShowcaseSessionClaims;
} | undefined {
  if (tokenValue.length > MAX_TOKEN_LENGTH) return undefined;
  const parts = tokenValue.split(".");
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) return undefined;

  const [, payload, signature] = parts;
  if (
    payload.length === 0
    || payload.length > MAX_PAYLOAD_LENGTH
    || !/^[A-Za-z0-9_-]+$/.test(payload)
    || !/^[A-Za-z0-9_-]{43}$/.test(signature)
  ) return undefined;

  const expectedSignature = createHmac("sha256", signingSecret())
    .update(`${TOKEN_PREFIX}.${payload}`)
    .digest("base64url");
  const expected = Buffer.from(expectedSignature, "ascii");
  const received = Buffer.from(signature, "ascii");
  if (!timingSafeEqual(received, expected)) {
    return undefined;
  }

  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return undefined;
  }
  if (!isValidClaims(claims)) return undefined;

  return {
    token: {
      token: tokenValue,
      userId: claims.sub,
      createdAt: new Date(claims.iat * 1000).toISOString(),
      expiresAt: new Date(claims.exp * 1000).toISOString()
    },
    claims
  };
}

export function restoreShowcaseUser(claims: ShowcaseSessionClaims): User {
  const now = new Date().toISOString();
  return {
    id: claims.sub,
    telegramId: claims.telegramId,
    walletAddress: claims.walletAddress,
    username: claims.username,
    roles: ["player"],
    balance: 0,
    riskScore: 5,
    isBlocked: false,
    limits: {
      maxBet: 2,
      dailyDeposit: 50,
      dailyLoss: 20
    },
    createdAt: now,
    updatedAt: now
  };
}

function sign(value: string): string {
  return createHmac("sha256", signingSecret()).update(value).digest("base64url");
}

function signingSecret(): string {
  const secret = process.env.SHOWCASE_SESSION_SECRET?.trim();
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("Showcase session signing is not configured securely");
  }
  return secret;
}

function showcaseAudience(): string {
  const project = process.env.VERCEL_PROJECT_ID?.trim() || "local";
  const target = process.env.VERCEL_TARGET_ENV?.trim()
    || process.env.VERCEL_ENV?.trim()
    || process.env.APP_ENV?.trim()
    || "development";
  return `lumina-showcase:${project}:${target}`;
}

function isValidClaims(value: unknown): value is ShowcaseSessionClaims {
  if (!value || typeof value !== "object") return false;
  const claims = value as Partial<ShowcaseSessionClaims>;
  const now = Math.floor(Date.now() / 1000);

  return claims.v === 1
    && claims.iss === ISSUER
    && claims.aud === showcaseAudience()
    && typeof claims.sub === "string"
    && /^[A-Za-z0-9:._-]{1,160}$/.test(claims.sub)
    && typeof claims.username === "string"
    && claims.username.length > 0
    && claims.username.length <= 160
    && (claims.telegramId === undefined || (typeof claims.telegramId === "string" && claims.telegramId.length <= 64))
    && (claims.walletAddress === undefined || (typeof claims.walletAddress === "string" && claims.walletAddress.length <= 128))
    && Number.isInteger(claims.iat)
    && Number.isInteger(claims.exp)
    && claims.iat! <= now + 60
    && claims.exp! > now
    && claims.exp! > claims.iat!
    && claims.exp! - claims.iat! <= SESSION_TTL_SECONDS;
}
