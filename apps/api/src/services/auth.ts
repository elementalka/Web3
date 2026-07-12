import { randomBytes, randomUUID } from "node:crypto";
import { ethers } from "ethers";
import type { FastifyRequest } from "fastify";
import type { AppState, AuthContext, Role, SessionToken, User } from "../types.js";
import { Store } from "../store.js";
import { validateTelegramInitData, type TelegramUserPayload } from "./telegramAuth.js";
import { applyMaturedLimitChange } from "./responsible.js";

const sessionTtlMs = 1000 * 60 * 60 * 24 * 14;

export class AuthService {
  constructor(private readonly store: Store) {}

  createDemoSession(role: Role = "player"): { token: string; user: User } {
    if (process.env.APP_ENV === "production" || process.env.DEMO_AUTH_ENABLED === "false") {
      throw new Error("Demo authentication is unavailable in production");
    }
    const userId = role === "player"
      ? "demo-player"
      : role === "super_admin"
        ? "demo-approver"
        : role === "support"
          ? "demo-support"
          : "demo-admin";
    const user = this.mustFindUser(userId);
    const token = this.createSession(user.id);
    this.store.save();
    return { token: token.token, user };
  }

  authenticateTelegram(initData?: string, mockUser?: TelegramUserPayload): { token: string; user: User } {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    let payload: TelegramUserPayload | undefined;

    if (initData && botToken) {
      payload = validateTelegramInitData(initData, botToken);
    } else if (process.env.DEMO_AUTH_ENABLED !== "false") {
      payload = mockUser ?? { id: 100001, first_name: "Telegram", username: "demo_tg_player" };
    } else {
      throw new Error("Telegram auth is not configured");
    }

    const telegramId = String(payload.id);
    const now = new Date().toISOString();
    let user = this.store.state.users.find((candidate) => candidate.telegramId === telegramId);
    if (!user) {
      user = {
        id: `tg-${telegramId}`,
        telegramId,
        username: payload.username ?? ([payload.first_name, payload.last_name].filter(Boolean).join(" ") || `tg_${telegramId}`),
        roles: ["player"],
        balance: 0,
        riskScore: 5,
        isBlocked: false,
        limits: {
          maxBet: 2,
          dailyDeposit: 50,
          dailyLoss: 20
        },
        createdAt: now,
        updatedAt: now
      };
      this.store.state.users.push(user);
    }

    const token = this.createSession(user.id);
    this.store.save();
    return { token: token.token, user };
  }

  createWalletNonce(walletAddress: string): string {
    const normalized = ethers.getAddress(walletAddress);
    const nonce = `Web3 Casino login ${randomBytes(16).toString("hex")}`;
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    this.store.state.walletNonces = this.store.state.walletNonces.filter((item) => item.walletAddress !== normalized);
    this.store.state.walletNonces.push({ walletAddress: normalized, nonce, expiresAt });
    this.store.save();
    return nonce;
  }

  verifyWallet(walletAddress: string, signature: string, nonce: string): { token: string; user: User } {
    const normalized = ethers.getAddress(walletAddress);
    const record = this.store.state.walletNonces.find((item) => item.walletAddress === normalized && item.nonce === nonce);
    if (!record || new Date(record.expiresAt).getTime() < Date.now()) {
      throw new Error("Wallet nonce expired");
    }

    const recovered = ethers.verifyMessage(nonce, signature);
    if (ethers.getAddress(recovered) !== normalized) {
      throw new Error("Wallet signature is invalid");
    }

    const now = new Date().toISOString();
    let user = this.store.state.users.find((candidate) => candidate.walletAddress === normalized);
    if (!user) {
      user = {
        id: `wallet-${normalized.toLowerCase()}`,
        walletAddress: normalized,
        username: `${normalized.slice(0, 6)}...${normalized.slice(-4)}`,
        roles: ["player"],
        balance: 0,
        riskScore: 5,
        isBlocked: false,
        limits: {
          maxBet: 2,
          dailyDeposit: 50,
          dailyLoss: 20
        },
        createdAt: now,
        updatedAt: now
      };
      this.store.state.users.push(user);
    }

    this.store.state.walletNonces = this.store.state.walletNonces.filter((item) => item !== record);
    const token = this.createSession(user.id);
    this.store.save();
    return { token: token.token, user };
  }

  getAuth(request: FastifyRequest): AuthContext {
    const auth = request.headers.authorization;
    if (!auth?.startsWith("Bearer ")) {
      throw new Error("Missing bearer token");
    }

    const tokenValue = auth.slice("Bearer ".length);
    const token = this.store.state.sessions.find((candidate) => candidate.token === tokenValue);
    if (!token || new Date(token.expiresAt).getTime() < Date.now()) {
      throw new Error("Session expired");
    }

    const user = this.store.state.users.find((candidate) => candidate.id === token.userId);
    if (!user) {
      throw new Error("Session user was not found");
    }

    if (applyMaturedLimitChange(user)) {
      this.store.save();
    }
    return { token, user };
  }

  assertRole(user: User, roles: Role[]): void {
    if (!roles.some((role) => user.roles.includes(role))) {
      throw new Error("Insufficient permissions");
    }
  }

  private createSession(userId: string): SessionToken {
    const token: SessionToken = {
      token: randomUUID(),
      userId,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + sessionTtlMs).toISOString()
    };
    this.store.state.sessions.push(token);
    return token;
  }

  private mustFindUser(userId: string): User {
    const user = this.store.state.users.find((candidate) => candidate.id === userId);
    if (!user) {
      throw new Error(`User ${userId} was not found`);
    }
    return user;
  }
}
