# Project status

**Status date:** 2026-07-13

**Release posture:** showcase-ready sandbox with test funds

**Not approved for:** deposits, withdrawals or wagering with real assets

Lumina is now a deployable product showcase: the five games, account area, responsible-play controls, exact provably-fair verifier, sandbox admin console and RU/EN responsive interface are connected to a working Fastify API. It must still be presented as a sandbox. A green build, Vercel URL, or passing tests do not constitute legal, security, smart-contract, or gambling-compliance approval.

## Showcase versus real-money readiness

| Capability | Sandbox showcase | Real-money production | Notes / next gate |
|---|---|---|---|
| Five games | Ready | Blocked | Dice, Mines, Plinko, ORBIT and single-player SIGNAL are playable. Production still needs long statistical release runs and external review. |
| Provably fair | Ready | Partial | Seed commitment, safe rotation and exact recorded-outcome replay are implemented and tested. Production needs encrypted seed custody and independent audit tooling. |
| Payout mathematics | Ready | Partial | Automated tests prove Plinko ≈96%, ORBIT 96%/97%, and all enabled tables stay below 100% RTP. Production changes need an approval workflow. |
| Bankroll/risk engine | Ready | Partial | Equity, reserves, tiers, daily loss and dynamic limits work. Production requires transactional persistence, concurrency controls and alerts. |
| Double-entry ledger | Ready | Partial | Entries reconcile in the showcase. Production requires fixed-precision database types, constraints, locking and scheduled reconciliation. |
| Wallet/Telegram access | Ready | Partial | Browser EVM signing, Telegram initData and demo entry are wired. Production requires short-lived access/refresh sessions, revocation and rate-limit storage. |
| Admin access | Ready | Blocked | The sandbox console uses test-only roles; production demo auth is physically absent and fixed `000000` is rejected. Real TOTP/WebAuthn and IP allowlisting remain required. |
| Sandbox | Ready | Blocked | Every surface is watermarked, tools require explicit non-production flags, and production routes return 404. The showcase state is intentionally disposable. |
| Responsible gambling | Ready | Partial | Daily limits, delayed increases, self-exclusion, neutral safety pulse and a 30-minute reality check are implemented. Legal review and durable history remain. |
| Support/content/notifications | Ready | Partial | User-facing workflows and data foundations are present. Production needs delivery providers, full back-office workflow and immutable CMS versions. |
| RU/EN and accessibility | Ready | Partial | Core UI is bilingual, responsive, keyboard-oriented and reduced-motion aware. Formal WCAG 2.1 AA audit remains. |
| CI and dependencies | Ready | Partial | Clean install, typecheck, 39 tests, build and dependency audit run in GitHub Actions. Production adds SAST, secret scanning and approval gates. |
| Vercel deployment | Ready | Blocked | One project serves Vite and `api/index.ts`; signed showcase sessions work across Functions, while optional Upstash Redis shares demo game state under a distributed lease. The adapter remains showcase-only. |
| EVM payments/contracts | Blocked | Blocked | No real deposit indexer, treasury contract, withdrawal signer or external smart-contract audit is included. |
| Compliance/anti-fraud | Blocked | Blocked | Jurisdiction, age/KYC/AML/sanctions/geo providers and operating procedures are not selected. |

## Completed showcase release gates

- [x] Production does not register demo-auth or mock-deposit routes.
- [x] Production admin access rejects the client-visible showcase code and requires a configured secret; the Vercel real-money profile remains fail-closed.
- [x] A ledger-adjustment requester cannot approve their own request.
- [x] A seed referenced by an active Mines session cannot be revealed.
- [x] Post-reveal verification replays the exact salted random stream and stored result for all five games.
- [x] Exact RTP tests reject loss-making payout tables; Plinko high no longer exceeds 100%.
- [x] Mines losses are recorded in common history and analytics.
- [x] Self-exclusion blocks play and deposits while withdrawals remain available.
- [x] Responsible-limit decreases are immediate; increases wait 24 hours.
- [x] The $25 auto-withdrawal threshold is cumulative over 24 hours.
- [x] Sandbox tools require explicit environment flags and disappear in production.
- [x] Global and authentication/simulation-specific API rate limits are enabled.
- [x] Every app surface clearly identifies sandbox/test funds/no real payouts.
- [x] CI-quality commands pass from the repository root.

## Requirement traceability

| Requirement group | Specification IDs | Showcase status | Real-money gap |
|---|---|---|---|
| Wallet authentication | REQ-001 | Ready | Refresh-token rotation, revocation, domain policy and durable sessions. |
| Admin authentication | REQ-002 | Ready (sandbox) | TOTP/WebAuthn, IP allowlist and separate admin identity provider. |
| Five games | REQ-003, REQ-005 | Ready | Independent mathematical/security review and load/statistical testing. |
| Provably fair | REQ-004 | Ready | External verifier package, encrypted seeds and audit. |
| ORBIT / payout rules | REQ-006, REQ-007, REQ-029 | Ready | Controlled configuration publishing and monitoring. |
| Risk and ledger | REQ-008–011 | Ready | PostgreSQL transactions, fixed precision, locking and reconciliation job. |
| Dual-control adjustments | REQ-012 | Ready | Durable immutable report and production identity/signature controls. |
| Sandbox/simulation | REQ-013–015 | Ready | Separate database/schema and richer drawdown/export scenarios. |
| Withdrawals | REQ-016, REQ-017 | Ready (mock) | EVM settlement, AML/liquidity review and full state machine. |
| Responsible gambling | REQ-018, REQ-019, REQ-025 | Ready | Jurisdiction-specific policy, durable history and notification delivery. |
| Compliance/anti-fraud | REQ-020, REQ-023 | Blocked | Providers, heuristics, case review and legal policy. |
| Smart contracts/audit | REQ-021, REQ-022 | Blocked | Contracts, multisig, testnet validation and external audit. |
| CMS/support/notifications | REQ-026, REQ-027, REQ-031 | Partial | Full role workflows, email, immutable versions and SLA tooling. |
| Analytics | REQ-028 | Partial | Durable event pipeline, BI dashboards, retention and alerting. |
| Performance/scale | REQ-032, REQ-033 | Blocked | Managed data services, load tests, queues/realtime and horizontal design. |
| Security | REQ-034 | Partial | ASVS review, SAST/secret scan, pentest, key management and monitoring. |
| Accessibility/localization | REQ-035, REQ-036 | Ready (core) | Formal WCAG audit and legally reviewed localized content. |
| Statistical QA | REQ-037 | Partial | Exact payout math is tested; 1M-sample distribution reports remain. |
| CI/CD | REQ-038 | Ready (CI) | Protected production deployment with manual approval remains. |
| Risk/content roles | REQ-039, REQ-040 | Partial | Complete production back-office workflows and identity segregation. |

## Real-money production blockers

The following cannot be waived by visual polish or a successful Vercel deployment:

- target jurisdiction, licensing and legally reviewed content;
- age, KYC, AML, sanctions and geo-blocking policy/provider integration;
- one selected EVM network, confirmations policy and canonical USDC contract;
- production indexer/payment service plus audited treasury/withdrawal contracts or equivalent reviewed custody architecture;
- managed PostgreSQL with fixed precision, transactions, migrations, backups and PITR;
- Redis/queues/realtime architecture, load tests and disaster recovery;
- real admin identity, TOTP/WebAuthn, IP controls and multisig operations;
- application pentest and smart-contract/custody audit;
- centralized logs, metrics, alerts, error tracking and incident ownership.

## Verification commands

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run build:vercel
npm audit --audit-level=high
```

Passing these commands is necessary for the sandbox showcase, but is not sufficient for real-money production approval.
