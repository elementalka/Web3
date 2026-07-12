export type GameId = "dice" | "mines" | "plinko" | "orbit" | "signal";

export interface User {
  id: string;
  telegramId?: string;
  walletAddress?: string;
  username: string;
  roles: string[];
  balance: number;
  riskScore: number;
  email?: string;
  selfExcludedUntil?: string;
  limits: {
    maxBet: number;
    dailyDeposit: number;
    dailyLoss: number;
    coolingOffUntil?: string;
    pendingChange?: {
      maxBet: number;
      dailyDeposit: number;
      dailyLoss: number;
      effectiveAt: string;
    };
  };
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface FairProof {
  serverSeedId: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  gameId: GameId;
  hmac: string;
}

export interface Bet {
  id: string;
  gameId: GameId;
  betAmount: number;
  payoutAmount: number;
  multiplier: number;
  win: boolean;
  proof: FairProof;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface MinesSession {
  id: string;
  betAmount: number;
  minesCount: number;
  openedCells: number[];
  currentMultiplier: number;
  status: "active" | "cashed_out" | "hit_mine" | "expired";
  minePositions: number[];
  proof: FairProof;
}

export interface GameConfigResponse {
  risk: {
    casinoEquity: number;
    availableRiskBank: number;
    totalUserBalances: number;
    tier: number;
    tierLabel: string;
    gamesEnabled: boolean;
    dailyLossCap: number;
  };
  games: Record<GameId, {
    id: GameId;
    enabled: boolean;
    minBet: number;
    systemMaxBet: number;
    rtpStarter: number;
    rtpNormal: number;
    riskPercent: number;
    maxMultiplier: number;
    limitPreview: {
      minBet: number;
      maxBet: number;
      maxSinglePayout: number;
      maxMultiplier: number;
      available: boolean;
      reason?: string;
    };
  }>;
  serverSeedHash: string;
  revealedSeeds: Array<{ id: string; seed: string; hash: string; revealedAt: string }>;
}

export interface SessionResponse {
  user: User;
  contentPages: Array<{ id: string; slug: string; title: string; body: string; version: number }>;
  notifications: Array<{ id: string; title: string; body: string; read: boolean; createdAt: string }>;
  activeMinesSessions: MinesSession[];
  deposits?: Array<{ id: string; amount: number; status: string; txHash: string; createdAt: string }>;
  withdrawals?: Array<{ id: string; amount: number; status: string; txHash?: string; reason?: string; createdAt: string }>;
  supportTickets?: Array<{
    id: string;
    category: string;
    status: string;
    subject: string;
    messages: Array<{ id: string; body: string; createdAt: string }>;
    createdAt: string;
  }>;
  environment?: {
    appEnv: string;
    demoFunds: boolean;
    persistence: "file" | "memory" | "database";
  };
}

export class ApiClient {
  private readonly baseUrl = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

  constructor(private token?: string) {}

  setToken(token: string): void {
    this.token = token;
  }

  async authTelegram(initData?: string): Promise<AuthResponse> {
    return this.request("/api/auth/telegram", {
      method: "POST",
      body: JSON.stringify({ initData })
    }, false);
  }

  async authDemo(role: "player" | "admin"): Promise<AuthResponse> {
    return this.request("/api/auth/demo", {
      method: "POST",
      body: JSON.stringify({ role })
    }, false);
  }

  async walletNonce(walletAddress: string): Promise<{ nonce: string }> {
    return this.request("/api/auth/wallet/nonce", {
      method: "POST",
      body: JSON.stringify({ walletAddress })
    }, false);
  }

  async authWallet(walletAddress: string, signature: string, nonce: string): Promise<AuthResponse> {
    return this.request("/api/auth/wallet/verify", {
      method: "POST",
      body: JSON.stringify({ walletAddress, signature, nonce })
    }, false);
  }

  session(): Promise<SessionResponse> {
    return this.request("/api/session");
  }

  config(): Promise<GameConfigResponse> {
    return this.request("/api/games/config");
  }

  history(gameId?: GameId): Promise<{ bets: Bet[] }> {
    return this.request(`/api/games/history${gameId ? `?gameId=${gameId}` : ""}`);
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return this.request(path, { method: "POST", body: JSON.stringify(body) });
  }

  get<T>(path: string): Promise<T> {
    return this.request(path);
  }

  private async request<T>(path: string, init: RequestInit = {}, needsAuth = true): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Content-Type", "application/json");
    if (needsAuth && this.token) headers.set("Authorization", `Bearer ${this.token}`);
    if (path.startsWith("/api/admin") || path.startsWith("/api/sandbox")) headers.set("x-admin-2fa", "000000");
    const response = await fetch(`${this.baseUrl}${path}`, { ...init, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message ?? "Request failed");
    }
    return data as T;
  }
}

export function createIdempotencyKey(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
