import type { AppState, GameBet, User } from "../types";
import { orbitOutcome, plinkoTables, sampleWithoutReplacement, signals } from "./games";
import { roundMoney } from "./ledger";
import { ProvablyFairService } from "./provablyFair";

export interface RecordedBetVerification {
  betId: string;
  serverSeedId: string;
  seedRevealed: true;
  commitmentValid: boolean;
  outcomeValid: boolean;
  valid: boolean;
  algorithm: "HMAC-SHA256 salted outcome derivation v1";
}

export function verifyRecordedBet(state: AppState, betId: string, requester: User): RecordedBetVerification {
  const bet = state.bets.find((candidate) => candidate.id === betId);
  if (!bet) throw new Error("Bet not found");
  const canInspect = bet.userId === requester.id || requester.roles.some((role) => ["admin", "super_admin", "risk"].includes(role));
  if (!canInspect) throw new Error("Insufficient permissions to verify this bet");

  const revealed = state.revealedSeeds.find((seed) => seed.id === bet.proof.serverSeedId);
  if (!revealed) throw new Error("Server seed has not been revealed yet");
  const fair = new ProvablyFairService(state);
  const commitment = fair.verify(revealed.seed, bet.proof.clientSeed, bet.proof.nonce, bet.proof.gameId);
  const commitmentValid = commitment.serverSeedHash === bet.proof.serverSeedHash && commitment.hmac === bet.proof.hmac;
  const outcomeValid = verifyOutcome(fair, revealed.seed, bet);

  return {
    betId: bet.id,
    serverSeedId: bet.proof.serverSeedId,
    seedRevealed: true,
    commitmentValid,
    outcomeValid,
    valid: commitmentValid && outcomeValid,
    algorithm: "HMAC-SHA256 salted outcome derivation v1"
  };
}

function verifyOutcome(fair: ProvablyFairService, serverSeed: string, bet: GameBet): boolean {
  const value = (salt: string) => fair.floatForRevealedSeed(serverSeed, bet.proof, salt);

  if (bet.gameId === "dice") {
    const chance = Number(bet.payload.chance);
    const mode = bet.payload.mode;
    const roll = roundMoney(Math.floor(value("roll") * 10_000) / 100);
    const win = mode === "under" ? roll < chance : roll > 100 - chance;
    return equalNumber(roll, bet.payload.roll) && win === bet.win && equalNumber(win ? bet.betAmount * bet.multiplier : 0, bet.payoutAmount);
  }

  if (bet.gameId === "plinko") {
    const riskMode = bet.payload.riskMode;
    if (riskMode !== "low" && riskMode !== "medium" && riskMode !== "high") return false;
    const directions: number[] = Array.from({ length: 8 }, (_, index) => value(`directions:${index}`) >= 0.5 ? 1 : 0);
    const bucketIndex = directions.reduce((total, direction) => total + direction, 0);
    const multiplier = plinkoTables[riskMode][bucketIndex];
    return equalArrays(directions, bet.payload.directions) &&
      bucketIndex === bet.payload.bucketIndex &&
      equalNumber(multiplier, bet.multiplier) &&
      equalNumber(bet.betAmount * multiplier, bet.payoutAmount);
  }

  if (bet.gameId === "orbit") {
    const maxMultiplier = bet.payload.payoutTable === "normal" ? 10 : 5;
    const outcome = orbitOutcome(value("orbit"), maxMultiplier);
    return outcome.label === bet.payload.outcomeType &&
      equalNumber(outcome.multiplier, bet.multiplier) &&
      equalNumber(bet.betAmount * outcome.multiplier, bet.payoutAmount);
  }

  if (bet.gameId === "signal") {
    const winningSignal = signals[Math.floor(value("winner") * signals.length)];
    const win = winningSignal === bet.payload.selectedSignal;
    return winningSignal === bet.payload.winningSignal &&
      win === bet.win &&
      equalNumber(win ? bet.betAmount * bet.multiplier : 0, bet.payoutAmount);
  }

  const minesCount = Number(bet.payload.minesCount);
  if (!Number.isInteger(minesCount)) return false;
  const randoms = Array.from({ length: 25 }, (_, index) => value(`mines:${index}`));
  const minePositions = sampleWithoutReplacement(25, minesCount, randoms);
  if (!equalArrays(minePositions, bet.payload.minePositions)) return false;
  const openedCells = Array.isArray(bet.payload.openedCells) ? bet.payload.openedCells.map(Number) : [];
  const hitMine = openedCells.some((cell) => minePositions.includes(cell));
  return hitMine
    ? !bet.win && bet.payoutAmount === 0
    : bet.win &&
        openedCells.every((cell) => !minePositions.includes(cell)) &&
        equalNumber(bet.betAmount * bet.multiplier, bet.payoutAmount);
}

function equalNumber(left: number, right: unknown): boolean {
  return typeof right === "number" && Math.abs(roundMoney(left) - roundMoney(right)) <= 0.000001;
}

function equalArrays(expected: number[], actual: unknown): boolean {
  return Array.isArray(actual) && expected.length === actual.length && expected.every((value, index) => value === actual[index]);
}
