import type { AppState, GameId } from "../types";
import { GameService } from "./games";

export class SandboxService {
  constructor(private readonly state: AppState) {}

  simulate(gameId: GameId, rounds = 1000): SandboxReport {
    const boundedRounds = Math.min(Math.max(Math.trunc(rounds), 1), 10000);
    const baselineUser = this.state.users.find((user) => user.id === "demo-player") ?? this.state.users[0];
    const shadowState: AppState = JSON.parse(JSON.stringify(this.state));
    const user = shadowState.users.find((item) => item.id === baselineUser.id)!;
    user.balance = 100000;
    shadowState.bankroll.treasuryBalance = 120000;
    shadowState.bankroll.minimumReserve = 30;
    shadowState.bankroll.pendingWithdrawals = 0;
    const games = new GameService(shadowState);
    let wagered = 0;
    let paid = 0;
    let wins = 0;

    for (let i = 0; i < boundedRounds; i += 1) {
      const idempotencyKey = `sandbox-${gameId}-${i}-${Date.now()}`;
      const result = runSimulatedRound(games, user, gameId, idempotencyKey) as { bet?: { betAmount: number; payoutAmount: number; win: boolean } };
      const bet = result.bet;
      if (bet) {
        wagered += bet.betAmount;
        paid += bet.payoutAmount;
        if (bet.win) wins += 1;
      }
    }

    return {
      gameId,
      rounds: boundedRounds,
      wagered: round(wagered),
      paid: round(paid),
      actualRtp: wagered > 0 ? round(paid / wagered) : 0,
      winRate: round(wins / boundedRounds),
      generatedAt: new Date().toISOString()
    };
  }
}

export interface SandboxReport {
  gameId: GameId;
  rounds: number;
  wagered: number;
  paid: number;
  actualRtp: number;
  winRate: number;
  generatedAt: string;
}

function runSimulatedRound(games: GameService, user: Parameters<GameService["dice"]>[0], gameId: GameId, idempotencyKey: string): unknown {
  const base = { idempotencyKey, betAmount: 0.05, clientSeed: `sandbox-${idempotencyKey}` };
  if (gameId === "dice") return games.dice(user, { ...base, chance: 49.5, mode: "under" });
  if (gameId === "plinko") return games.plinko(user, { ...base, riskMode: "low" });
  if (gameId === "orbit") return games.orbit(user, { ...base, selectedOrbit: 2 });
  if (gameId === "signal") return games.signal(user, { ...base, selectedSignal: "Alpha" });

  const started = games.startMines(user, { ...base, minesCount: 3 }) as { session: { id: string; status: string } };
  for (let cell = 0; cell < 25; cell += 1) {
    const revealed = games.revealMinesCell(user, started.session.id, cell) as { session: { status: string; openedCells: number[] } };
    if (revealed.session.status !== "active") return { bet: { betAmount: base.betAmount, payoutAmount: 0, win: false } };
    if (revealed.session.openedCells.length >= 2) return games.cashoutMines(user, started.session.id);
  }
  return games.cashoutMines(user, started.session.id);
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}
