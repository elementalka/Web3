import { randomUUID } from "node:crypto";
import type { AppState, Currency, LedgerEntry, User, Withdrawal } from "../types.js";

export class LedgerService {
  constructor(private readonly state: AppState) {}

  deposit(user: User, amount: number, txHash = `testnet-${randomUUID()}`): LedgerEntry {
    assertPositiveAmount(amount);
    user.balance = roundMoney(user.balance + amount);
    user.updatedAt = new Date().toISOString();
    this.state.bankroll.treasuryBalance = roundMoney(this.state.bankroll.treasuryBalance + amount);
    const entry = this.entry("deposit", "USDC", `Confirmed testnet deposit ${txHash}`, [
      { account: "treasury:hot_wallet", side: "debit", amount },
      { account: `user:${user.id}`, side: "credit", amount }
    ], user.id, { txHash });
    this.state.deposits.unshift({
      id: randomUUID(),
      userId: user.id,
      amount,
      currency: "USDC",
      status: "confirmed",
      txHash,
      createdAt: new Date().toISOString()
    });
    return entry;
  }

  stake(user: User, amount: number, gameSessionId: string): LedgerEntry {
    assertPositiveAmount(amount);
    if (user.balance + 1e-9 < amount) {
      throw new Error("Insufficient user balance");
    }
    user.balance = roundMoney(user.balance - amount);
    user.updatedAt = new Date().toISOString();
    return this.entry("bet", "USDC", "Game stake", [
      { account: `user:${user.id}`, side: "debit", amount },
      { account: "casino:game_revenue", side: "credit", amount }
    ], user.id, { gameSessionId });
  }

  payout(user: User, amount: number, gameSessionId: string): LedgerEntry | undefined {
    if (amount <= 0) return undefined;
    assertPositiveAmount(amount);
    user.balance = roundMoney(user.balance + amount);
    user.updatedAt = new Date().toISOString();
    return this.entry("payout", "USDC", "Game payout", [
      { account: "casino:game_revenue", side: "debit", amount },
      { account: `user:${user.id}`, side: "credit", amount }
    ], user.id, { gameSessionId });
  }

  requestWithdrawal(user: User, amount: number, autoConfirm: boolean): void {
    assertPositiveAmount(amount);
    if (user.balance + 1e-9 < amount) {
      throw new Error("Insufficient user balance");
    }
    user.balance = roundMoney(user.balance - amount);
    user.updatedAt = new Date().toISOString();
    const now = new Date().toISOString();
    const withdrawalId = randomUUID();

    this.entry("withdrawal_request", "USDC", autoConfirm ? "Auto withdrawal confirmed" : "Withdrawal pending manual review", [
      { account: `user:${user.id}`, side: "debit", amount },
      { account: autoConfirm ? "treasury:hot_wallet" : "withdrawals:pending", side: "credit", amount }
    ], user.id, { withdrawalId });

    if (autoConfirm) {
      this.state.bankroll.treasuryBalance = roundMoney(this.state.bankroll.treasuryBalance - amount);
    } else {
      this.state.bankroll.pendingWithdrawals = roundMoney(this.state.bankroll.pendingWithdrawals + amount);
    }

    this.state.withdrawals.unshift({
      id: withdrawalId,
      userId: user.id,
      amount,
      currency: "USDC",
      status: autoConfirm ? "confirmed" : "pending_review",
      txHash: autoConfirm ? `testnet-withdraw-${randomUUID()}` : undefined,
      createdAt: now,
      updatedAt: now
    });
  }

  approveWithdrawal(withdrawal: Withdrawal, txHash = `testnet-withdraw-${randomUUID()}`): LedgerEntry {
    if (withdrawal.status !== "pending_review") {
      throw new Error("Withdrawal is not pending review");
    }
    this.state.bankroll.pendingWithdrawals = roundMoney(Math.max(0, this.state.bankroll.pendingWithdrawals - withdrawal.amount));
    this.state.bankroll.treasuryBalance = roundMoney(this.state.bankroll.treasuryBalance - withdrawal.amount);
    withdrawal.status = "confirmed";
    withdrawal.txHash = txHash;
    withdrawal.updatedAt = new Date().toISOString();
    return this.entry("withdrawal_settlement", withdrawal.currency, "Manual withdrawal approved", [
      { account: "withdrawals:pending", side: "debit", amount: withdrawal.amount },
      { account: "treasury:hot_wallet", side: "credit", amount: withdrawal.amount }
    ], withdrawal.userId, { withdrawalId: withdrawal.id, txHash });
  }

  rejectWithdrawal(withdrawal: Withdrawal, reason: string): LedgerEntry {
    if (withdrawal.status !== "pending_review") {
      throw new Error("Withdrawal is not pending review");
    }
    const user = this.state.users.find((candidate) => candidate.id === withdrawal.userId);
    if (!user) {
      throw new Error("Withdrawal user not found");
    }
    this.state.bankroll.pendingWithdrawals = roundMoney(Math.max(0, this.state.bankroll.pendingWithdrawals - withdrawal.amount));
    user.balance = roundMoney(user.balance + withdrawal.amount);
    user.updatedAt = new Date().toISOString();
    withdrawal.status = "rejected";
    withdrawal.reason = reason;
    withdrawal.updatedAt = new Date().toISOString();
    return this.entry("withdrawal_settlement", withdrawal.currency, "Manual withdrawal rejected and returned", [
      { account: "withdrawals:pending", side: "debit", amount: withdrawal.amount },
      { account: `user:${user.id}`, side: "credit", amount: withdrawal.amount }
    ], withdrawal.userId, { withdrawalId: withdrawal.id, reason });
  }

  applyAdjustment(user: User, amount: number, direction: "credit" | "debit", adjustmentId: string): LedgerEntry {
    assertPositiveAmount(amount);
    if (direction === "debit" && user.balance + 1e-9 < amount) {
      throw new Error("Adjustment would make user balance negative");
    }
    user.balance = roundMoney(direction === "credit" ? user.balance + amount : user.balance - amount);
    user.updatedAt = new Date().toISOString();
    const legs = direction === "credit"
      ? [
          { account: "casino:adjustments", side: "debit" as const, amount },
          { account: `user:${user.id}`, side: "credit" as const, amount }
        ]
      : [
          { account: `user:${user.id}`, side: "debit" as const, amount },
          { account: "casino:adjustments", side: "credit" as const, amount }
        ];
    return this.entry("ledger_adjustment", "USDC", "Approved dual-control ledger adjustment", legs, user.id, { adjustmentId });
  }

  reconcile(): { ok: boolean; errors: string[] } {
    const errors = this.state.ledgerEntries.flatMap((entry) => {
      const debits = sum(entry.legs.filter((leg) => leg.side === "debit").map((leg) => leg.amount));
      const credits = sum(entry.legs.filter((leg) => leg.side === "credit").map((leg) => leg.amount));
      return Math.abs(debits - credits) > 0.000001 ? [`Entry ${entry.id} is not balanced`] : [];
    });

    for (const user of this.state.users) {
      if (user.balance < -0.000001) {
        errors.push(`User ${user.id} has a negative balance`);
      }
    }

    return { ok: errors.length === 0, errors };
  }

  private entry(
    type: LedgerEntry["type"],
    currency: Currency,
    description: string,
    legs: LedgerEntry["legs"],
    userId?: string,
    metadata?: Record<string, unknown>
  ): LedgerEntry {
    const debits = sum(legs.filter((leg) => leg.side === "debit").map((leg) => leg.amount));
    const credits = sum(legs.filter((leg) => leg.side === "credit").map((leg) => leg.amount));
    if (Math.abs(debits - credits) > 0.000001) {
      throw new Error("Ledger entry must be double-entry balanced");
    }
    const entry: LedgerEntry = {
      id: randomUUID(),
      type,
      currency,
      userId,
      description,
      legs: legs.map((leg) => ({ ...leg, amount: roundMoney(leg.amount) })),
      metadata,
      createdAt: new Date().toISOString()
    };
    this.state.ledgerEntries.unshift(entry);
    return entry;
  }
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000000) / 1000000;
}

function assertPositiveAmount(amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Amount must be positive");
  }
}

function sum(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}
