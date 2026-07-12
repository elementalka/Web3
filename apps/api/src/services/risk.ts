import type { AppState, GameId, GameLimit, RiskSnapshot, User } from "../types.js";
import { roundMoney } from "./ledger.js";
import { applyMaturedLimitChange, assertDailyLossAllowsBet } from "./responsible.js";

export class RiskService {
  constructor(private readonly state: AppState) {}

  snapshot(): RiskSnapshot {
    const totalUserBalances = roundMoney(this.state.users.reduce((acc, user) => acc + Math.max(user.balance, 0), 0));
    const casinoEquity = roundMoney(
      this.state.bankroll.treasuryBalance -
        totalUserBalances -
        this.state.bankroll.pendingWithdrawals -
        this.state.bankroll.lockedBonuses -
        this.state.bankroll.gasReserve
    );
    const availableRiskBank = roundMoney(Math.max(casinoEquity - this.state.bankroll.minimumReserve, 0));
    const tier = tierFor(availableRiskBank);
    return {
      casinoEquity,
      availableRiskBank,
      totalUserBalances,
      tier,
      tierLabel: tierLabel(tier),
      gamesEnabled: !this.state.bankroll.emergencyPaused && tier > 0,
      dailyLossCap: roundMoney(availableRiskBank * (tier <= 1 ? 0.1 : tier === 2 ? 0.125 : 0.15))
    };
  }

  limitFor(user: User, gameId: GameId, multiplier: number): GameLimit {
    applyMaturedLimitChange(user);
    const config = this.state.gameConfigs[gameId];
    const snapshot = this.snapshot();
    const maxMultiplier = this.maxMultiplier(gameId, snapshot.availableRiskBank, snapshot.tier);
    const boundedMultiplier = Math.min(multiplier, maxMultiplier);
    const maxSinglePayout = roundMoney(snapshot.availableRiskBank * config.riskPercent);
    const dynamicMax = boundedMultiplier <= 1
      ? config.systemMaxBet
      : maxSinglePayout / Math.max(boundedMultiplier - 1, 0.01);
    const maxBet = roundMoney(Math.max(0, Math.min(config.systemMaxBet, user.limits.maxBet, dynamicMax)));

    if (!config.enabled) {
      return { minBet: config.minBet, maxBet: 0, maxSinglePayout, maxMultiplier, available: false, reason: "Game disabled" };
    }
    if (!snapshot.gamesEnabled) {
      return { minBet: config.minBet, maxBet: 0, maxSinglePayout, maxMultiplier, available: false, reason: "Bankroll risk tier disables games" };
    }
    if (user.isBlocked || (user.selfExcludedUntil && new Date(user.selfExcludedUntil).getTime() > Date.now())) {
      return { minBet: config.minBet, maxBet: 0, maxSinglePayout, maxMultiplier, available: false, reason: "Responsible gambling lock is active" };
    }

    return { minBet: config.minBet, maxBet, maxSinglePayout, maxMultiplier, available: true };
  }

  assertBetAllowed(user: User, gameId: GameId, betAmount: number, multiplier: number): GameLimit {
    const limit = this.limitFor(user, gameId, multiplier);
    if (!limit.available) {
      throw new Error(limit.reason ?? "Game unavailable");
    }
    if (betAmount < limit.minBet) {
      throw new Error(`Minimum bet is ${limit.minBet} USDC`);
    }
    if (betAmount > limit.maxBet + 0.000001) {
      throw new Error(`Bet exceeds dynamic max bet ${limit.maxBet} USDC`);
    }
    if (user.balance + 0.000001 < betAmount) {
      throw new Error("Insufficient user balance");
    }
    assertDailyLossAllowsBet(this.state, user, betAmount);
    return limit;
  }

  maxMultiplier(gameId: GameId, availableRiskBank = this.snapshot().availableRiskBank, tier = this.snapshot().tier): number {
    if (gameId === "dice") return 19.5;
    if (gameId === "mines") return tier <= 1 ? 4 : tier === 2 ? 10 : 25;
    if (gameId === "plinko") return tier <= 1 ? 5 : tier === 2 ? 5 : 25;
    if (gameId === "orbit") return availableRiskBank >= 500 ? 10 : 5;
    return 4.8;
  }
}

function tierFor(availableRiskBank: number): RiskSnapshot["tier"] {
  if (availableRiskBank < 50) return 0;
  if (availableRiskBank < 200) return 1;
  if (availableRiskBank < 1000) return 2;
  if (availableRiskBank < 5000) return 3;
  return 4;
}

function tierLabel(tier: RiskSnapshot["tier"]): RiskSnapshot["tierLabel"] {
  return ["Critical", "Starter", "Normal", "Growth", "Stable"][tier] as RiskSnapshot["tierLabel"];
}
