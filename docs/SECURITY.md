# Security posture

## Scope and disclaimer

This repository is a **sandbox showcase**. It is not approved to custody assets, accept real deposits, execute real payouts or offer real-money gambling. Test funds must have no monetary value and every public environment must communicate that boundary clearly.

Security controls described as “required” below are release gates, not claims that an external audit has already verified them.

## Trust boundaries

### Browser and Telegram client

The browser, Telegram WebView, local storage, request payloads, animation state, timers, client seeds and displayed balances are untrusted. The client may request an action but must never determine an outcome, authorize an admin operation or serve as the source of financial truth.

- Never ship server seeds, treasury keys, bot tokens or admin secrets to the client.
- Treat all client values as attacker-controlled, including `idempotencyKey`, bet parameters and wallet addresses.
- A client-visible header or constant is not a second factor.
- `Math.random()` is acceptable only for visual effects, never for a game outcome.

### Public API

The API is the authoritative boundary for authentication, authorization, game outcomes, limits and state transitions. Every mutating endpoint requires schema validation, authentication where appropriate, rate limits and an idempotency policy.

- Return stable error codes and a request ID; do not expose stack traces or internal secrets.
- Restrict CORS to explicit showcase origins.
- Apply security headers, request-size limits and abuse throttling.
- Do not log bearer tokens, Telegram `initData`, wallet signatures, private seeds, webhook secrets or full personal data.

### Provably-fair engine

The server seed is secret until every session that references it has completed or been safely cancelled.

- Commit the server-seed hash before accepting the bet.
- Store the exact algorithm/version and all public inputs required to reproduce the visible outcome.
- Verification must replay the same salted random stream used by the game, not merely recalculate an unrelated HMAC.
- Block seed reveal while an active Mines or other multi-action session still uses it.
- Rotate after the configured bet/time threshold and security events; keep revealed seeds immutable.
- Encrypt unrevealed seeds at rest in a production-capable design.

### Ledger and risk engine

The ledger is an append-only financial record. A cached user balance is not a substitute for balanced ledger entries.

- Use fixed-precision decimal/integer minor units, never floating-point arithmetic, for production money.
- Commit debit/credit legs and the materialized balance atomically in a database transaction.
- Lock or serialize concurrent actions for the same balance/game session.
- Reject duplicate bets, deposits and withdrawals through scoped idempotency keys.
- Reconcile continuously and alert on any imbalance or negative balance.
- Risk controls may change limits and availability, never the random outcome.

### Admin boundary

Admin and customer authentication are separate trust domains.

- Production must not register demo-admin or role-selection authentication routes.
- Require a real TOTP/WebAuthn factor and an IP/network allowlist for sensitive operations.
- Enforce least privilege server-side; hiding a button is not authorization.
- The requester of a ledger adjustment cannot approve it.
- Treasury and contract operations require external multisig approval.
- Audit login, old/new values, actor, source IP, user agent, request ID and timestamp in immutable storage.

### Sandbox boundary

Sandbox tools are dangerous administrative capabilities even when balances are fake.

- At `APP_ENV=production`, sandbox routes must not be registered and must return 404.
- In non-production, also require `SANDBOX_TOOLS_ENABLED=true`, an allowed role, second factor and IP boundary.
- Store sandbox balances, simulations and audit data separately from production state.
- Display `SANDBOX MODE / TEST FUNDS ONLY / NO REAL PAYOUTS` on every relevant screen.
- Fixed/replay seeds are sandbox-only and must be rejected by production code paths.

### External systems

Telegram, wallet providers, RPC nodes, email providers, analytics systems and future KYC/AML services are outside the application trust boundary.

- Validate Telegram `initData` signatures and age.
- Bind wallet sign-in messages to the expected domain, chain/context, nonce and expiration.
- Verify webhook signatures and use replay protection.
- Use timeouts, bounded retries and queues for external calls.
- Never credit a real deposit from a client callback; only a confirmed, deduplicated indexer event may credit it.

## Secret management

Secrets belong in the hosting provider’s encrypted environment settings or an external secrets manager. They must not be committed, copied into frontend variables, embedded in screenshots or pasted into public issues.

Examples of sensitive values:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- session/JWT signing or encryption keys
- database credentials
- RPC provider keys with privileged quotas
- admin/bootstrap credentials
- unrevealed server seeds and their encryption key
- treasury, relayer or payout private keys

Operational rules:

1. Keep `.env` local and ignored; commit only a placeholder `.env.example`.
2. Use different values for local, staging and public environments.
3. Disable demo authentication in every internet-accessible deployment unless the entire deployment is an explicitly isolated demo with no privileged capabilities.
4. Rotate a secret immediately if it appears in git history, logs, chat, CI output or a client bundle. Removing the current line is not sufficient.
5. Grant CI only read access unless a deployment job explicitly needs more.
6. Review Vercel/host environment-variable scopes so preview deployments never receive production-only secrets.

## Required public-showcase controls

- Test funds only, with persistent visible watermarking.
- No production demo-admin endpoint or fixed 2FA value.
- No real treasury keys, contracts or mainnet RPC credentials.
- Correct payout/RTP validation for every enabled mode.
- Safe provably-fair reveal and exact outcome verification.
- Self-exclusion and limit enforcement verified through negative tests.
- Production sandbox routes verified as 404.
- Dependency audit and CI passing on a clean checkout.
- CORS allowlist and HTTPS-only public origins.
- Logs reviewed for tokens, seeds and personal-data leakage.

## Incident response notes

### Security events

Treat the following as incidents:

- unauthorized admin/session issuance;
- server seed disclosure before all related sessions close;
- ledger imbalance, negative balance or duplicate settlement;
- payout table/RTP greater than or equal to 100%;
- exposed bot, signing, database or treasury secret;
- sandbox mutation reaching production state;
- unexpected withdrawal, webhook or blockchain event;
- evidence of account/session replay or privilege escalation.

### Immediate containment

1. Pause new bets and affected admin operations.
2. Keep legitimate withdrawal access available unless legal/security review identifies a documented reason to pause a specific payout path.
3. Disable the affected endpoint or feature flag; revoke sessions and rotate exposed credentials.
4. Preserve logs, ledger records, deployment identifiers and relevant database snapshots. Do not rewrite evidence.
5. Record UTC timestamps, affected users/sessions, request IDs, seed IDs, transaction IDs and the exact deployed commit.
6. If a seed is implicated, do not reveal or rotate it until active sessions are safely resolved; then preserve both commit and reveal evidence.

### Investigation and recovery

- Reproduce the issue in an isolated sandbox using sanitized data.
- Determine whether integrity, confidentiality, availability or player funds were affected.
- Reconcile all related ledger transactions and game proofs.
- Patch the root cause and add a regression/negative test.
- Deploy through the normal CI gate and run the smoke checklist.
- Restore service gradually; monitor errors, RTP, balances and admin events.
- Document owner, timeline, impact, corrective action and follow-up deadline.

Do not report a suspected vulnerability in a public issue with exploit details or secrets. Contact the repository owner through a private channel and include only the minimum evidence needed to reproduce it safely.

## Real-money security gate

Before real assets are introduced, this project additionally requires a jurisdiction decision, architecture review, OWASP ASVS review, application pentest, audited smart contracts or an equivalently reviewed custody design, managed database backups/PITR, centralized monitoring, formal key management, multisig operations and an exercised incident-response runbook.
