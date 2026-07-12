import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Store } from "../store";
import type { GameId } from "../types";
import { AuthService } from "../services/auth";
import { GameService, signals } from "../services/games";
import { ProvablyFairService } from "../services/provablyFair";
import { verifyRecordedBet } from "../services/fairVerification";

const gameIdSchema = z.enum(["dice", "mines", "plinko", "orbit", "signal"]);
const baseBet = {
  idempotencyKey: z.string().min(8),
  betAmount: z.number().positive(),
  clientSeed: z.string().max(128).optional()
};

export async function registerGameRoutes(app: FastifyInstance, store: Store): Promise<void> {
  const auth = new AuthService(store);

  app.get("/api/games/config", async (request) => {
    const { user } = auth.getAuth(request);
    return new GameService(store.state).publicConfig(user);
  });

  app.get("/api/games/history", async (request) => {
    const { user } = auth.getAuth(request);
    const query = z.object({ gameId: gameIdSchema.optional() }).parse(request.query);
    return { bets: new GameService(store.state).history(user, query.gameId as GameId | undefined) };
  });

  app.post("/api/games/dice/bet", async (request) => {
    const { user } = auth.getAuth(request);
    const body = z.object({
      ...baseBet,
      chance: z.number().min(5).max(95).default(49.5),
      mode: z.enum(["under", "over"]).default("under")
    }).parse(request.body);
    const result = new GameService(store.state).dice(user, body);
    store.save();
    return result;
  });

  app.post("/api/games/mines/start", async (request) => {
    const { user } = auth.getAuth(request);
    const body = z.object({
      ...baseBet,
      minesCount: z.number().int().min(3).max(12).default(3)
    }).parse(request.body);
    const result = new GameService(store.state).startMines(user, body);
    store.save();
    return result;
  });

  app.post("/api/games/mines/:sessionId/reveal", async (request) => {
    const { user } = auth.getAuth(request);
    const params = z.object({ sessionId: z.string() }).parse(request.params);
    const body = z.object({ cell: z.number().int().min(0).max(24) }).parse(request.body);
    const result = new GameService(store.state).revealMinesCell(user, params.sessionId, body.cell);
    store.save();
    return result;
  });

  app.post("/api/games/mines/:sessionId/cashout", async (request) => {
    const { user } = auth.getAuth(request);
    const params = z.object({ sessionId: z.string() }).parse(request.params);
    const result = new GameService(store.state).cashoutMines(user, params.sessionId);
    store.save();
    return result;
  });

  app.post("/api/games/plinko/drop", async (request) => {
    const { user } = auth.getAuth(request);
    const body = z.object({
      ...baseBet,
      riskMode: z.enum(["low", "medium", "high"]).default("low")
    }).parse(request.body);
    const result = new GameService(store.state).plinko(user, body);
    store.save();
    return result;
  });

  app.post("/api/games/orbit/bet", async (request) => {
    const { user } = auth.getAuth(request);
    const body = z.object({
      ...baseBet,
      selectedOrbit: z.number().int().min(0).max(4).default(2)
    }).parse(request.body);
    const result = new GameService(store.state).orbit(user, body);
    store.save();
    return result;
  });

  app.post("/api/games/signal/bet", async (request) => {
    const { user } = auth.getAuth(request);
    const body = z.object({
      ...baseBet,
      selectedSignal: z.enum(signals as [typeof signals[number], ...typeof signals[number][]])
    }).parse(request.body);
    const result = new GameService(store.state).signal(user, body);
    store.save();
    return result;
  });

  app.post("/api/provably-fair/verify", async (request) => {
    const body = z.object({
      serverSeed: z.string().min(16),
      clientSeed: z.string().min(1),
      nonce: z.number().int().positive(),
      gameId: gameIdSchema
    }).parse(request.body);
    return new ProvablyFairService(store.state).verify(body.serverSeed, body.clientSeed, body.nonce, body.gameId);
  });

  app.get("/api/provably-fair/bets/:betId/verify", async (request) => {
    const { user } = auth.getAuth(request);
    const params = z.object({ betId: z.string().uuid() }).parse(request.params);
    return verifyRecordedBet(store.state, params.betId, user);
  });

  app.post("/api/provably-fair/rotate", async (request) => {
    const { user } = auth.getAuth(request);
    const fair = new ProvablyFairService(store.state);
    const revealed = fair.rotateSeed("public_request");
    store.save();
    return { revealed, requestedBy: user.id, activeServerSeedHash: store.state.serverSeed.hash };
  });
}
