import type { FastifyInstance, FastifyRequest } from "fastify";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { Store } from "../store.js";
import { AuthService } from "../services/auth.js";
import { LedgerService } from "../services/ledger.js";
import { RiskService } from "../services/risk.js";
import { addAudit } from "../services/audit.js";

export async function registerAdminRoutes(app: FastifyInstance, store: Store): Promise<void> {
  const auth = new AuthService(store);

  app.addHook("preHandler", async (request) => {
    if (request.url.startsWith("/api/admin")) {
      assertSecondFactor(request);
    }
  });

  app.get("/api/admin/dashboard", async (request) => {
    const { user } = auth.getAuth(request);
    auth.assertRole(user, ["admin", "super_admin", "risk"]);
    const ledger = new LedgerService(store.state);
    return {
      risk: new RiskService(store.state).snapshot(),
      bankroll: store.state.bankroll,
      users: store.state.users.length,
      activeMines: store.state.minesSessions.filter((session) => session.status === "active").length,
      pendingWithdrawals: store.state.withdrawals.filter((item) => item.status === "pending_review"),
      recentBets: store.state.bets.slice(0, 20),
      analytics: store.state.analyticsEvents.slice(0, 40),
      ledgerReconciliation: ledger.reconcile()
    };
  });

  app.get("/api/admin/users", async (request) => {
    const { user } = auth.getAuth(request);
    auth.assertRole(user, ["admin", "super_admin", "support", "risk"]);
    return { users: store.state.users };
  });

  app.post("/api/admin/emergency-pause", async (request) => {
    const { user } = auth.getAuth(request);
    auth.assertRole(user, ["admin", "super_admin"]);
    const body = z.object({ paused: z.boolean(), reason: z.string().min(3) }).parse(request.body);
    store.state.bankroll.emergencyPaused = body.paused;
    addAudit(store.state, user.id, "emergency_pause_updated", "bankroll", body);
    store.save();
    return { bankroll: store.state.bankroll };
  });

  app.post("/api/admin/games/:gameId/config", async (request) => {
    const { user } = auth.getAuth(request);
    auth.assertRole(user, ["admin", "super_admin"]);
    const params = z.object({ gameId: z.enum(["dice", "mines", "plinko", "orbit", "signal"]) }).parse(request.params);
    const body = z.object({
      enabled: z.boolean().optional(),
      rtpStarter: z.number().gt(0).lt(1).optional(),
      rtpNormal: z.number().gt(0).lt(1).optional(),
      systemMaxBet: z.number().positive().max(100).optional()
    }).parse(request.body);
    const config = store.state.gameConfigs[params.gameId];
    Object.assign(config, body, { updatedAt: new Date().toISOString() });
    addAudit(store.state, user.id, "game_config_updated", params.gameId, body);
    store.save();
    return { config };
  });

  app.post("/api/admin/ledger-adjustments", async (request) => {
    const { user } = auth.getAuth(request);
    auth.assertRole(user, ["admin", "super_admin"]);
    const body = z.object({
      targetUserId: z.string(),
      amount: z.number().positive().max(1000),
      direction: z.enum(["credit", "debit"]),
      reason: z.string().min(10),
      incidentUrl: z.string().url()
    }).parse(request.body);
    if (!store.state.users.some((candidate) => candidate.id === body.targetUserId)) {
      throw new Error("Target user not found");
    }
    const now = new Date().toISOString();
    const adjustment = {
      id: randomUUID(),
      ...body,
      status: "pending" as const,
      requestedBy: user.id,
      createdAt: now,
      updatedAt: now
    };
    store.state.ledgerAdjustments.unshift(adjustment);
    addAudit(store.state, user.id, "ledger_adjustment_requested", body.targetUserId, body);
    store.save();
    return { adjustment };
  });

  app.post("/api/admin/ledger-adjustments/:id/approve", async (request) => {
    const { user } = auth.getAuth(request);
    auth.assertRole(user, ["super_admin"]);
    const params = z.object({ id: z.string() }).parse(request.params);
    const adjustment = store.state.ledgerAdjustments.find((candidate) => candidate.id === params.id);
    if (!adjustment) throw new Error("Adjustment not found");
    if (adjustment.status !== "pending") throw new Error("Adjustment already processed");
    if (adjustment.requestedBy === user.id) {
      throw new Error("Ledger adjustment requires an independent approver");
    }
    const target = store.state.users.find((candidate) => candidate.id === adjustment.targetUserId);
    if (!target) throw new Error("Target user not found");
    new LedgerService(store.state).applyAdjustment(target, adjustment.amount, adjustment.direction, adjustment.id);
    adjustment.status = "approved";
    adjustment.approvedBy = user.id;
    adjustment.updatedAt = new Date().toISOString();
    addAudit(store.state, user.id, "ledger_adjustment_approved", adjustment.targetUserId, { adjustmentId: adjustment.id });
    store.save();
    return { adjustment, target };
  });

  app.post("/api/admin/withdrawals/:id/approve", async (request) => {
    const { user } = auth.getAuth(request);
    auth.assertRole(user, ["admin", "super_admin", "risk"]);
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ txHash: z.string().min(6).optional() }).parse(request.body ?? {});
    const withdrawal = store.state.withdrawals.find((candidate) => candidate.id === params.id);
    if (!withdrawal) throw new Error("Withdrawal not found");
    const entry = new LedgerService(store.state).approveWithdrawal(withdrawal, body.txHash);
    addAudit(store.state, user.id, "withdrawal_approved", withdrawal.userId, { withdrawalId: withdrawal.id, ledgerEntryId: entry.id });
    store.save();
    return { withdrawal };
  });

  app.post("/api/admin/withdrawals/:id/reject", async (request) => {
    const { user } = auth.getAuth(request);
    auth.assertRole(user, ["admin", "super_admin", "risk"]);
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ reason: z.string().min(8).max(500) }).parse(request.body);
    const withdrawal = store.state.withdrawals.find((candidate) => candidate.id === params.id);
    if (!withdrawal) throw new Error("Withdrawal not found");
    const entry = new LedgerService(store.state).rejectWithdrawal(withdrawal, body.reason);
    addAudit(store.state, user.id, "withdrawal_rejected", withdrawal.userId, { withdrawalId: withdrawal.id, ledgerEntryId: entry.id, reason: body.reason });
    store.save();
    return { withdrawal };
  });

  app.get("/api/admin/audit", async (request) => {
    const { user } = auth.getAuth(request);
    auth.assertRole(user, ["admin", "super_admin", "risk"]);
    return { auditLogs: store.state.auditLogs.slice(0, 100), ledgerEntries: store.state.ledgerEntries.slice(0, 100) };
  });

  app.post("/api/admin/content", async (request) => {
    const { user } = auth.getAuth(request);
    auth.assertRole(user, ["content_manager", "admin", "super_admin"]);
    const body = z.object({
      slug: z.string().min(2).max(80),
      locale: z.enum(["ru", "en"]).default("ru"),
      title: z.string().min(2).max(120),
      body: z.string().min(2).max(5000),
      status: z.enum(["draft", "published"]).default("draft")
    }).parse(request.body);
    const existing = store.state.contentPages.find((page) => page.slug === body.slug && page.locale === body.locale);
    const now = new Date().toISOString();
    if (existing) {
      Object.assign(existing, body, { version: existing.version + 1, updatedAt: now });
      addAudit(store.state, user.id, "content_page_updated", existing.slug, { version: existing.version });
      store.save();
      return { page: existing };
    }
    const page = { id: randomUUID(), version: 1, updatedAt: now, ...body };
    store.state.contentPages.unshift(page);
    addAudit(store.state, user.id, "content_page_created", page.slug, { version: 1 });
    store.save();
    return { page };
  });
}

export function assertSecondFactor(request: FastifyRequest): void {
  if (process.env.APP_ENV !== "production" && process.env.ADMIN_2FA_DISABLED === "true") {
    return;
  }
  const tokenHeader = request.headers["x-admin-2fa"];
  const token = Array.isArray(tokenHeader) ? tokenHeader[0] : tokenHeader;
  const configuredSecret = process.env.ADMIN_2FA_SECRET;

  if (process.env.APP_ENV === "production") {
    if (!configuredSecret || configuredSecret === "000000") {
      throw new Error("Admin 2FA is not configured securely");
    }
    if (!token || !safeEqual(token, configuredSecret)) {
      throw new Error("Admin 2FA is required");
    }
    return;
  }

  const accepted = token === "000000" || Boolean(token && configuredSecret && safeEqual(token, configuredSecret));
  if (!accepted) {
    throw new Error("Admin 2FA is required");
  }
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
