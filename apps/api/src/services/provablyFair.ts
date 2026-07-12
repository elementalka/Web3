import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import type { AppState, FairProof, GameId, RevealedSeed } from "../types.js";

export class ProvablyFairService {
  constructor(private readonly state: AppState) {}

  next(gameId: GameId, clientSeed?: string): FairRoll {
    if (this.state.serverSeed.betsUsed >= 1000 && !this.hasActiveMinesForCurrentSeed()) {
      this.rotateSeed("automatic_1000_bets");
    }

    const seed = this.state.serverSeed;
    const nonce = seed.betsUsed + 1;
    const cleanClientSeed = clientSeed?.trim() || `client-${randomBytes(8).toString("hex")}`;
    const message = `${cleanClientSeed}:${nonce}:${gameId}`;
    const hmac = createHmac("sha256", seed.seed).update(message).digest("hex");
    seed.betsUsed += 1;

    const proof: FairProof = {
      serverSeedId: seed.id,
      serverSeedHash: seed.hash,
      clientSeed: cleanClientSeed,
      nonce,
      gameId,
      hmac
    };

    return {
      proof,
      float: (salt = "0") => this.floatFromProof(proof, salt),
      floats: (count: number, salt = "batch") => Array.from({ length: count }, (_, index) => this.floatFromProof(proof, `${salt}:${index}`)),
      int: (min: number, maxInclusive: number, salt = "int") => {
        const value = this.floatFromProof(proof, salt);
        return Math.floor(value * (maxInclusive - min + 1)) + min;
      }
    };
  }

  verify(serverSeed: string, clientSeed: string, nonce: number, gameId: GameId): { serverSeedHash: string; hmac: string; verificationScope: "commitment_only" } {
    return {
      serverSeedHash: sha256(serverSeed),
      hmac: createHmac("sha256", serverSeed).update(`${clientSeed}:${nonce}:${gameId}`).digest("hex"),
      verificationScope: "commitment_only"
    };
  }

  floatForRevealedSeed(serverSeed: string, proof: FairProof, salt: string): number {
    return floatFromSeed(serverSeed, proof, salt);
  }

  rotateSeed(reason: string): RevealedSeed {
    const current = this.state.serverSeed;
    if (this.hasActiveMinesForCurrentSeed()) {
      throw new Error("Server seed cannot be revealed while a Mines session using it is active");
    }
    const revealed: RevealedSeed = {
      id: current.id,
      seed: current.seed,
      hash: current.hash,
      createdAt: current.createdAt,
      betsUsed: current.betsUsed,
      revealedAt: new Date().toISOString()
    };
    const nextSeed = randomBytes(32).toString("hex");
    this.state.revealedSeeds.unshift(revealed);
    this.state.serverSeed = {
      id: randomUUID(),
      seed: nextSeed,
      hash: sha256(nextSeed),
      createdAt: new Date().toISOString(),
      betsUsed: 0
    };
    void reason;
    return revealed;
  }

  private hasActiveMinesForCurrentSeed(): boolean {
    return this.state.minesSessions.some((session) =>
      session.status === "active" && session.proof.serverSeedId === this.state.serverSeed.id
    );
  }

  private floatFromProof(proof: FairProof, salt: string): number {
    const seed = this.state.serverSeed.id === proof.serverSeedId
      ? this.state.serverSeed.seed
      : this.state.revealedSeeds.find((candidate) => candidate.id === proof.serverSeedId)?.seed;
    if (!seed) {
      throw new Error("Server seed for proof is not available");
    }
    return floatFromSeed(seed, proof, salt);
  }
}

export interface FairRoll {
  proof: FairProof;
  float: (salt?: string) => number;
  floats: (count: number, salt?: string) => number[];
  int: (min: number, maxInclusive: number, salt?: string) => number;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function floatFromSeed(serverSeed: string, proof: FairProof, salt: string): number {
  const digest = createHmac("sha256", serverSeed)
    .update(`${proof.clientSeed}:${proof.nonce}:${proof.gameId}:${salt}`)
    .digest("hex");
  const slice = digest.slice(0, 13);
  return Number.parseInt(slice, 16) / 0x10_0000_0000_0000;
}
