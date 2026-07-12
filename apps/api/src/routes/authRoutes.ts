import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AuthService } from "../services/auth";
import type { Store } from "../store";

export async function registerAuthRoutes(app: FastifyInstance, store: Store): Promise<void> {
  const auth = new AuthService(store);

  if (process.env.APP_ENV !== "production" && process.env.DEMO_AUTH_ENABLED !== "false") {
    app.post("/api/auth/demo", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (request) => {
      const body = z.object({ role: z.enum(["player", "admin", "approver"]).default("player") }).parse(request.body ?? {});
      const role = body.role === "admin" ? "admin" : body.role === "approver" ? "super_admin" : "player";
      return auth.createDemoSession(role);
    });
  }

  app.post("/api/auth/telegram", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (request) => {
    const body = z.object({
      initData: z.string().optional(),
      mockUser: z.object({
        id: z.number(),
        first_name: z.string().optional(),
        last_name: z.string().optional(),
        username: z.string().optional(),
        language_code: z.string().optional()
      }).optional()
    }).parse(request.body ?? {});
    return auth.authenticateTelegram(body.initData, body.mockUser);
  });

  app.post("/api/auth/wallet/nonce", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (request) => {
    const body = z.object({ walletAddress: z.string() }).parse(request.body);
    return { nonce: auth.createWalletNonce(body.walletAddress) };
  });

  app.post("/api/auth/wallet/verify", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (request) => {
    const body = z.object({
      walletAddress: z.string(),
      signature: z.string(),
      nonce: z.string()
    }).parse(request.body);
    return auth.verifyWallet(body.walletAddress, body.signature, body.nonce);
  });

  app.get("/api/session", async (request) => {
    const { user } = auth.getAuth(request);
    return {
      user,
      contentPages: store.state.contentPages.filter((page) => page.status === "published"),
      notifications: store.state.notifications.filter((item) => item.userId === user.id).slice(0, 20),
      deposits: store.state.deposits.filter((item) => item.userId === user.id).slice(0, 50),
      withdrawals: store.state.withdrawals.filter((item) => item.userId === user.id).slice(0, 50),
      supportTickets: store.state.supportTickets.filter((item) => item.userId === user.id).slice(0, 50),
      environment: {
        appEnv: process.env.APP_ENV ?? "development",
        demoFunds: process.env.APP_ENV !== "production",
        persistence: store.mode
      },
      activeMinesSessions: store.state.minesSessions
        .filter((session) => session.userId === user.id && session.status === "active")
        .map((session) => ({ ...session, minePositions: [] }))
    };
  });
}
