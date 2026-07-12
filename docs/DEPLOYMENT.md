# Vercel deployment: showcase / staging

Эта конфигурация предназначена для демонстрации продукта с тестовыми средствами. Она объединяет Vite frontend и Fastify API в одном Vercel project и на одном HTTPS-origin.

> **TEST FUNDS ONLY. NO REAL PAYOUTS.** Vercel Production Deployment — это название окружения платформы Vercel, а не признак готовности казино к real-money production.

## Что разворачивается

| URL | Реализация |
|---|---|
| `/`, assets, SPA routes | статический build `apps/web/dist` |
| `/api/*` | одна Node.js Vercel Function `api/[...path].ts`, передающая запросы Fastify |
| состояние demo | singleton Fastify + файл в `/tmp` внутри конкретного тёплого Function instance |

`vercel.json` собирает только frontend; Vercel отдельно компилирует TypeScript Function и её импорты из `apps/api/src`. Node ограничен диапазоном `>=22 <25`; новые проекты Vercel в 2026 используют Node 24 LTS по умолчанию.

## Быстрый деплой из GitHub

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Felementalka%2FWeb3&project-name=web3-casino-showcase&repository-name=Web3)

1. Импортируй репозиторий в Vercel через **Add New → Project**.
2. Оставь **Root Directory** равным корню репозитория (`.`), не `apps/web`.
3. Настройки из `vercel.json` должны определиться автоматически:

   - Install Command: `npm ci`
   - Build Command: `npm run build:vercel`
   - Output Directory: `apps/web/dist`
   - Framework: Vite

4. Для обычной browser-демонстрации секреты не нужны. Адаптер по умолчанию выбирает `DEPLOYMENT_PROFILE=showcase`, принудительно держит backend в `APP_ENV=staging` и выдаёт предзаполненные test funds demo-игроку.
5. После деплоя проверь:

   - `https://<deployment>/api/health` → HTTP 200, `appEnv: "staging"`;
   - ответ содержит header `X-Deployment-Profile: showcase-test-funds`;
   - lobby загружается без вечного `Loading`, баланс demo-игрока не равен нулю;
   - ставка меняет баланс в пределах одной активной demo-сессии.

Для публичной ссылки рекомендуется включить Vercel Deployment Protection или хотя бы явно обозначить, что это тестовый стенд: demo admin и mock payments намеренно доступны в showcase-профиле.

## Переменные showcase

Шаблон находится в корневом `.env.example`. Значения ниже необязательны для one-click browser showcase:

| Переменная | Значение / назначение |
|---|---|
| `DEPLOYMENT_PROFILE` | `showcase` или `staging`; по умолчанию `showcase` |
| `DEMO_AUTH_ENABLED` | `true` для открытия вне Telegram; `false` только при настроенной Telegram auth |
| `SHOWCASE_DATA_FILE` | Vercel: `/tmp/web3-casino-showcase.json` |
| `VITE_API_URL` | пусто для combined deployment |
| `WEB_ORIGIN` | не нужен при same-origin; обязателен для split deployment |

Не добавляй секреты в `.env.example` или Git. В Vercel они задаются отдельно для Preview/Production в Project Settings → Environment Variables.

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

Текущий `Store` сохраняет состояние в `/tmp` и переиспользуется singleton-экземпляром внутри тёплой Function instance. Это удобно для короткой демонстрации, но **не является базой данных**:

- cold start или новый deployment может сбросить данные;
- несколько параллельных Function instances могут иметь разные балансы и сессии;
- нет глобальной консистентности, backup, point-in-time recovery и гарантии durability;
- preview deployments изолированы друг от друга.

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

Официальные материалы: [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite), [Fastify on Vercel](https://vercel.com/docs/frameworks/backend/fastify), [Vercel monorepos](https://vercel.com/docs/monorepos), [Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), [Function limits](https://vercel.com/docs/functions/limitations).

## Частые проблемы

- **Frontend открыт, но висит `Loading`:** проверь `/api/health`; для combined project `VITE_API_URL` должен быть пустым.
- **CORS в split deployment:** `WEB_ORIGIN` должен точно совпадать со схемой и host frontend.
- **После env-изменения ничего не поменялось:** сделай redeploy; особенно это важно для `VITE_API_URL`.
- **Баланс внезапно сбросился:** ожидаемое ограничение `/tmp`; для надёжного состояния нужен Postgres.
- **API отвечает 503 production gate:** стенд запущен с `APP_ENV=production` или `DEPLOYMENT_PROFILE=production`; не обходи gate без реализации production checklist.
