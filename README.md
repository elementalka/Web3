# Lumina — Web3 Casino Sandbox

Showcase-ready monorepo по ТЗ `ТЗ/unified_tz_web3_casino.md`: адаптивное React/Vite приложение, Telegram Mini App и Fastify API для provably fair Web3 casino sandbox.

> Текущая версия — showcase/staging с тестовыми средствами. Она не предназначена для real-money запуска. Инструкция one-click Vercel и явный production gate: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Что реализовано

- Авторский dark/neon интерфейс Lumina: onboarding 18+, RU/EN, desktop/mobile navigation и явный sandbox watermark.
- Полноценные Lobby, 5 игровых сцен, Wallet/Transactions, Responsible Play, Support, Provably Fair verifier и Admin Operations.
- Browser Wallet Connect с EVM nonce/signature и Telegram Mini App auth.
- Backend на Fastify/TypeScript с file-backed JSON store в `apps/api/.data/dev-db.json`.
- 5 игр: Dice, Mines, Plinko, ORBIT, SIGNAL.
- Backend-only исходы через HMAC-SHA256 (`serverSeed`, `clientSeed`, `nonce`, `gameId`, versioned salt) и exact post-reveal outcome verification.
- Double-entry ledger, testnet/mock deposits, withdrawals до 25 USDC auto-confirm, выше review.
- Bankroll/Risk Engine: `casinoEquity`, `availableRiskBank`, risk tiers, dynamic max bet, game availability.
- Responsible gambling: rolling limits, 24h cooling-off на повышение, self-exclusion, safety pulse и обязательный reality check.
- Admin: dashboard, emergency pause, withdrawal review, simulations, append-only audit и independent ledger-adjustment approval.
- Sandbox/Test Mode: sandbox bankroll tools and 1000-round simulation, routes are not registered in `APP_ENV=production`.
- Content/support/notifications/analytics foundations.
- 25 backend-тестов: security boundaries, ledger, exact fairness, payout math, responsible limits, idempotency, rate limiting и serverless isolation.

## Быстрый запуск

```bash
npm install
npm run dev
```

Открой:

- Web app: `http://localhost:5173`
- API health: `http://localhost:4000/api/health`

В dev-режиме frontend автоматически создаёт demo Telegram session. Для sandbox-админки открой `Управление → Войти как sandbox admin`.

## Проверки

```bash
npm run typecheck
npm test
npm run build
npm audit --audit-level=high
```

## Vercel showcase

Импортируй репозиторий в Vercel с Root Directory `.`. Корневой `vercel.json` соберёт Vite frontend и направит `/api/*` через явный rewrite в единственную Fastify Node Function `api/index.ts`; для same-origin deployment `VITE_API_URL` оставь пустым.

В Vercel Environment Variables обязательно задай `SHOWCASE_SESSION_SECRET` случайной строкой минимум 32 байта. Она подписывает часовые showcase-сессии, чтобы auth работал между параллельными Function instances; значение нельзя коммитить в Git.

Для общей истории, баланса и многошаговой Mines между Function instances подключи к проекту бесплатную Upstash Redis integration из Vercel Marketplace. Адаптер поддерживает как актуальные `KV_REST_API_URL` / `KV_REST_API_TOKEN`, так и прежние `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`; без полной пары состояние остаётся disposable и instance-local.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Felementalka%2FWeb3&project-name=web3-casino-showcase&repository-name=Web3)

```bash
npm run build:vercel
```

Полные настройки, Telegram env, split deployment и ограничения `/tmp` persistence описаны в [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). Профиль `DEPLOYMENT_PROFILE=production` намеренно fail-closed до внедрения Postgres/EVM и production security controls.

## Telegram Mini App

Frontend подключает официальный script:

```html
<script src="https://telegram.org/js/telegram-web-app.js"></script>
```

Backend валидирует `Telegram.WebApp.initData` по HMAC-схеме Telegram, если задан `TELEGRAM_BOT_TOKEN`.
Без токена включается demo auth, пока `DEMO_AUTH_ENABLED=true`.

### Bot launch button

Чтобы из Telegram-бота открывалось приложение, нужен публичный HTTPS URL Mini App. Для локальной разработки это может быть tunnel к `http://localhost:5173`; для production - домен деплоя.

Добавь в `apps/api/.env`:

```env
TELEGRAM_WEBAPP_URL=https://your-mini-app.example.com
TELEGRAM_WEBHOOK_URL=https://your-api.example.com
TELEGRAM_WEBHOOK_SECRET=long-random-secret
```

Проверить токен:

```bash
npm run telegram:check
```

Настроить menu button, команды и webhook:

```bash
npm run telegram:setup
```

`TELEGRAM_WEBHOOK_URL` опционален. Если он задан, webhook будет указывать на `/api/telegram/webhook`, а `/start` и `/app` будут присылать inline-кнопку Web App.

Документация Telegram: https://core.telegram.org/bots/webapps

## Environment

Для локального API скопируй `apps/api/.env.example` в `apps/api/.env`; для split frontend — `apps/web/.env.example` в `apps/web/.env`. Общий шаблон Vercel находится в корневом `.env.example`.

```env
APP_ENV=development
PORT=4000
WEB_ORIGIN=http://localhost:5173
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBAPP_URL=
TELEGRAM_WEBHOOK_URL=
TELEGRAM_WEBHOOK_SECRET=
DEMO_AUTH_ENABLED=true
STORE_MODE=file
SANDBOX_TOOLS_ENABLED=true
MOCK_PAYMENTS_ENABLED=true
ADMIN_2FA_SECRET=
```

Для real-money production недостаточно задать env: текущий Vercel adapter вернёт 503 при `APP_ENV=production` или `DEPLOYMENT_PROFILE=production`. Сначала необходимо заменить file-backed Store на Postgres, подключить и проаудировать EVM indexer/treasury/withdrawals, убрать demo auth/mock payments/hardcoded 2FA и внедрить KYC/AML/geo controls. Полный checklist — в [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Важные ограничения MVP

Real-money Web3 payments не включены намеренно: ТЗ оставляет открытыми сеть, confirmations, юрисдикцию, AML-политику и аудит. Сейчас есть testnet/mock financial flow и доменные точки расширения для EVM-интеграции.

Game results уже считаются на backend и не зависят от bankroll, истории игрока или админских настроек. Risk Engine меняет только лимиты и доступность режимов.
