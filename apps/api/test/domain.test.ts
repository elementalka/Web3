import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Store } from "../src/store";
import { LedgerService } from "../src/services/ledger";
import { GameService, orbitTables, plinkoTables } from "../src/services/games";
import { ProvablyFairService } from "../src/services/provablyFair";
import { RiskService } from "../src/services/risk";
import { applyMaturedLimitChange, requestLimitChange } from "../src/services/responsible";
import { verifyRecordedBet } from "../src/services/fairVerification";
import { buildServer } from "../src/server";

let store: Store;
let storeFile: string;
const environmentKeys = [
  "APP_ENV",
  "DEMO_AUTH_ENABLED",
  "MOCK_PAYMENTS_ENABLED",
  "SANDBOX_TOOLS_ENABLED",
  "ADMIN_2FA_SECRET",
  "ADMIN_2FA_DISABLED",
  "STORE_MODE",
  "VERCEL",
  "WEB_ORIGIN"
] as const;
let previousEnvironment: Partial<Record<typeof environmentKeys[number], string>>;

beforeEach(() => {
  previousEnvironment = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));
  process.env.APP_ENV = "test";
  process.env.DEMO_AUTH_ENABLED = "true";
  process.env.MOCK_PAYMENTS_ENABLED = "true";
  process.env.SANDBOX_TOOLS_ENABLED = "true";
  process.env.STORE_MODE = "file";
  delete process.env.VERCEL;
  storeFile = path.join(os.tmpdir(), `web3-casino-${randomUUID()}.json`);
  store = new Store(storeFile);
});

afterEach(() => {
  for (const key of environmentKeys) {
    const value = previousEnvironment[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  rmSync(storeFile, { force: true });
});

describe("ledger", () => {
  it("keeps entries balanced and prevents negative user balances", () => {
    const user = store.state.users.find((item) => item.id === "demo-player")!;
    const ledger = new LedgerService(store.state);

    ledger.deposit(user, 10, "0xtest");
    ledger.stake(user, 1, "session-1");
    ledger.payout(user, 1.5, "session-1");

    expect(ledger.reconcile()).toEqual({ ok: true, errors: [] });
    expect(user.balance).toBeGreaterThan(0);
  });

  it("settles pending withdrawals through manual review", () => {
    const user = store.state.users.find((item) => item.id === "demo-player")!;
    const ledger = new LedgerService(store.state);
    ledger.requestWithdrawal(user, 30, false);
    const withdrawal = store.state.withdrawals[0];

    expect(withdrawal.status).toBe("pending_review");
    expect(store.state.bankroll.pendingWithdrawals).toBe(30);

    ledger.approveWithdrawal(withdrawal, "0xmanual");

    expect(withdrawal.status).toBe("confirmed");
    expect(store.state.bankroll.pendingWithdrawals).toBe(0);
    expect(ledger.reconcile()).toEqual({ ok: true, errors: [] });
  });
});

describe("provably fair", () => {
  it("recomputes the same HMAC for a revealed server seed", () => {
    const fair = new ProvablyFairService(store.state);
    const roll = fair.next("dice", "client-seed");
    const verified = fair.verify(store.state.serverSeed.seed, roll.proof.clientSeed, roll.proof.nonce, "dice");

    expect(verified.serverSeedHash).toBe(roll.proof.serverSeedHash);
    expect(verified.hmac).toBe(roll.proof.hmac);
    expect(verified.verificationScope).toBe("commitment_only");
  });

  it("does not reveal a seed used by an active Mines session", () => {
    const user = store.state.users.find((item) => item.id === "demo-player")!;
    const games = new GameService(store.state);
    const started = games.startMines(user, {
      idempotencyKey: "active-mines-seed",
      betAmount: 0.05,
      minesCount: 3,
      clientSeed: "known-client-seed"
    }) as { session: { id: string } };
    const fair = new ProvablyFairService(store.state);

    expect(() => fair.rotateSeed("public_request")).toThrow(/cannot be revealed/i);

    const active = store.state.minesSessions.find((session) => session.id === started.session.id)!;
    games.revealMinesCell(user, active.id, active.minePositions[0]);
    expect(fair.rotateSeed("public_request").seed).toHaveLength(64);
  });

  it("verifies an exact recorded outcome after seed reveal", () => {
    const user = store.state.users.find((item) => item.id === "demo-player")!;
    const games = new GameService(store.state);
    const result = games.dice(user, {
      idempotencyKey: "recorded-fair-outcome",
      betAmount: 0.05,
      chance: 49.5,
      mode: "under",
      clientSeed: "recorded-client-seed"
    }) as { bet: { id: string } };
    new ProvablyFairService(store.state).rotateSeed("public_request");

    expect(verifyRecordedBet(store.state, result.bet.id, user)).toMatchObject({
      commitmentValid: true,
      outcomeValid: true,
      valid: true,
      seedRevealed: true
    });
  });
});

describe("games", () => {
  it("uses idempotency to avoid duplicate stake processing", () => {
    const user = store.state.users.find((item) => item.id === "demo-player")!;
    const games = new GameService(store.state);
    const balanceBefore = user.balance;
    const input = {
      idempotencyKey: "fixed-idempotency-key",
      betAmount: 0.05,
      chance: 49.5,
      mode: "under" as const,
      clientSeed: "same-client-seed"
    };

    const first = games.dice(user, input);
    const second = games.dice(user, input);

    expect(second).toEqual(first);
    expect(store.state.bets).toHaveLength(1);
    expect(user.balance).not.toBe(balanceBefore - 0.1);
  });

  it("disables games when the bankroll falls into critical tier", () => {
    store.state.bankroll.treasuryBalance = 45;
    const risk = new RiskService(store.state).snapshot();
    const user = store.state.users.find((item) => item.id === "demo-player")!;
    const limit = new RiskService(store.state).limitFor(user, "dice", 2);

    expect(risk.tier).toBe(0);
    expect(limit.available).toBe(false);
  });

  it("records a Mines loss as a completed bet in history", () => {
    const user = store.state.users.find((item) => item.id === "demo-player")!;
    const games = new GameService(store.state);
    const started = games.startMines(user, {
      idempotencyKey: "mines-loss-history",
      betAmount: 0.05,
      minesCount: 3,
      clientSeed: "loss-seed"
    }) as { session: { id: string } };
    const session = store.state.minesSessions.find((item) => item.id === started.session.id)!;
    const result = games.revealMinesCell(user, session.id, session.minePositions[0]) as { bet: { win: boolean; payoutAmount: number } };

    expect(result.bet).toMatchObject({ win: false, payoutAmount: 0 });
    expect(games.history(user, "mines")).toHaveLength(1);
    expect(store.state.analyticsEvents.some((event) => event.name === "game_bet_result" && event.gameId === "mines")).toBe(true);
  });
});

describe("game mathematics", () => {
  it("keeps every Plinko table near 96% RTP", () => {
    const weights = [1, 8, 28, 56, 70, 56, 28, 8, 1].map((value) => value / 256);
    const rtp = (table: readonly number[]) => table.reduce((total, multiplier, index) => total + multiplier * weights[index], 0);

    expect(rtp(plinkoTables.low)).toBeCloseTo(0.959375, 8);
    expect(rtp(plinkoTables.medium)).toBeCloseTo(0.959765625, 8);
    expect(rtp(plinkoTables.high)).toBeCloseTo(0.96009375, 8);
    for (const table of Object.values(plinkoTables)) {
      expect(rtp(table)).toBeGreaterThanOrEqual(0.959);
      expect(rtp(table)).toBeLessThan(1);
    }
  });

  it("keeps ORBIT starter at 96% and normal at 97% RTP", () => {
    const rtp = (table: readonly { probability: number; multiplier: number }[]) =>
      table.reduce((total, outcome) => total + outcome.probability * outcome.multiplier, 0);
    const probability = (table: readonly { probability: number }[]) =>
      table.reduce((total, outcome) => total + outcome.probability, 0);

    expect(probability(orbitTables.starter)).toBeCloseTo(1, 12);
    expect(probability(orbitTables.normal)).toBeCloseTo(1, 12);
    expect(rtp(orbitTables.starter)).toBeCloseTo(0.96, 12);
    expect(rtp(orbitTables.normal)).toBeCloseTo(0.97, 12);
  });
});

describe("sandbox routing", () => {
  it("does not register sandbox routes in production", async () => {
    process.env.APP_ENV = "production";
    const app = await buildServer(store);
    const response = await app.inject({ method: "GET", url: "/api/sandbox/status" });
    await app.close();

    expect(response.statusCode).toBe(404);
  });

  it("requires the explicit sandbox feature flag outside production", async () => {
    process.env.APP_ENV = "staging";
    process.env.SANDBOX_TOOLS_ENABLED = "false";
    const disabledApp = await buildServer(store);
    const disabled = await disabledApp.inject({ method: "GET", url: "/api/sandbox/status" });
    await disabledApp.close();

    process.env.SANDBOX_TOOLS_ENABLED = "true";
    const enabledApp = await buildServer(store);
    const enabled = await enabledApp.inject({ method: "GET", url: "/api/sandbox/status" });
    await enabledApp.close();

    expect(disabled.statusCode).toBe(404);
    expect(enabled.statusCode).toBe(401);
  });

  it("requires a sandbox role and the non-production second-factor boundary", async () => {
    const app = await buildServer(store);
    const authResponse = await app.inject({ method: "POST", url: "/api/auth/demo", payload: { role: "admin" } });
    const authorization = `Bearer ${authResponse.json<{ token: string }>().token}`;
    const withoutSecondFactor = await app.inject({ method: "GET", url: "/api/sandbox/status", headers: { authorization } });
    const allowed = await app.inject({ method: "GET", url: "/api/sandbox/status", headers: { authorization, "x-admin-2fa": "000000" } });
    await app.close();

    expect(withoutSecondFactor.statusCode).toBe(403);
    expect(allowed.statusCode).toBe(200);
  });
});

describe("production boundaries", () => {
  it("does not register demo auth or mock deposit routes in production", async () => {
    process.env.APP_ENV = "production";
    process.env.DEMO_AUTH_ENABLED = "true";
    process.env.MOCK_PAYMENTS_ENABLED = "true";
    const app = await buildServer(store);
    const demo = await app.inject({ method: "POST", url: "/api/auth/demo", payload: { role: "admin" } });
    const deposit = await app.inject({ method: "POST", url: "/api/deposits/mock", payload: { amount: 100 } });
    await app.close();

    expect(demo.statusCode).toBe(404);
    expect(deposit.statusCode).toBe(404);
  });

  it("rejects 000000 and accepts only the configured admin secret in production", async () => {
    process.env.APP_ENV = "production";
    process.env.ADMIN_2FA_SECRET = "production-test-secret";
    const now = Date.now();
    store.state.sessions.push({
      token: "production-admin-session",
      userId: "demo-admin",
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 60_000).toISOString()
    });
    const app = await buildServer(store);
    const authorization = "Bearer production-admin-session";
    const hardcoded = await app.inject({
      method: "GET",
      url: "/api/admin/dashboard",
      headers: { authorization, "x-admin-2fa": "000000" }
    });
    const configured = await app.inject({
      method: "GET",
      url: "/api/admin/dashboard",
      headers: { authorization, "x-admin-2fa": "production-test-secret" }
    });
    await app.close();

    expect(hardcoded.statusCode).toBe(403);
    expect(configured.statusCode).toBe(200);
  });

  it("uses a deny-by-default CORS policy in production", async () => {
    process.env.APP_ENV = "production";
    delete process.env.WEB_ORIGIN;
    const app = await buildServer(store);
    const response = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: { origin: "https://evil.example" }
    });
    await app.close();

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("admin dual control", () => {
  it("rejects self-approval and permits a separate Super Admin approver", async () => {
    const app = await buildServer(store);
    const adminAuth = await app.inject({ method: "POST", url: "/api/auth/demo", payload: { role: "admin" } });
    const adminToken = adminAuth.json<{ token: string }>().token;
    const request = await app.inject({
      method: "POST",
      url: "/api/admin/ledger-adjustments",
      headers: { authorization: `Bearer ${adminToken}`, "x-admin-2fa": "000000" },
      payload: {
        targetUserId: "demo-player",
        amount: 1,
        direction: "credit",
        reason: "Confirmed reconciliation incident",
        incidentUrl: "https://example.com/incidents/123"
      }
    });
    const adjustmentId = request.json<{ adjustment: { id: string } }>().adjustment.id;
    store.state.users.find((user) => user.id === "demo-admin")!.roles.push("super_admin");
    const selfApproval = await app.inject({
      method: "POST",
      url: `/api/admin/ledger-adjustments/${adjustmentId}/approve`,
      headers: { authorization: `Bearer ${adminToken}`, "x-admin-2fa": "000000" }
    });
    const approverAuth = await app.inject({ method: "POST", url: "/api/auth/demo", payload: { role: "approver" } });
    const approverToken = approverAuth.json<{ token: string }>().token;
    const independentApproval = await app.inject({
      method: "POST",
      url: `/api/admin/ledger-adjustments/${adjustmentId}/approve`,
      headers: { authorization: `Bearer ${approverToken}`, "x-admin-2fa": "000000" }
    });
    await app.close();

    expect(request.statusCode).toBe(200);
    expect(selfApproval.statusCode).toBe(409);
    expect(independentApproval.statusCode).toBe(200);
  });
});

describe("responsible limits", () => {
  it("applies decreases immediately and delays increases for 24 hours", () => {
    const user = store.state.users.find((item) => item.id === "demo-player")!;
    const now = Date.parse("2026-01-01T00:00:00.000Z");

    requestLimitChange(user, { maxBet: 1, dailyDeposit: 40, dailyLoss: 10 }, now);
    expect(user.limits).toMatchObject({ maxBet: 1, dailyDeposit: 40, dailyLoss: 10 });
    expect(user.limits.pendingChange).toBeUndefined();

    requestLimitChange(user, { maxBet: 5, dailyDeposit: 100, dailyLoss: 50 }, now);
    expect(user.limits).toMatchObject({ maxBet: 1, dailyDeposit: 40, dailyLoss: 10 });
    expect(user.limits.pendingChange).toMatchObject({ maxBet: 5, dailyDeposit: 100, dailyLoss: 50 });
    expect(applyMaturedLimitChange(user, now + 23 * 60 * 60 * 1000)).toBe(false);
    expect(applyMaturedLimitChange(user, now + 24 * 60 * 60 * 1000)).toBe(true);
    expect(user.limits).toEqual({ maxBet: 5, dailyDeposit: 100, dailyLoss: 50 });
  });

  it("enforces daily deposit and self-exclusion rules", async () => {
    const app = await buildServer(store);
    const authResponse = await app.inject({ method: "POST", url: "/api/auth/demo", payload: { role: "player" } });
    const authorization = `Bearer ${authResponse.json<{ token: string }>().token}`;
    const first = await app.inject({ method: "POST", url: "/api/deposits/mock", headers: { authorization }, payload: { amount: 30 } });
    const overLimit = await app.inject({ method: "POST", url: "/api/deposits/mock", headers: { authorization }, payload: { amount: 21 } });
    await app.inject({ method: "POST", url: "/api/responsible/self-exclusion", headers: { authorization }, payload: { hours: 24 } });
    const excluded = await app.inject({ method: "POST", url: "/api/deposits/mock", headers: { authorization }, payload: { amount: 1 } });
    const session = await app.inject({ method: "GET", url: "/api/session", headers: { authorization } });
    await app.close();

    expect(first.statusCode).toBe(200);
    expect(overLimit.statusCode).toBe(422);
    expect(excluded.statusCode).toBe(403);
    expect(session.json<{ deposits: unknown[]; withdrawals: unknown[]; supportTickets: unknown[] }>().deposits).toHaveLength(1);
    expect(session.json<{ withdrawals: unknown[] }>().withdrawals).toEqual([]);
    expect(session.json<{ supportTickets: unknown[] }>().supportTickets).toEqual([]);
  });

  it("blocks a new stake once the rolling daily loss limit is reached", () => {
    const user = store.state.users.find((item) => item.id === "demo-player")!;
    user.limits.dailyLoss = 1;
    new LedgerService(store.state).stake(user, 1, "daily-loss-seed");

    expect(() => new RiskService(store.state).assertBetAllowed(user, "dice", 0.01, 2)).toThrow(/daily loss limit/i);
  });

  it("applies the 25 USDC auto-withdrawal threshold cumulatively per day", async () => {
    const app = await buildServer(store);
    const authResponse = await app.inject({ method: "POST", url: "/api/auth/demo", payload: { role: "player" } });
    const authorization = `Bearer ${authResponse.json<{ token: string }>().token}`;
    const first = await app.inject({ method: "POST", url: "/api/withdrawals", headers: { authorization }, payload: { amount: 20 } });
    const second = await app.inject({ method: "POST", url: "/api/withdrawals", headers: { authorization }, payload: { amount: 20 } });
    await app.close();

    expect(first.json<{ withdrawals: Array<{ status: string }> }>().withdrawals[0].status).toBe("confirmed");
    expect(second.json<{ withdrawals: Array<{ status: string }> }>().withdrawals[0].status).toBe("pending_review");
  });
});

describe("serverless store mode", () => {
  it("automatically uses in-memory state on Vercel and never writes the app filesystem", () => {
    delete process.env.STORE_MODE;
    process.env.VERCEL = "1";
    const memoryStore = new Store();

    expect(memoryStore.mode).toBe("memory");
    expect(() => memoryStore.save()).not.toThrow();
    expect(memoryStore.state.users.length).toBeGreaterThan(0);
  });
});

describe("HTTP errors", () => {
  it("returns 401 with a stable error envelope for missing authentication", async () => {
    const app = await buildServer(store);
    const response = await app.inject({ method: "GET", url: "/api/session" });
    await app.close();
    const body = response.json<{ errorCode: string; requestId: string; timestamp: string }>();

    expect(response.statusCode).toBe(401);
    expect(body.errorCode).toBe("UNAUTHORIZED");
    expect(body.requestId).toBeTruthy();
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  });

  it("rate-limits repeated authentication attempts", async () => {
    const app = await buildServer(store);
    let response;
    for (let attempt = 0; attempt < 21; attempt += 1) {
      response = await app.inject({ method: "POST", url: "/api/auth/demo", payload: { role: "player" } });
    }
    await app.close();

    expect(response?.statusCode).toBe(429);
    expect(response?.json<{ errorCode: string }>().errorCode).toBe("RATE_LIMITED");
  });
});

describe("responsible recommendations", () => {
  it("returns a neutral safety pulse for an authenticated player", async () => {
    const app = await buildServer(store);
    const authResponse = await app.inject({
      method: "POST",
      url: "/api/auth/demo",
      payload: { role: "player" }
    });
    const token = authResponse.json<{ token: string }>().token;
    const response = await app.inject({
      method: "GET",
      url: "/api/recommendations",
      headers: { authorization: `Bearer ${token}` }
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json<{ recommendations: unknown[] }>().recommendations.length).toBeGreaterThan(0);
  });
});
