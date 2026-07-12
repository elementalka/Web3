# Vercel deployment: showcase / staging

Эта конфигурация предназначена для демонстрации продукта с тестовыми средствами. Она объединяет Vite frontend и Fastify API в одном Vercel project и на одном HTTPS-origin.

> **TEST FUNDS ONLY. NO REAL PAYOUTS.** Vercel Production Deployment — это название окружения платформы Vercel, а не признак готовности казино к real-money production.

## Что разворачивается

| URL | Реализация |
|---|---|
| `/`, assets, SPA routes | статический build `apps/web/dist` |
| `/api/*` | rewrite в одну Node.js Vercel Function `api/index.ts`, передающую исходный URL Fastify |
| auth demo | HMAC-подписанная часовая сессия, проверяемая любым Function instance |
| состояние игр | Upstash Redis при наличии integration; иначе disposable `/tmp` конкретного Function instance |

`vercel.json` собирает только frontend; Vercel отдельно компилирует TypeScript Function и её импорты из `apps/api/src`. Runtime-граф использует явные `.js` specifiers и проверяется в режиме `NodeNext`, поэтому скомпилированный ESM запускается в Node без bundler-specific resolution. Node ограничен диапазоном `>=22 <25`; новые проекты Vercel в 2026 используют Node 24 LTS по умолчанию.

## Быстрый деплой из GitHub

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Felementalka%2FWeb3&project-name=web3-casino-showcase&repository-name=Web3)

1. Импортируй репозиторий в Vercel через **Add New → Project**.
2. Оставь **Root Directory** равным корню репозитория (`.`), не `apps/web`.
3. Настройки из `vercel.json` должны определиться автоматически:

   - Install Command: `npm ci --include=dev`
   - Build Command: `npm run build:vercel`
   - Output Directory: `apps/web/dist`
   - Framework: Vite

4. В **Project Settings → Environment Variables** добавь обязательный `SHOWCASE_SESSION_SECRET` для Production и Preview. Сгенерировать его можно локально:

   ```bash
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
   ```

   Адаптер по умолчанию выбирает `DEPLOYMENT_PROFILE=showcase`, принудительно держит backend в `APP_ENV=staging` и выдаёт предзаполненные test funds demo-игроку. Без сильного session secret auth намеренно возвращает HTTP 503.
5. Для полноценного игрового показа подключи **Marketplace → Upstash → Redis** к этому Vercel project. Актуальная integration добавляет `KV_REST_API_URL` и `KV_REST_API_TOKEN`; адаптер также понимает прежние `UPSTASH_REDIS_REST_URL` и `UPSTASH_REDIS_REST_TOKEN`. Без Redis landing и auth работают, но баланс, история и многошаговая Mines могут расходиться между Function instances.
6. После деплоя проверь:

   - `https://<deployment>/api/health` → HTTP 200, `appEnv: "staging"`;
   - ответ содержит header `X-Deployment-Profile: showcase-test-funds`;
   - lobby загружается без вечного `Loading`, баланс demo-игрока не равен нулю;
   - ставка меняет баланс в пределах одной активной demo-сессии.

Для публичной ссылки рекомендуется включить Vercel Deployment Protection или хотя бы явно обозначить, что это тестовый стенд: demo admin и mock payments намеренно доступны в showcase-профиле.

## Переменные showcase

Шаблон находится в корневом `.env.example`. Для browser showcase обязателен только отдельный session-signing secret; остальные значения можно оставить по умолчанию:

| Переменная | Значение / назначение |
|---|---|
| `DEPLOYMENT_PROFILE` | `showcase` или `staging`; по умолчанию `showcase` |
| `DEMO_AUTH_ENABLED` | `true` для открытия вне Telegram; `false` только при настроенной Telegram auth |
| `SHOWCASE_SESSION_SECRET` | обязательная случайная строка минимум 32 байта; не использовать повторно для других сервисов |
| `SHOWCASE_DATA_FILE` | fallback без Redis; Vercel: `/tmp/web3-casino-showcase.json` |
| `UPSTASH_REDIS_REST_URL` | автоматически выдаётся Upstash integration; включает общий showcase Store |
| `UPSTASH_REDIS_REST_TOKEN` | секретный REST token Upstash; только server-side environment |
| `KV_REST_API_URL` | актуальное имя REST URL из Vercel Marketplace; альтернатива `UPSTASH_REDIS_REST_URL` |
| `KV_REST_API_TOKEN` | актуальное имя REST token из Vercel Marketplace; альтернатива `UPSTASH_REDIS_REST_TOKEN` |
| `SHOWCASE_REDIS_KEY` | необязательный override namespace; по умолчанию ключ изолирован по `VERCEL_PROJECT_ID` и Vercel environment |
| `VITE_API_URL` | пусто для combined deployment |
| `WEB_ORIGIN` | не нужен при same-origin; обязателен для split deployment |

Не добавляй секреты в `.env.example` или Git. В Vercel они задаются отдельно для Preview/Production в Project Settings → Environment Variables.
Ротация `SHOWCASE_SESSION_SECRET` немедленно инвалидирует выданные showcase-токены; frontend автоматически запросит новую demo-сессию.

## Telegram Mini App

Для показа внутри Telegram задай в Vercel:

```env
DEPLOYMENT_PROFILE=showcase
DEMO_AUTH_ENABLED=false
TELEGRAM_BOT_TOKEN=<secret>
TELEGRAM_WEBAPP_URL=https://<stable-showcase-domain>
TELEGRAM_WEBHOOK_URL=https://<stable-showcase-domain>/api/telegram/webhook
TELEGRAM_WEBHOOK_SECRET=<long-random-secret>
```

После redeploy выполни локально `npm run telegram:check` и `npm run telegram:setup` с теми же переменными. Preview URL меняется между деплоями, поэтому для Telegram menu button удобнее закрепить staging-домен.

## Combined и split deployment

Рекомендуемый вариант — combined project: frontend вызывает относительный `/api`, CORS и отдельный API URL не нужны. Оставь `VITE_API_URL` пустым.

Если frontend развёрнут отдельным Vercel project:

1. Задай frontend build variable `VITE_API_URL=https://<api-domain>` без завершающего `/`.
2. На API project задай `WEB_ORIGIN=https://<frontend-domain>`.
3. Выполни redeploy frontend: `VITE_*` встраиваются Vite во время build, изменение переменной без нового build не влияет на готовый JS.
4. Проверь preflight и обычный запрос `/api/health` из браузера.

## Ограничения persistence

При подключённом Upstash текущий showcase хранит общий JSON snapshot в Redis. Каждый запрос получает короткую distributed lease, загружает актуальный snapshot, а запись выполняется атомарно только владельцем lease. Поэтому параллельные Function instances не теряют ставки, а cold start не стирает баланс, историю или активную Mines session.

Это решение делает публичное демо последовательным, но **не превращает его в production-базу данных**:

- весь `AppState` читается и записывается одним snapshot, поэтому throughput намеренно ограничен и не рассчитан на большой публичный трафик;
- нет реляционных constraints, полноценной истории миграций, backup/PITR и финансового reconciliation уровня production;
- Preview и Production изолированы автоматически, пока `SHOWCASE_REDIS_KEY` не переопределён вручную одинаковым значением;
- без полной пары Upstash credentials адаптер использует disposable `/tmp`; частично заданная пара считается ошибкой конфигурации и возвращает 503;
- без Redis cold start или новый Function instance может сбросить либо разветвить demo-state.

Не используй этот профиль для реальных средств, персональных данных, KYC или обещаний сохранности баланса.

## Fail-closed production gate

Если выставить `DEPLOYMENT_PROFILE=production` **или** `APP_ENV=production`, Vercel adapter не запускает текущий in-memory/file-backed API и возвращает HTTP 503 `PRODUCTION_PROFILE_NOT_AVAILABLE`. Даже наличие всех секретов не снимает блокировку автоматически.

Перед реализацией real-money профиля обязательны как минимум:

1. Postgres-backed Store, миграции, транзакции, backup/PITR и reconciliation.
2. Аудированный EVM deposit indexer и withdrawal signer/contract, корректная работа с confirmations/reorg.
3. Удаление demo auth/mock payments/hardcoded admin 2FA; TOTP/WebAuthn, IP allowlist и нормальная session rotation.
4. KYC/AML/geo-blocking под выбранную юрисдикцию и юридические документы.
5. Security, smart-contract и provably-fair audit; monitoring, alerts и incident response.
6. Секреты `DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, `EVM_RPC_URL`, `EVM_CHAIN_ID`, `USDC_CONTRACT_ADDRESS`, `TREASURY_SIGNER_SECRET`, а также production `WEB_ORIGIN`.

Только после внедрения этих адаптеров следует заменять fail-closed gate, а не просто менять env-переменную.

## Локальная проверка

```bash
npm ci
npm run typecheck
npm test
npm run build
```

Проверить проект Vercel CLI можно после `vercel login`:

```bash
npx vercel@latest build
npx vercel@latest
```

Официальные материалы: [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite), [Fastify on Vercel](https://vercel.com/docs/frameworks/backend/fastify), [Vercel monorepos](https://vercel.com/docs/monorepos), [Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), [Function limits](https://vercel.com/docs/functions/limitations), [Upstash integration](https://upstash.com/docs/redis/howto/vercelintegration).

## Частые проблемы

- **Auth проходит, но параллельные `/api/session` получают `401 Session expired`:** проверь наличие одинакового `SHOWCASE_SESSION_SECRET` во всех нужных Vercel environments и сделай redeploy. UUID-сессии в `/tmp` не могут использоваться между Function instances.
- **После ставки баланс или история сбрасываются, Mines session не находится:** подключи Upstash Redis integration, сделай redeploy и проверь `/api/health`: `storeMode` должен быть `redis`. `/tmp` не является общим хранилищем Vercel Functions.
- **Одноуровневые `/api/session` возвращают `FUNCTION_INVOCATION_FAILED`, а вложенные `/api/games/config` — 404:** проверь, что задеплоен вариант с `api/index.ts`, первым API rewrite и NodeNext-compatible `.js` imports. Старый `api/[...path].ts` не является надёжным splat-маршрутом для generic Vercel Functions.
- **После `npm ci` установлено ровно `120 packages`, а `build:vercel` отсутствует в `@web3-casino/api`:** Vercel запускает сборку из `apps/api`. В Project Settings верни Root Directory к корню репозитория (`.`), затем сделай redeploy без build cache.
- **`build:vercel` падает сразу после `npm ci`, а `tsc` или `vite` не найден:** проверь, что Install Command равен `npm ci --include=dev`. Флаг нужен, если в окружении Vercel задан `NODE_ENV=production`: без него npm пропустит инструменты сборки из `devDependencies`.
- **Frontend открыт, но висит `Loading`:** проверь `/api/health`; для combined project `VITE_API_URL` должен быть пустым.
- **CORS в split deployment:** `WEB_ORIGIN` должен точно совпадать со схемой и host frontend.
- **После env-изменения ничего не поменялось:** сделай redeploy; особенно это важно для `VITE_API_URL`.
- **`/api/health` показывает `storeMode: "memory"`:** Upstash не подключён к этому environment; добавь integration для Production/Preview и сделай redeploy. Для real-money состояния всё равно нужен Postgres.
- **API отвечает 503 production gate:** стенд запущен с `APP_ENV=production` или `DEPLOYMENT_PROFILE=production`; не обходи gate без реализации production checklist.
