import type { AppState, ResponsibleLimits, User } from "../types.js";

const limitCoolingOffMs = 24 * 60 * 60 * 1000;
const rollingDayMs = 24 * 60 * 60 * 1000;

export interface LimitValues {
  maxBet: number;
  dailyDeposit: number;
  dailyLoss: number;
}

export function applyMaturedLimitChange(user: User, now = Date.now()): boolean {
  const pending = user.limits.pendingChange;
  if (!pending || new Date(pending.effectiveAt).getTime() > now) {
    return false;
  }

  user.limits = {
    maxBet: pending.maxBet,
    dailyDeposit: pending.dailyDeposit,
    dailyLoss: pending.dailyLoss
  };
  user.updatedAt = new Date(now).toISOString();
  return true;
}

export function requestLimitChange(user: User, requested: LimitValues, now = Date.now()): ResponsibleLimits {
  applyMaturedLimitChange(user, now);
  const current = user.limits;
  const effective: LimitValues = {
    maxBet: Math.min(current.maxBet, requested.maxBet),
    dailyDeposit: Math.min(current.dailyDeposit, requested.dailyDeposit),
    dailyLoss: Math.min(current.dailyLoss, requested.dailyLoss)
  };
  const hasIncrease =
    requested.maxBet > current.maxBet ||
    requested.dailyDeposit > current.dailyDeposit ||
    requested.dailyLoss > current.dailyLoss;

  if (!hasIncrease) {
    user.limits = effective;
  } else {
    const effectiveAt = new Date(now + limitCoolingOffMs).toISOString();
    user.limits = {
      ...effective,
      coolingOffUntil: effectiveAt,
      pendingChange: { ...requested, effectiveAt }
    };
  }
  user.updatedAt = new Date(now).toISOString();
  return user.limits;
}

export function assertDepositAllowed(state: AppState, user: User, amount: number, now = Date.now()): void {
  if (user.isBlocked) {
    throw new Error("Account is blocked");
  }
  if (user.selfExcludedUntil && new Date(user.selfExcludedUntil).getTime() > now) {
    throw new Error("Self-exclusion blocks deposits while active");
  }

  const since = now - rollingDayMs;
  const deposited = state.deposits
    .filter((deposit) => deposit.userId === user.id && new Date(deposit.createdAt).getTime() >= since)
    .reduce((total, deposit) => total + deposit.amount, 0);
  if (deposited + amount > user.limits.dailyDeposit + 0.000001) {
    throw new Error(`Daily deposit limit is ${user.limits.dailyDeposit} USDC`);
  }
}

export function dailyNetLoss(state: AppState, userId: string, now = Date.now()): number {
  const since = now - rollingDayMs;
  let stakes = 0;
  let payouts = 0;
  for (const entry of state.ledgerEntries) {
    if (entry.userId !== userId || new Date(entry.createdAt).getTime() < since) continue;
    if (entry.type === "bet") {
      stakes += entry.legs.find((leg) => leg.account === `user:${userId}` && leg.side === "debit")?.amount ?? 0;
    } else if (entry.type === "payout") {
      payouts += entry.legs.find((leg) => leg.account === `user:${userId}` && leg.side === "credit")?.amount ?? 0;
    }
  }
  return Math.max(0, stakes - payouts);
}

export function assertDailyLossAllowsBet(state: AppState, user: User, betAmount: number, now = Date.now()): void {
  const loss = dailyNetLoss(state, user.id, now);
  if (loss + betAmount > user.limits.dailyLoss + 0.000001) {
    throw new Error(`Daily loss limit is ${user.limits.dailyLoss} USDC`);
  }
}
