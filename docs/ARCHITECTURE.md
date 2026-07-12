# Architecture

## Modules

- `apps/api/src/services/provablyFair.ts` - HMAC-SHA256 server seed, client seed, nonce, rotation and verification.
- `apps/api/src/services/games.ts` - Dice, Mines, Plinko, ORBIT, SIGNAL engines and idempotency.
- `apps/api/src/services/ledger.ts` - double-entry entries and balance mutation.
- `apps/api/src/services/risk.ts` - bankroll formulas, tiers, dynamic limits.
- `apps/api/src/routes/*` - auth, user, games, admin and sandbox HTTP API.
- `apps/web/src/App.tsx` - Telegram Mini App UI.

## Production Boundary

`APP_ENV=production` does not register `/api/sandbox/*` routes. This is intentional and covered by tests.

Admin routes require the `x-admin-2fa` header in this MVP. In production this should be replaced with a real TOTP/WebAuthn provider plus IP allowlist.

## Data Store

The MVP uses JSON persistence for zero-setup local launch. Local development writes a file; the Vercel showcase can keep the same JSON snapshot in Upstash Redis. Cross-instance requests are serialized with a renewable Redis lease and owner-checked Lua writes, which is sufficient for a small test-funds demo but deliberately not the final high-throughput financial architecture. Without Redis, Vercel falls back to disposable instance-local state.

The state shape in `apps/api/src/types.ts` is intentionally close to tables, so migration to Postgres can map:

- `users`
- `sessions`
- `ledger_entries`
- `game_bets`
- `mines_sessions`
- `withdrawals`
- `deposits`
- `ledger_adjustments`
- `audit_logs`
- `content_pages`
- `support_tickets`
- `notifications`
- `analytics_events`
- `server_seeds`

## Web3 Integration Points

- `POST /api/auth/wallet/nonce`
- `POST /api/auth/wallet/verify`
- `POST /api/deposits/mock`
- `POST /api/withdrawals`

The mock deposit/withdrawal flow should be replaced by an EVM Payment Service and Blockchain Indexer once the target network and treasury policy are selected.
