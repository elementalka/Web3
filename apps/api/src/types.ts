export type Role =
  | "player"
  | "support"
  | "risk"
  | "admin"
  | "super_admin"
  | "sandbox_admin"
  | "content_manager";

export type GameId = "dice" | "mines" | "plinko" | "orbit" | "signal";
export type Currency = "USDC";
export type EnvironmentName = "development" | "staging" | "production" | "test";

export interface User {
  id: string;
  telegramId?: string;
  walletAddress?: string;
  username: string;
  roles: Role[];
  balance: number;
  email?: string;
  riskScore: number;
  isBlocked: boolean;
  selfExcludedUntil?: string;
  limits: ResponsibleLimits;
  createdAt: string;
  updatedAt: string;
}

export interface ResponsibleLimits {
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
}

export interface SessionToken {
  token: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
}

export interface BankrollState {
  treasuryBalance: number;
  pendingWithdrawals: number;
  lockedBonuses: number;
  gasReserve: number;
  minimumReserve: number;
  emergencyPaused: boolean;
  dailyCasinoLoss: number;
  currency: Currency;
}

export interface GameConfig {
  id: GameId;
  enabled: boolean;
  minBet: number;
  systemMaxBet: number;
  rtpStarter: number;
  rtpNormal: number;
  riskPercent: number;
  updatedAt: string;
}

export interface LedgerLeg {
  account: string;
  side: "debit" | "credit";
  amount: number;
}

export interface LedgerEntry {
  id: string;
  type:
    | "seed_funding"
    | "deposit"
    | "bet"
    | "payout"
    | "withdrawal_request"
    | "withdrawal_settlement"
    | "ledger_adjustment"
    | "sandbox_adjustment";
  currency: Currency;
  userId?: string;
  description: string;
  legs: LedgerLeg[];
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface GameBet {
  id: string;
  sessionId: string;
  userId: string;
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
  userId: string;
  betAmount: number;
  minesCount: number;
  minePositions: number[];
  openedCells: number[];
  currentMultiplier: number;
  status: "active" | "cashed_out" | "hit_mine" | "expired";
  proof: FairProof;
  createdAt: string;
  updatedAt: string;
}

export interface FairProof {
  serverSeedId: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  gameId: GameId;
  hmac: string;
}

export interface ServerSeed {
  id: string;
  seed: string;
  hash: string;
  createdAt: string;
  betsUsed: number;
}

export interface RevealedSeed {
  id: string;
  seed: string;
  hash: string;
  revealedAt: string;
  createdAt: string;
  betsUsed: number;
}

export interface Withdrawal {
  id: string;
  userId: string;
  amount: number;
  currency: Currency;
  status: "pending_review" | "confirmed" | "rejected";
  reason?: string;
  txHash?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Deposit {
  id: string;
  userId: string;
  amount: number;
  currency: Currency;
  status: "confirmed";
  txHash: string;
  createdAt: string;
}

export interface LedgerAdjustment {
  id: string;
  targetUserId: string;
  amount: number;
  direction: "credit" | "debit";
  reason: string;
  incidentUrl: string;
  status: "pending" | "approved" | "rejected";
  requestedBy: string;
  approvedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  actorUserId: string;
  action: string;
  target?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface ContentPage {
  id: string;
  slug: string;
  locale: "ru" | "en";
  title: string;
  body: string;
  status: "draft" | "published";
  version: number;
  updatedAt: string;
}

export interface SupportTicket {
  id: string;
  userId: string;
  category: "payment" | "game" | "responsible" | "account" | "other";
  status: "open" | "waiting_user" | "escalated" | "resolved";
  subject: string;
  messages: Array<{
    id: string;
    authorUserId: string;
    body: string;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationItem {
  id: string;
  userId: string;
  type: "deposit" | "withdrawal" | "reality_check" | "self_exclusion" | "system";
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export interface AnalyticsEvent {
  id: string;
  name: string;
  userId?: string;
  gameId?: GameId;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface IdempotencyRecord {
  key: string;
  userId: string;
  response: unknown;
  createdAt: string;
}

export interface WalletNonce {
  walletAddress: string;
  nonce: string;
  expiresAt: string;
}

export interface AppState {
  version: number;
  users: User[];
  sessions: SessionToken[];
  bankroll: BankrollState;
  gameConfigs: Record<GameId, GameConfig>;
  ledgerEntries: LedgerEntry[];
  bets: GameBet[];
  minesSessions: MinesSession[];
  withdrawals: Withdrawal[];
  deposits: Deposit[];
  ledgerAdjustments: LedgerAdjustment[];
  auditLogs: AuditLog[];
  contentPages: ContentPage[];
  supportTickets: SupportTicket[];
  notifications: NotificationItem[];
  analyticsEvents: AnalyticsEvent[];
  idempotency: IdempotencyRecord[];
  walletNonces: WalletNonce[];
  serverSeed: ServerSeed;
  revealedSeeds: RevealedSeed[];
}

export interface AuthContext {
  user: User;
  token: SessionToken;
}

export interface RiskSnapshot {
  casinoEquity: number;
  availableRiskBank: number;
  totalUserBalances: number;
  tier: 0 | 1 | 2 | 3 | 4;
  tierLabel: "Critical" | "Starter" | "Normal" | "Growth" | "Stable";
  gamesEnabled: boolean;
  dailyLossCap: number;
}

export interface GameLimit {
  minBet: number;
  maxBet: number;
  maxSinglePayout: number;
  maxMultiplier: number;
  available: boolean;
  reason?: string;
}
