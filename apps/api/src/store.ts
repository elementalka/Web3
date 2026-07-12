import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { Redis } from "@upstash/redis";
import type { AppState, GameConfig, GameId, User } from "./types.js";

const gameIds: GameId[] = ["dice", "mines", "plinko", "orbit", "signal"];
const REDIS_LOCK_TTL_MS = 15_000;
const REDIS_LOCK_WAIT_MS = 12_000;
const REDIS_LOCK_RETRY_MS = 40;
const RELEASE_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0`;
const RENEW_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], ARGV[2])
end
return 0`;
const WRITE_STATE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  redis.call("set", KEYS[2], ARGV[2])
  return 1
end
return 0`;

export type StoreMode = "file" | "memory" | "redis";

export interface RemoteJsonStore {
  get<TData>(key: string): Promise<TData | null>;
  set(key: string, value: unknown, options?: { nx?: true; px?: number }): Promise<unknown>;
  eval<TResult>(script: string, keys: string[], args: string[]): Promise<TResult>;
}

export class Store {
  public state: AppState;
  public readonly mode: StoreMode;
  private readonly filePath: string;
  private readonly remote?: RemoteJsonStore;
  private readonly remoteKey: string;
  private readonly remoteLockKey: string;
  private readonly lockRenewals = new Map<string, ReturnType<typeof setTimeout>>();
  private dirty = false;

  constructor(filePath?: string, mode = resolveStoreMode(filePath), remote?: RemoteJsonStore) {
    this.filePath = filePath ?? defaultDataFile();
    this.mode = mode;
    this.remote = mode === "redis" ? remote ?? createRedisClient() : undefined;
    this.remoteKey = process.env.SHOWCASE_REDIS_KEY?.trim() || defaultRedisKey();
    this.remoteLockKey = `${this.remoteKey}:lock`;
    this.state = this.load();
  }

  save(): void {
    if (this.mode === "redis") {
      this.dirty = true;
      return;
    }
    if (this.mode === "memory") return;
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, `${JSON.stringify(this.state, null, 2)}\n`, "utf8");
  }

  async acquireRequestLock(cancelled: () => boolean = () => false): Promise<string | undefined> {
    if (this.mode !== "redis" || !this.remote) return undefined;
    const owner = randomUUID();
    const deadline = Date.now() + REDIS_LOCK_WAIT_MS;

    while (Date.now() < deadline) {
      if (cancelled()) throw new Error("Showcase Redis request was cancelled");
      const acquired = await this.remote.set(this.remoteLockKey, owner, {
        nx: true,
        px: REDIS_LOCK_TTL_MS
      });
      if (acquired) {
        if (cancelled()) {
          await this.releaseRemoteLock(owner);
          throw new Error("Showcase Redis request was cancelled");
        }
        this.scheduleLockRenewal(owner);
        return owner;
      }
      await wait(REDIS_LOCK_RETRY_MS);
    }

    throw new Error("Showcase Redis is busy; retry shortly");
  }

  async refresh(lockOwner?: string): Promise<void> {
    if (this.mode !== "redis" || !this.remote) return;
    if (!lockOwner) throw new Error("Showcase Redis lock is required");
    // A failed response must not be replayed by the following request. The
    // authoritative snapshot is always loaded only after acquiring the lock.
    this.dirty = false;

    const existing = await this.remote.get<unknown>(this.remoteKey);
    if (existing) {
      if (!isAppState(existing)) {
        throw new Error("Showcase Redis contains incompatible state");
      }
      this.state = normalizeState(existing);
      return;
    }

    const initial = createInitialState();
    await this.writeRemoteState(lockOwner, initial);
    this.state = initial;
  }

  async flush(lockOwner?: string): Promise<void> {
    if (this.mode !== "redis" || !this.remote || !this.dirty) return;
    if (!lockOwner) throw new Error("Showcase Redis lock is required");
    await this.writeRemoteState(lockOwner, this.state);
    this.dirty = false;
  }

  async releaseRequestLock(lockOwner?: string): Promise<void> {
    if (this.mode !== "redis" || !this.remote || !lockOwner) return;
    this.dirty = false;
    const renewal = this.lockRenewals.get(lockOwner);
    if (renewal) clearTimeout(renewal);
    this.lockRenewals.delete(lockOwner);
    await this.releaseRemoteLock(lockOwner);
  }

  resetForTests(nextState = createInitialState()): void {
    this.state = nextState;
    this.save();
  }

  private load(): AppState {
    if (this.mode === "memory" || this.mode === "redis") {
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

  private async writeRemoteState(lockOwner: string, state: AppState): Promise<void> {
    const written = await this.remote!.eval<number>(
      WRITE_STATE_SCRIPT,
      [this.remoteLockKey, this.remoteKey],
      [lockOwner, JSON.stringify(state)]
    );
    if (written !== 1) throw new Error("Showcase Redis lock was lost");
  }

  private scheduleLockRenewal(lockOwner: string): void {
    const timer = setTimeout(() => {
      void this.renewRemoteLock(lockOwner);
    }, Math.floor(REDIS_LOCK_TTL_MS / 3));
    timer.unref?.();
    this.lockRenewals.set(lockOwner, timer);
  }

  private async renewRemoteLock(lockOwner: string): Promise<void> {
    if (!this.remote || !this.lockRenewals.has(lockOwner)) return;
    try {
      const renewed = await this.remote.eval<number>(
        RENEW_LOCK_SCRIPT,
        [this.remoteLockKey],
        [lockOwner, String(REDIS_LOCK_TTL_MS)]
      );
      if (renewed !== 1) {
        this.lockRenewals.delete(lockOwner);
        return;
      }
    } catch {
      // Keep retrying while the original lease may still be valid. The atomic
      // write below is the final ownership check and fails closed if it expired.
    }
    if (this.lockRenewals.has(lockOwner)) this.scheduleLockRenewal(lockOwner);
  }

  private async releaseRemoteLock(lockOwner: string): Promise<void> {
    await this.remote!.eval<number>(RELEASE_LOCK_SCRIPT, [this.remoteLockKey], [lockOwner]);
  }
}

export function createInitialState(): AppState {
  const now = new Date().toISOString();
  const seed = randomBytes(32).toString("hex");
  const users: User[] = [
    createUser("demo-player", "Telegram Player", ["player"], 40, now, "100001"),
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

function resolveStoreMode(explicitFilePath?: string): StoreMode {
  if (process.env.STORE_MODE === "redis") return "redis";
  if (process.env.STORE_MODE === "memory") return "memory";
  if (process.env.STORE_MODE === "file") return "file";
  if (redisEnvironmentPresent()) return "redis";
  if (!explicitFilePath && process.env.VERCEL) return "memory";
  return "file";
}

function redisEnvironmentPresent(): boolean {
  return [
    process.env.UPSTASH_REDIS_REST_URL,
    process.env.UPSTASH_REDIS_REST_TOKEN,
    process.env.KV_REST_API_URL,
    process.env.KV_REST_API_TOKEN
  ].some((value) => Boolean(value?.trim()));
}

function createRedisClient(): RemoteJsonStore {
  const { url, token } = redisCredentials();
  const redis = new Redis({ url, token });
  return {
    get<TData>(key: string): Promise<TData | null> {
      return redis.get<TData>(key);
    },
    set(key: string, value: unknown, options?: { nx?: true; px?: number }): Promise<unknown> {
      if (options?.nx && options.px) return redis.set(key, value, { nx: true, px: options.px });
      if (options?.nx) return redis.set(key, value, { nx: true });
      if (options?.px) return redis.set(key, value, { px: options.px });
      return redis.set(key, value);
    },
    eval<TResult>(script: string, keys: string[], args: string[]): Promise<TResult> {
      return redis.eval<string[], TResult>(script, keys, args);
    }
  };
}

function redisCredentials(): { url: string; token: string } {
  const marketplaceUrl = process.env.KV_REST_API_URL?.trim();
  const marketplaceToken = process.env.KV_REST_API_TOKEN?.trim();
  if (marketplaceUrl && marketplaceToken) {
    return { url: marketplaceUrl, token: marketplaceToken };
  }

  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (upstashUrl && upstashToken) {
    return { url: upstashUrl, token: upstashToken };
  }

  throw new Error("Showcase Redis is not configured securely");
}

function normalizeState(state: AppState): AppState {
  const demoPlayer = state.users.find((user) => user.id === "demo-player");
  if (demoPlayer) {
    state.users = state.users.filter(
      (user) => user.id === demoPlayer.id || user.telegramId !== "100001"
    );
    demoPlayer.telegramId = "100001";
  }
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

function defaultRedisKey(): string {
  const project = redisNamespacePart(process.env.VERCEL_PROJECT_ID || "local");
  const environment = redisNamespacePart(
    process.env.VERCEL_TARGET_ENV
      || process.env.VERCEL_ENV
      || process.env.APP_ENV
      || "development"
  );
  return `web3-casino:showcase:state:v1:${project}:${environment}`;
}

function redisNamespacePart(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").slice(0, 96) || "unknown";
}

function isAppState(value: unknown): value is AppState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<AppState>;
  const arrayFields: Array<keyof AppState> = [
    "users",
    "sessions",
    "ledgerEntries",
    "bets",
    "minesSessions",
    "withdrawals",
    "deposits",
    "ledgerAdjustments",
    "auditLogs",
    "contentPages",
    "supportTickets",
    "notifications",
    "analyticsEvents",
    "idempotency",
    "walletNonces",
    "revealedSeeds"
  ];
  return state.version === 1
    && arrayFields.every((field) => Array.isArray(state[field]))
    && Boolean(state.bankroll && typeof state.bankroll === "object")
    && Boolean(state.gameConfigs && typeof state.gameConfigs === "object")
    && Boolean(state.serverSeed && typeof state.serverSeed === "object");
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
