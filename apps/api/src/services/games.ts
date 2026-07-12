import { randomUUID } from "node:crypto";
import type { AppState, FairProof, GameBet, GameId, MinesSession, User } from "../types";
import { LedgerService, roundMoney } from "./ledger";
import { ProvablyFairService } from "./provablyFair";
import { RiskService } from "./risk";
import { addAnalytics } from "./audit";

export class GameService {
  private readonly ledger: LedgerService;
  private readonly fair: ProvablyFairService;
  private readonly risk: RiskService;

  constructor(private readonly state: AppState) {
    this.ledger = new LedgerService(state);
    this.fair = new ProvablyFairService(state);
    this.risk = new RiskService(state);
  }

  dice(user: User, input: DiceInput): unknown {
    return this.idempotent(user, input.idempotencyKey, () => {
      const chance = clamp(input.chance ?? 49.5, 5, 95);
      const mode = input.mode ?? "under";
      const rtp = this.rtp("dice");
      const multiplier = roundMoney(rtp / (chance / 100));
      this.risk.assertBetAllowed(user, "dice", input.betAmount, multiplier);
      const roll = this.fair.next("dice", input.clientSeed);
      const value = roundMoney(roll.int(0, 9999, "roll") / 100);
      const win = mode === "under" ? value < chance : value > 100 - chance;
      const payoutAmount = win ? roundMoney(input.betAmount * multiplier) : 0;
      const sessionId = randomUUID();
      this.ledger.stake(user, input.betAmount, sessionId);
      this.ledger.payout(user, payoutAmount, sessionId);
      const bet = this.recordBet(user, "dice", sessionId, input.betAmount, payoutAmount, multiplier, win, roll.proof, {
        chance,
        mode,
        roll: value
      });
      addAnalytics(this.state, "dice_bet_result", { betAmount: input.betAmount, payoutAmount, chance, mode, roll: value }, user.id, "dice");
      return { bet, balance: user.balance };
    });
  }

  startMines(user: User, input: MinesStartInput): unknown {
    return this.idempotent(user, input.idempotencyKey, () => {
      const minesCount = Math.trunc(clamp(input.minesCount ?? 3, 3, 12));
      const cap = this.risk.maxMultiplier("mines");
      this.risk.assertBetAllowed(user, "mines", input.betAmount, cap);
      const roll = this.fair.next("mines", input.clientSeed);
      const minePositions = sampleWithoutReplacement(25, minesCount, roll.floats(25, "mines"));
      const session: MinesSession = {
        id: randomUUID(),
        userId: user.id,
        betAmount: input.betAmount,
        minesCount,
        minePositions,
        openedCells: [],
        currentMultiplier: 1,
        status: "active",
        proof: roll.proof,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      this.ledger.stake(user, input.betAmount, session.id);
      this.state.minesSessions.unshift(session);
      addAnalytics(this.state, "mines_round_started", { betAmount: input.betAmount, minesCount }, user.id, "mines");
      return { session: publicMinesSession(session), balance: user.balance };
    });
  }

  revealMinesCell(user: User, sessionId: string, cell: number): unknown {
    const session = this.findActiveMinesSession(user, sessionId);
    const cellIndex = Math.trunc(cell);
    if (cellIndex < 0 || cellIndex >= 25) {
      throw new Error("Cell is outside the 5x5 grid");
    }
    if (session.openedCells.includes(cellIndex)) {
      throw new Error("Cell already opened");
    }

    if (session.minePositions.includes(cellIndex)) {
      session.status = "hit_mine";
      session.openedCells.push(cellIndex);
      session.updatedAt = new Date().toISOString();
      const bet = this.recordBet(user, "mines", session.id, session.betAmount, 0, 0, false, session.proof, {
        minesCount: session.minesCount,
        openedCells: session.openedCells,
        minePositions: session.minePositions,
        hitCell: cellIndex
      });
      addAnalytics(this.state, "mines_hit_mine", { sessionId, cell: cellIndex }, user.id, "mines");
      return { bet, session: publicMinesSession(session), balance: user.balance };
    }

    session.openedCells.push(cellIndex);
    session.currentMultiplier = minesMultiplier(session.minesCount, session.openedCells.length, this.rtp("mines"), this.risk.maxMultiplier("mines"));
    session.updatedAt = new Date().toISOString();
    addAnalytics(this.state, "mines_cell_revealed", { sessionId, cell: cellIndex, multiplier: session.currentMultiplier }, user.id, "mines");
    return { session: publicMinesSession(session), balance: user.balance };
  }

  cashoutMines(user: User, sessionId: string): unknown {
    const session = this.findActiveMinesSession(user, sessionId);
    if (session.openedCells.length === 0) {
      throw new Error("Open at least one safe cell before cashout");
    }
    const payoutAmount = roundMoney(session.betAmount * session.currentMultiplier);
    session.status = "cashed_out";
    session.updatedAt = new Date().toISOString();
    this.ledger.payout(user, payoutAmount, session.id);
    const bet = this.recordBet(user, "mines", session.id, session.betAmount, payoutAmount, session.currentMultiplier, true, session.proof, {
      minesCount: session.minesCount,
      openedCells: session.openedCells,
      minePositions: session.minePositions
    });
    addAnalytics(this.state, "mines_cashout", { sessionId, payoutAmount, multiplier: session.currentMultiplier }, user.id, "mines");
    return { bet, session: publicMinesSession(session), balance: user.balance };
  }

  plinko(user: User, input: PlinkoInput): unknown {
    return this.idempotent(user, input.idempotencyKey, () => {
      const riskMode = input.riskMode ?? "low";
      const table = plinkoTables[riskMode];
      if (riskMode === "high" && this.risk.snapshot().availableRiskBank < 1000) {
        throw new Error("High-risk Plinko is locked until availableRiskBank reaches 1000 USDC");
      }
      const maxMultiplier = Math.max(...table);
      this.risk.assertBetAllowed(user, "plinko", input.betAmount, maxMultiplier);
      const roll = this.fair.next("plinko", input.clientSeed);
      const directions: number[] = roll.floats(8, "directions").map((value) => (value >= 0.5 ? 1 : 0));
      const bucketIndex = directions.reduce((acc, value) => acc + value, 0);
      const multiplier = table[bucketIndex];
      const payoutAmount = roundMoney(input.betAmount * multiplier);
      const sessionId = randomUUID();
      this.ledger.stake(user, input.betAmount, sessionId);
      this.ledger.payout(user, payoutAmount, sessionId);
      const bet = this.recordBet(user, "plinko", sessionId, input.betAmount, payoutAmount, multiplier, payoutAmount > input.betAmount, roll.proof, {
        rows: 8,
        riskMode,
        directions,
        bucketIndex
      });
      addAnalytics(this.state, "plinko_drop_result", { betAmount: input.betAmount, payoutAmount, riskMode, bucketIndex }, user.id, "plinko");
      return { bet, balance: user.balance };
    });
  }

  orbit(user: User, input: OrbitInput): unknown {
    return this.idempotent(user, input.idempotencyKey, () => {
      const availableRiskBank = this.risk.snapshot().availableRiskBank;
      const maxMultiplier = this.risk.maxMultiplier("orbit", availableRiskBank);
      this.risk.assertBetAllowed(user, "orbit", input.betAmount, maxMultiplier);
      const roll = this.fair.next("orbit", input.clientSeed);
      const outcome = orbitOutcome(roll.float("orbit"), maxMultiplier);
      const sessionId = randomUUID();
      const payoutAmount = roundMoney(input.betAmount * outcome.multiplier);
      this.ledger.stake(user, input.betAmount, sessionId);
      this.ledger.payout(user, payoutAmount, sessionId);
      const bet = this.recordBet(user, "orbit", sessionId, input.betAmount, payoutAmount, outcome.multiplier, payoutAmount > input.betAmount, roll.proof, {
        selectedOrbit: input.selectedOrbit,
        outcomeType: outcome.label,
        payoutTable: maxMultiplier >= 10 ? "normal" : "starter"
      });
      addAnalytics(this.state, "orbit_bet_result", { betAmount: input.betAmount, payoutAmount, outcome: outcome.label }, user.id, "orbit");
      return { bet, balance: user.balance };
    });
  }

  signal(user: User, input: SignalInput): unknown {
    return this.idempotent(user, input.idempotencyKey, () => {
      const selectedSignal = input.selectedSignal;
      if (!signals.includes(selectedSignal)) {
        throw new Error("Unknown signal");
      }
      const multiplier = 4.8;
      this.risk.assertBetAllowed(user, "signal", input.betAmount, multiplier);
      const roll = this.fair.next("signal", input.clientSeed);
      const winningSignal = signals[roll.int(0, signals.length - 1, "winner")];
      const win = selectedSignal === winningSignal;
      const payoutAmount = win ? roundMoney(input.betAmount * multiplier) : 0;
      const sessionId = randomUUID();
      this.ledger.stake(user, input.betAmount, sessionId);
      this.ledger.payout(user, payoutAmount, sessionId);
      const bet = this.recordBet(user, "signal", sessionId, input.betAmount, payoutAmount, multiplier, win, roll.proof, {
        selectedSignal,
        winningSignal
      });
      addAnalytics(this.state, "signal_bet_result", { betAmount: input.betAmount, payoutAmount, selectedSignal, winningSignal }, user.id, "signal");
      return { bet, balance: user.balance };
    });
  }

  history(user: User, gameId?: GameId): GameBet[] {
    return this.state.bets
      .filter((bet) => bet.userId === user.id && (!gameId || bet.gameId === gameId))
      .slice(0, 30);
  }

  publicConfig(user: User) {
    const risk = this.risk.snapshot();
    return {
      risk,
      games: Object.fromEntries(
        Object.values(this.state.gameConfigs).map((config) => [
          config.id,
          {
            ...config,
            maxMultiplier: this.risk.maxMultiplier(config.id),
            limitPreview: this.risk.limitFor(user, config.id, this.risk.maxMultiplier(config.id))
          }
        ])
      ),
      serverSeedHash: this.state.serverSeed.hash,
      revealedSeeds: this.state.revealedSeeds.slice(0, 5)
    };
  }

  private idempotent(user: User, key: string, handler: () => unknown): unknown {
    if (!key || key.length < 8) {
      throw new Error("idempotencyKey is required");
    }
    const existing = this.state.idempotency.find((item) => item.key === key && item.userId === user.id);
    if (existing) {
      return existing.response;
    }
    const response = handler();
    this.state.idempotency.unshift({ key, userId: user.id, response, createdAt: new Date().toISOString() });
    this.state.idempotency = this.state.idempotency.slice(0, 1000);
    return response;
  }

  private recordBet(
    user: User,
    gameId: GameId,
    sessionId: string,
    betAmount: number,
    payoutAmount: number,
    multiplier: number,
    win: boolean,
    proof: FairProof,
    payload: Record<string, unknown>
  ): GameBet {
    const bet: GameBet = {
      id: randomUUID(),
      sessionId,
      userId: user.id,
      gameId,
      betAmount,
      payoutAmount,
      multiplier,
      win,
      proof,
      payload,
      createdAt: new Date().toISOString()
    };
    this.state.bets.unshift(bet);
    addAnalytics(this.state, "game_bet_result", {
      betAmount,
      payoutAmount,
      multiplier,
      win,
      sessionId
    }, user.id, gameId);
    return bet;
  }

  private findActiveMinesSession(user: User, sessionId: string): MinesSession {
    const session = this.state.minesSessions.find((candidate) => candidate.id === sessionId && candidate.userId === user.id);
    if (!session) {
      throw new Error("Mines session not found");
    }
    if (session.status !== "active") {
      throw new Error("Mines session is already closed");
    }
    return session;
  }

  private rtp(gameId: GameId): number {
    const config = this.state.gameConfigs[gameId];
    return this.risk.snapshot().tier <= 1 ? config.rtpStarter : config.rtpNormal;
  }
}

export interface DiceInput {
  idempotencyKey: string;
  betAmount: number;
  chance?: number;
  mode?: "under" | "over";
  clientSeed?: string;
}

export interface MinesStartInput {
  idempotencyKey: string;
  betAmount: number;
  minesCount?: number;
  clientSeed?: string;
}

export interface PlinkoInput {
  idempotencyKey: string;
  betAmount: number;
  riskMode?: "low" | "medium" | "high";
  clientSeed?: string;
}

export interface OrbitInput {
  idempotencyKey: string;
  betAmount: number;
  selectedOrbit: number;
  clientSeed?: string;
}

export interface SignalInput {
  idempotencyKey: string;
  betAmount: number;
  selectedSignal: Signal;
  clientSeed?: string;
}

export type Signal = "Alpha" | "Nova" | "Echo" | "Ghost" | "Pulse";

export const signals: Signal[] = ["Alpha", "Nova", "Echo", "Ghost", "Pulse"];

export const plinkoTables = {
  low: [2, 1.45, 1.15, 0.95, 0.68, 0.95, 1.15, 1.45, 2],
  medium: [5, 2, 1.3, 0.75, 0.67, 0.75, 1.3, 2, 5],
  high: [25, 3, 1.15, 0.682, 0.1, 0.682, 1.15, 3, 25]
} as const;

export const orbitTables = {
  starter: [
    { probability: 0.604, multiplier: 0, label: "0x" },
    { probability: 0.34, multiplier: 2, label: "2x" },
    { probability: 0.056, multiplier: 5, label: "5x" }
  ],
  normal: [
    { probability: 0.61, multiplier: 0, label: "0x" },
    { probability: 0.34, multiplier: 2, label: "2x" },
    { probability: 0.042, multiplier: 5, label: "5x" },
    { probability: 0.008, multiplier: 10, label: "10x" }
  ]
} as const;

export function orbitOutcome(value: number, maxMultiplier: number): { multiplier: number; label: string } {
  const table = maxMultiplier >= 10 ? orbitTables.normal : orbitTables.starter;
  let threshold = 0;
  for (const item of table) {
    threshold += item.probability;
    if (value < threshold) return item;
  }
  return table[table.length - 1];
}

function publicMinesSession(session: MinesSession) {
  return {
    ...session,
    minePositions: session.status === "active" ? [] : session.minePositions
  };
}

function minesMultiplier(minesCount: number, openedCells: number, rtp: number, cap: number): number {
  const survivalProbability = combinations(25 - minesCount, openedCells) / combinations(25, openedCells);
  return roundMoney(Math.min((1 / survivalProbability) * rtp, cap));
}

function combinations(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  const smallK = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= smallK; i += 1) {
    result = (result * (n - smallK + i)) / i;
  }
  return result;
}

export function sampleWithoutReplacement(size: number, count: number, randoms: number[]): number[] {
  const values = Array.from({ length: size }, (_, index) => index);
  for (let i = values.length - 1; i > 0; i -= 1) {
    const random = randoms[(values.length - 1 - i) % randoms.length];
    const j = Math.floor(random * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values.slice(0, count).sort((a, b) => a - b);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}
