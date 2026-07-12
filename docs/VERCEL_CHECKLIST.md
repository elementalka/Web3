# Vercel showcase checklist

## Deployment decision

The current repository must be deployed as a **sandbox showcase**, not a real-money casino.

The repository includes a combined Vite + Fastify Vercel adapter. Auth uses a short-lived signed token. A fully playable multi-instance showcase uses Upstash Redis; without it, balances, history and seeds fall back to instance-local `/tmp` and can reset.

### Current showcase topology

- Web: static Vite output on Vercel CDN.
- API: one Node Function at `api/index.ts`, reached through an explicit `/api/*` rewrite.
- Data: Upstash Redis JSON state when configured, otherwise disposable `/tmp` test state.
- Browser/API communication: same HTTPS origin by default.

### Durable topology

Before any persistence promise—or any real asset—the Store must move to managed PostgreSQL with transactions, fixed-precision money, migrations, backups and PITR. The current production profile intentionally fails closed with HTTP 503.

## Repository preflight

- [ ] The repository has a clean git history and is connected to the intended GitHub repository.
- [ ] `.env`, `.data`, build output and TypeScript build info are not committed.
- [ ] The latest default-branch CI run is green.
- [ ] `npm ci`, typecheck, tests, build and dependency audit pass locally from a clean checkout.
- [ ] The deployed commit hash is recorded for rollback and incident response.
- [ ] No real wallet, mainnet, treasury or payout secret is present in any showcase environment.

## Vercel web project

Use the checked-in root `vercel.json`:

| Setting | Value |
|---|---|
| Framework preset | Vite |
| Root directory | `.` |
| Install command | `npm ci --include=dev` |
| Build command | `npm run build:vercel` |
| Output directory | `apps/web/dist` |
| Node.js | 22–24 |

Do not create a second Vercel project rooted at `apps/web` and do not generate a second lockfile inside that workspace.

## Environment variables

### Frontend

- [ ] The frontend uses a configured HTTPS API origin or a reviewed same-origin rewrite.
- [ ] Only public values use the `VITE_` prefix; anything prefixed with `VITE_` is visible to every visitor.
- [ ] Preview and production API origins are different where appropriate.
- [ ] Telegram Web App URL points to the final HTTPS domain if Telegram launch is enabled.

### API host

- [ ] Showcase uses `DEPLOYMENT_PROFILE=showcase`; the adapter forces `APP_ENV=staging`.
- [ ] `SHOWCASE_SESSION_SECRET` is unique, at least 32 bytes, present in every deployed environment and stored only in encrypted Vercel settings.
- [ ] Upstash Redis is linked for a playable public demo; its REST token is server-side only and the database region is close to the Function region.
- [ ] A split deployment sets `WEB_ORIGIN` to the exact web origin, never `*`.
- [ ] `DEMO_AUTH_ENABLED=true` only for the disposable showcase; real production physically omits the route.
- [ ] `SANDBOX_TOOLS_ENABLED=false` in production; internal staging tools require the complete sandbox guard.
- [ ] Telegram bot/webhook secrets are configured only on the API host.
- [ ] Session/signing and database secrets are strong, unique and stored in encrypted environment settings.
- [ ] Mainnet/treasury credentials are absent from the sandbox showcase.

Do not put bot tokens, webhook secrets, server seeds, database credentials or admin secrets in frontend/Vercel public variables.

## Public-showcase boundary

- [ ] Every landing, lobby, game, wallet, withdrawal and admin surface displays `SANDBOX / TEST FUNDS / NO REAL PAYOUTS`.
- [ ] The UI does not claim that a mock deposit or withdrawal is an on-chain transaction.
- [ ] The optional sandbox-admin tour can affect only disposable test state and has no production data, secrets or external side effects.
- [ ] Deployment Protection is enabled when the admin tour should be limited to invited viewers.
- [ ] Production sandbox URLs return 404, not 401/403.
- [ ] Test reset/simulation functions cannot mutate production-like state.

## Domain and integrations

- [ ] The Vercel domain and optional custom domain use HTTPS.
- [ ] CORS permits only the intended domain(s).
- [ ] Telegram menu button/Web App URL is updated after the final domain is known.
- [ ] Telegram webhook URL points to the API host, not the static frontend.
- [ ] Wallet sign-in text is bound to the displayed domain and uses a short-lived one-time nonce.
- [ ] CSP/connect-src permits only the required API, Telegram and wallet-provider origins.

## Release smoke tests

Run these against the deployed showcase, not only localhost:

- [ ] Health endpoint responds and does not expose secrets or unsafe diagnostic detail.
- [ ] One demo auth token succeeds on 20 parallel `/api/session` requests without intermittent 401 responses.
- [ ] Mines start and reveal succeed when intentionally sent through separate Function instances/shared Store clients.
- [ ] A normal player cannot call admin routes; the optional demo-admin is clearly sandbox-only.
- [ ] With `APP_ENV=production`, demo auth is 404 and the showcase code `000000` cannot satisfy admin authentication.
- [ ] Sandbox routes return 404 in the production boundary.
- [ ] Dice, Mines, Plinko, ORBIT and SIGNAL complete one valid test-funds flow each.
- [ ] A duplicate idempotency key cannot charge twice.
- [ ] A revealed proof reproduces the exact displayed result.
- [ ] A server seed cannot be revealed during an active Mines session.
- [ ] Every enabled payout mode passes automated RTP validation below 100%.
- [ ] Self-exclusion blocks a bet and a deposit while withdrawal remains available.
- [ ] Increased limits remain inactive for the full cooling-off period.
- [ ] Mobile layout works at 320 px width and no primary action is hidden under navigation.
- [ ] Error, loading and empty states render without exposing stack traces.
- [ ] Browser console and network responses contain no secrets.

## Observability and rollback

- [ ] Frontend errors and API failures are observable without logging sensitive payloads.
- [ ] The team can identify the deployed git commit from the environment.
- [ ] A previous known-good Vercel deployment is available for instant promotion/rollback.
- [ ] API rollback and database migration rollback/forward-fix procedures are documented.
- [ ] A named owner monitors the first public showcase session.
- [ ] Emergency pause and incident notes in `docs/SECURITY.md` have been reviewed.

## Real-money prohibition

A successful Vercel deployment does not authorize real deposits or wagers. Real-money launch remains blocked until the legal/compliance gate, production payment/indexer architecture, transactional database, admin security, responsible-gambling controls, monitoring, pentest and smart-contract/custody audit are complete.
