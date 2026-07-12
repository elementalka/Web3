import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Store } from "../store";
import { AuthService } from "../services/auth";
import { LedgerService } from "../services/ledger";
import { addAnalytics, addAudit } from "../services/audit";
import { assertDepositAllowed, requestLimitChange } from "../services/responsible";

export async function registerUserRoutes(app: FastifyInstance, store: Store): Promise<void> {
  const auth = new AuthService(store);

  if (process.env.APP_ENV !== "production" && process.env.MOCK_PAYMENTS_ENABLED !== "false") {
    app.post("/api/deposits/mock", async (request) => {
      const { user } = auth.getAuth(request);
      const body = z.object({ amount: z.number().positive().max(100) }).parse(request.body);
      assertDepositAllowed(store.state, user, body.amount);
      const ledger = new LedgerService(store.state);
      ledger.deposit(user, body.amount);
      store.state.notifications.unshift({
        id: randomUUID(),
        userId: user.id,
        type: "deposit",
        title: "Deposit confirmed",
        body: `${body.amount} USDC credited`,
        read: false,
        createdAt: new Date().toISOString()
      });
      addAnalytics(store.state, "deposit_confirmed", { amount: body.amount }, user.id);
      store.save();
      return { user, risk: newRiskSnapshot(store), deposits: store.state.deposits.filter((item) => item.userId === user.id).slice(0, 10) };
    });
  }

  app.post("/api/withdrawals", async (request) => {
    const { user } = auth.getAuth(request);
    const body = z.object({ amount: z.number().positive().max(100) }).parse(request.body);
    const since = Date.now() - 24 * 60 * 60 * 1000;
    const autoPaidToday = store.state.withdrawals
      .filter((item) => item.userId === user.id && item.status === "confirmed" && new Date(item.createdAt).getTime() >= since)
      .reduce((total, item) => total + item.amount, 0);
    const autoConfirm =
      autoPaidToday + body.amount <= 25 + 0.000001 &&
      user.riskScore <= 30 &&
      store.state.bankroll.treasuryBalance >= body.amount;
    const ledger = new LedgerService(store.state);
    ledger.requestWithdrawal(user, body.amount, autoConfirm);
    store.state.notifications.unshift({
      id: randomUUID(),
      userId: user.id,
      type: "withdrawal",
      title: autoConfirm ? "Withdrawal confirmed" : "Withdrawal in review",
      body: autoConfirm ? `${body.amount} USDC sent on testnet` : `${body.amount} USDC requires manual review`,
      read: false,
      createdAt: new Date().toISOString()
    });
    addAnalytics(store.state, "withdrawal_requested", { amount: body.amount, autoConfirm }, user.id);
    store.save();
    return { user, withdrawals: store.state.withdrawals.filter((item) => item.userId === user.id).slice(0, 10) };
  });

  app.post("/api/responsible/limits", async (request) => {
    const { user } = auth.getAuth(request);
    const body = z.object({
      maxBet: z.number().positive().max(100),
      dailyDeposit: z.number().positive().max(500),
      dailyLoss: z.number().positive().max(500)
    }).parse(request.body);
    const previous = { ...user.limits };
    requestLimitChange(user, body);
    addAudit(store.state, user.id, "responsible_limits_updated", user.id, {
      previous,
      effective: user.limits,
      pending: user.limits.pendingChange
    });
    store.save();
    return { user };
  });

  app.post("/api/responsible/self-exclusion", async (request) => {
    const { user } = auth.getAuth(request);
    const body = z.object({ hours: z.number().int().min(1).max(24 * 365) }).parse(request.body);
    const requestedUntil = Date.now() + body.hours * 60 * 60 * 1000;
    const existingUntil = user.selfExcludedUntil ? new Date(user.selfExcludedUntil).getTime() : 0;
    user.selfExcludedUntil = new Date(Math.max(requestedUntil, existingUntil)).toISOString();
    user.updatedAt = new Date().toISOString();
    store.state.notifications.unshift({
      id: randomUUID(),
      userId: user.id,
      type: "self_exclusion",
      title: "Self-exclusion enabled",
      body: `Account locked until ${user.selfExcludedUntil}`,
      read: false,
      createdAt: new Date().toISOString()
    });
    addAudit(store.state, user.id, "self_exclusion_enabled", user.id, { hours: body.hours });
    store.save();
    return { user };
  });

  app.get("/api/recommendations", async (request) => {
    const { user } = auth.getAuth(request);
    const since = Date.now() - 24 * 60 * 60 * 1000;
    const recentBets = store.state.bets.filter((bet) => bet.userId === user.id && new Date(bet.createdAt).getTime() >= since);
    const wagered = recentBets.reduce((acc, bet) => acc + bet.betAmount, 0);
    const paid = recentBets.reduce((acc, bet) => acc + bet.payoutAmount, 0);
    const net = paid - wagered;
    const recommendations = [];

    if (recentBets.length >= 25) {
      recommendations.push({
        level: "notice",
        title: "Reality check",
        body: "You have played 25+ rounds in the last 24h. Consider a short pause."
      });
    }
    if (net < -Math.max(2, user.limits.dailyLoss * 0.5)) {
      recommendations.push({
        level: "warning",
        title: "Loss limit signal",
        body: "Your recent net result is near your daily loss comfort zone."
      });
    }
    if (user.limits.coolingOffUntil && new Date(user.limits.coolingOffUntil).getTime() > Date.now()) {
      recommendations.push({
        level: "cooldown",
        title: "Cooling-off active",
        body: "Raised limits are delayed for 24h before they become active."
      });
    }
    if (recommendations.length === 0) {
      recommendations.push({
        level: "ok",
        title: "Safety pulse stable",
        body: "Limits and recent activity are within your current settings."
      });
    }

    return {
      summary: {
        rounds24h: recentBets.length,
        wagered24h: Math.round(wagered * 100) / 100,
        net24h: Math.round(net * 100) / 100,
        maxBet: user.limits.maxBet,
        dailyLoss: user.limits.dailyLoss
      },
      recommendations
    };
  });

  app.get("/api/support/tickets", async (request) => {
    const { user } = auth.getAuth(request);
    return { tickets: store.state.supportTickets.filter((ticket) => ticket.userId === user.id) };
  });

  app.post("/api/support/tickets", async (request) => {
    const { user } = auth.getAuth(request);
    const body = z.object({
      category: z.enum(["payment", "game", "responsible", "account", "other"]),
      subject: z.string().min(3).max(120),
      body: z.string().min(3).max(2000)
    }).parse(request.body);
    const now = new Date().toISOString();
    const ticket = {
      id: randomUUID(),
      userId: user.id,
      category: body.category,
      status: "open" as const,
      subject: body.subject,
      messages: [{ id: randomUUID(), authorUserId: user.id, body: body.body, createdAt: now }],
      createdAt: now,
      updatedAt: now
    };
    store.state.supportTickets.unshift(ticket);
    addAnalytics(store.state, "support_ticket_created", { category: body.category }, user.id);
    store.save();
    return { ticket };
  });
}

function newRiskSnapshot(store: Store) {
  return {
    treasuryBalance: store.state.bankroll.treasuryBalance,
    pendingWithdrawals: store.state.bankroll.pendingWithdrawals
  };
}
