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
    persistence: "file" | "memory" | "redis" | "database";
  };
}

interface ApiErrorPayload {
  message?: string;
  errorCode?: string;
  requestId?: string;
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly path: string,
    public readonly errorCode?: string,
    public readonly requestId?: string
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export class ApiClient {
  private readonly baseUrl = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

  constructor(private token?: string) {}

  setToken(token: string): void {
    this.token = token;
  }

  clearToken(): void {
    this.token = undefined;
  }

  hasToken(): boolean {
    return Boolean(this.token);
  }

  async authTelegram(initData?: string): Promise<AuthResponse> {
    const path = "/api/auth/telegram";
    const response = await this.request<AuthResponse>(path, {
      method: "POST",
      body: JSON.stringify({ initData })
    }, false);
    return requireAuthResponse(response, path);
  }

  async authDemo(role: "player" | "admin"): Promise<AuthResponse> {
    const path = "/api/auth/demo";
    const response = await this.request<AuthResponse>(path, {
      method: "POST",
      body: JSON.stringify({ role })
    }, false);
    return requireAuthResponse(response, path);
  }

  async walletNonce(walletAddress: string): Promise<{ nonce: string }> {
    return this.request("/api/auth/wallet/nonce", {
      method: "POST",
      body: JSON.stringify({ walletAddress })
    }, false);
  }

  async authWallet(walletAddress: string, signature: string, nonce: string): Promise<AuthResponse> {
    const path = "/api/auth/wallet/verify";
    const response = await this.request<AuthResponse>(path, {
      method: "POST",
      body: JSON.stringify({ walletAddress, signature, nonce })
    }, false);
    return requireAuthResponse(response, path);
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
    const controller = new AbortController();
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 15_000);
    const forwardAbort = () => controller.abort(init.signal?.reason);
    if (init.signal?.aborted) forwardAbort();
    else init.signal?.addEventListener("abort", forwardAbort, { once: true });

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, { ...init, headers, signal: controller.signal });
    } catch {
      throw new ApiRequestError(
        timedOut ? "Demo API did not respond in time" : "Could not reach the demo API",
        timedOut ? 408 : 0,
        path,
        timedOut ? "REQUEST_TIMEOUT" : "NETWORK_ERROR"
      );
    } finally {
      window.clearTimeout(timeout);
      init.signal?.removeEventListener("abort", forwardAbort);
    }

    const isJson = response.headers.get("content-type")?.toLowerCase().includes("application/json") === true;
    let parsed: unknown;
    let parseFailed = false;
    if (isJson) {
      try {
        parsed = await response.json();
      } catch {
        parseFailed = true;
      }
    }
    const data: ApiErrorPayload = isRecord(parsed) ? parsed : {};
    if (!response.ok) {
      const fallback = response.status === 404
        ? `Demo API route was not found (${path})`
        : response.status >= 500
          ? `Demo API is temporarily unavailable (HTTP ${response.status})`
          : `Request failed (HTTP ${response.status})`;
      throw new ApiRequestError(data.message ?? fallback, response.status, path, data.errorCode, data.requestId);
    }
    if (!isJson || parseFailed || !isRecord(parsed)) {
      throw new ApiRequestError("Demo API returned an invalid response", 502, path, "INVALID_API_RESPONSE");
    }
    return parsed as T;
  }
}

function requireAuthResponse(value: AuthResponse, path: string): AuthResponse {
  if (
    !value
    || typeof value.token !== "string"
    || value.token.trim().length === 0
    || value.token.length > 4096
    || !value.user
    || typeof value.user.id !== "string"
    || value.user.id.trim().length === 0
  ) {
    throw new ApiRequestError("Demo API returned an invalid authentication response", 502, path, "INVALID_AUTH_RESPONSE");
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function createIdempotencyKey(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
