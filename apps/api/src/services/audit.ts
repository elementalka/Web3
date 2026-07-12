import { randomUUID } from "node:crypto";
import type { AppState } from "../types.js";

export function addAudit(state: AppState, actorUserId: string, action: string, target?: string, metadata?: Record<string, unknown>): void {
  state.auditLogs.unshift({
    id: randomUUID(),
    actorUserId,
    action,
    target,
    metadata,
    createdAt: new Date().toISOString()
  });
}

export function addAnalytics(state: AppState, name: string, metadata?: Record<string, unknown>, userId?: string, gameId?: string): void {
  state.analyticsEvents.unshift({
    id: randomUUID(),
    name,
    userId,
    gameId: gameId as never,
    metadata,
    createdAt: new Date().toISOString()
  });
}
