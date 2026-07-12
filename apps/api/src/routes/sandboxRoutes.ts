import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Store } from "../store.js";
import { AuthService } from "../services/auth.js";
import { LedgerService } from "../services/ledger.js";
import { SandboxService } from "../services/sandbox.js";
import { addAudit } from "../services/audit.js";
import { assertSecondFactor } from "./adminRoutes.js";

export async function registerSandboxRoutes(app: FastifyInstance, store: Store): Promise<void> {
  const auth = new AuthService(store);

  app.get("/api/sandbox/status", async (request) => {
    const { user } = auth.getAuth(request);
    auth.assertRole(user, ["sandbox_admin", "super_admin"]);
    assertSecondFactor(request);
    return { appEnv: process.env.APP_ENV ?? "development", bankroll: store.state.bankroll };
  });

  app.post("/api/sandbox/bankroll", async (request) => {
    const { user } = auth.getAuth(request);
    auth.assertRole(user, ["sandbox_admin", "super_admin"]);
    assertSecondFactor(request);
    const body = z.object({
      treasuryBalance: z.number().positive().max(1_000_000).optional(),
      minimumReserve: z.number().min(0).max(1_000_000).optional()
    }).parse(request.body);
    Object.assign(store.state.bankroll, body);
    addAudit(store.state, user.id, "sandbox_bankroll_updated", "sandbox", body);
    store.save();
    return { bankroll: store.state.bankroll };
  });

  app.post("/api/sandbox/balance", async (request) => {
    const { user } = auth.getAuth(request);
    auth.assertRole(user, ["sandbox_admin", "super_admin"]);
    assertSecondFactor(request);
    const body = z.object({
      targetUserId: z.string(),
      amount: z.number().positive().max(10000),
      direction: z.enum(["credit", "debit"]).default("credit")
    }).parse(request.body);
    const target = store.state.users.find((candidate) => candidate.id === body.targetUserId);
    if (!target) throw new Error("Target user not found");
    new LedgerService(store.state).applyAdjustment(target, body.amount, body.direction, `sandbox-${Date.now()}`);
    addAudit(store.state, user.id, "sandbox_balance_adjusted", target.id, body);
    store.save();
    return { target };
  });

  app.post("/api/sandbox/simulate", { config: { rateLimit: { max: 6, timeWindow: "1 minute" } } }, async (request) => {
    const { user } = auth.getAuth(request);
    auth.assertRole(user, ["sandbox_admin", "super_admin"]);
    assertSecondFactor(request);
    const body = z.object({
      gameId: z.enum(["dice", "mines", "plinko", "orbit", "signal"]),
      rounds: z.number().int().min(1).max(10000).default(1000)
    }).parse(request.body);
    const report = new SandboxService(store.state).simulate(body.gameId, body.rounds);
    addAudit(store.state, user.id, "sandbox_simulation_run", body.gameId, { ...report });
    store.save();
    return { report };
  });
}
