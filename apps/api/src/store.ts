import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import type { AppState, GameConfig, GameId, User } from "./types.js";

const gameIds: GameId[] = ["dice", "mines", "plinko", "orbit", "signal"];

export class Store {
  public state: AppState;
  public readonly mode: "file" | "memory";
  private readonly filePath: string;

  constructor(filePath?: string, mode = resolveStoreMode(filePath)) {
    this.filePath = filePath ?? defaultDataFile();
    this.mode = mode;
    this.state = this.load();
  }

  save(): void {
    if (this.mode === "memory") return;
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, `${JSON.stringify(this.state, null, 2)}\n`, "utf8");
  }

  resetForTests(nextState = createInitialState()): void {
    this.state = nextState;
    this.save();
  }

  private load(): AppState {
    if (this.mode === "memory") {
      return createInitialState();
    }
    if (!existsSync(this.filePath)) {
      const initial = createInitialState();
      mkdirSync(path.dirname(this.filePath), { recursive: true });
      writeFileSync(this.filePath, `${JSON.stringify(initial, null, 2)}\n`, "utf8");
      return initial;
    }

    return normalizeState(JSON.parse(readFileSync(this.filePath, "utf8")) as AppState);
  }
}

export function createInitialState(): AppState {
  const now = new Date().toISOString();
  const seed = randomBytes(32).toString("hex");
  const users: User[] = [
    createUser("demo-player", "Telegram Player", ["player"], 40, now, "tg-demo-player"),
    createUser("demo-admin", "Demo Admin", ["player", "admin", "sandbox_admin", "content_manager", "risk"], 0, now),
    createUser("demo-approver", "Demo Super Admin", ["player", "super_admin"], 0, now),
    createUser("demo-support", "Support Agent", ["support", "risk"], 0, now)
  ];

  const gameConfigs = Object.fromEntries(
    gameIds.map((id) => [id, defaultGameConfig(id, now)])
  ) as Record<GameId, GameConfig>;

  return {
    version: 1,
    users,
    sessions: [],
    bankroll: {
      treasuryBalance: 250,
      pendingWithdrawals: 0,
      lockedBonuses: 0,
      gasReserve: 5,
      minimumReserve: 30,
      emergencyPaused: false,
      dailyCasinoLoss: 0,
      currency: "USDC"
    },
    gameConfigs,
    ledgerEntries: [
      {
        id: randomUUID(),
        type: "seed_funding",
        currency: "USDC",
        description: "Initial MVP treasury funding",
        legs: [
          { account: "external:founder", side: "debit", amount: 250 },
          { account: "treasury:hot_wallet", side: "credit", amount: 250 }
        ],
        createdAt: now
      },
      {
        id: randomUUID(),
        type: "sandbox_adjustment",
        currency: "USDC",
        userId: "demo-player",
        description: "Initial playable demo grant",
        legs: [
          { account: "treasury:hot_wallet", side: "debit", amount: 40 },
          { account: "user:demo-player", side: "credit", amount: 40 }
        ],
        createdAt: now
      }
    ],
    bets: [],
    minesSessions: [],
    withdrawals: [],
    deposits: [],
    ledgerAdjustments: [],
    auditLogs: [],
    contentPages: [
      {
        id: randomUUID(),
        slug: "provably-fair",
        locale: "ru",
        title: "Provably Fair",
        body: "Каждый исход считается на backend через HMAC-SHA256: server seed hash публикуется до ставки, client seed и nonce входят в доказательство.",
        status: "published",
        version: 1,
        updatedAt: now
      },
      {
        id: randomUUID(),
        slug: "responsible-gambling",
        locale: "ru",
        title: "Ответственная игра",
        body: "Доступны лимиты ставки, депозита, дневного проигрыша, cooldown и self-exclusion.",
        status: "published",
        version: 1,
        updatedAt: now
      }
    ],
    supportTickets: [],
    notifications: [],
    analyticsEvents: [],
    idempotency: [],
    walletNonces: [],
    serverSeed: {
      id: randomUUID(),
      seed,
      hash: sha256(seed),
      createdAt: now,
      betsUsed: 0
    },
    revealedSeeds: []
  };
}

function createUser(id: string, username: string, roles: User["roles"], balance: number, now: string, telegramId?: string): User {
  return {
    id,
    telegramId,
    username,
    roles,
    balance,
    riskScore: 8,
    isBlocked: false,
    limits: {
      maxBet: 2,
      dailyDeposit: 50,
      dailyLoss: 20
    },
    createdAt: now,
    updatedAt: now
  };
}

function defaultGameConfig(id: GameId, now: string): GameConfig {
  const defaults: Record<GameId, Omit<GameConfig, "id" | "updatedAt">> = {
    dice: { enabled: true, minBet: 0.01, systemMaxBet: 5, rtpStarter: 0.975, rtpNormal: 0.98, riskPercent: 0.015 },
    mines: { enabled: true, minBet: 0.01, systemMaxBet: 1, rtpStarter: 0.965, rtpNormal: 0.97, riskPercent: 0.0075 },
    plinko: { enabled: true, minBet: 0.01, systemMaxBet: 1, rtpStarter: 0.96, rtpNormal: 0.97, riskPercent: 0.005 },
    orbit: { enabled: true, minBet: 0.01, systemMaxBet: 1, rtpStarter: 0.96, rtpNormal: 0.97, riskPercent: 0.005 },
    signal: { enabled: true, minBet: 0.01, systemMaxBet: 1, rtpStarter: 0.96, rtpNormal: 0.96, riskPercent: 0.004 }
  };

  return { id, ...defaults[id], updatedAt: now };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function defaultDataFile(): string {
  const cwd = process.cwd();
  const repoRoot = cwd.endsWith(`${path.sep}apps${path.sep}api`) ? path.resolve(cwd, "..", "..") : cwd;
  return path.join(repoRoot, "apps", "api", ".data", "dev-db.json");
}

function resolveStoreMode(explicitFilePath?: string): "file" | "memory" {
  if (!explicitFilePath && process.env.VERCEL) return "memory";
  if (process.env.STORE_MODE === "memory") return "memory";
  if (process.env.STORE_MODE === "file") return "file";
  return "file";
}

function normalizeState(state: AppState): AppState {
  const demoAdmin = state.users.find((user) => user.id === "demo-admin");
  if (demoAdmin) {
    demoAdmin.roles = demoAdmin.roles.filter((role) => role !== "super_admin");
  }
  if (!state.users.some((user) => user.id === "demo-approver")) {
    const now = new Date().toISOString();
    state.users.push(createUser("demo-approver", "Demo Super Admin", ["player", "super_admin"], 0, now));
  }
  return state;
}
