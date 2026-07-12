import { useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  CircleDollarSign,
  Clock3,
  Copy,
  Headphones,
  Landmark,
  LockKeyhole,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  WalletCards
} from "lucide-react";
import { formatDate, formatMoney, type Locale } from "../catalog";
import { EmptyState, Metric, RecentBets, type RunAction } from "../components/Shared";
import type { ApiClient, Bet, SessionResponse } from "../lib/api";

type AccountTab = "funds" | "activity" | "limits" | "support";

export function WalletView({ api, connectWallet, history, locale, runAction, session }: {
  api: ApiClient;
  connectWallet: () => void;
  history: Bet[];
  locale: Locale;
  runAction: RunAction;
  session: SessionResponse;
}) {
  const { user } = session;
  const [tab, setTab] = useState<AccountTab>("funds");
  const [amount, setAmount] = useState(10);
  const [maxBet, setMaxBet] = useState(user.limits.maxBet);
  const [dailyDeposit, setDailyDeposit] = useState(user.limits.dailyDeposit);
  const [dailyLoss, setDailyLoss] = useState(user.limits.dailyLoss);
  const [ticketCategory, setTicketCategory] = useState("payment");
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketBody, setTicketBody] = useState("");
  const demoFunds = session.environment?.demoFunds ?? true;
  const selfExcluded = Boolean(user.selfExcludedUntil && new Date(user.selfExcludedUntil).getTime() > Date.now());

  const transactions = useMemo(() => [
    ...(session.deposits ?? []).map((item) => ({ ...item, kind: "deposit" as const })),
    ...(session.withdrawals ?? []).map((item) => ({ ...item, kind: "withdrawal" as const, txHash: item.txHash ?? "" }))
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [session.deposits, session.withdrawals]);

  const identity = user.walletAddress ?? (user.telegramId ? `Telegram · ${user.telegramId}` : locale === "ru" ? "Демо-профиль" : "Demo profile");

  return (
    <div className="page-stack account-page">
      <section className="account-hero">
        <div className="account-balance">
          <span className="section-kicker">{locale === "ru" ? "Доступный баланс" : "Available balance"}</span>
          <h1>{formatMoney(user.balance)}</h1>
          <span className="network-pill"><i /> {demoFunds ? "BASE SEPOLIA · TESTNET" : "USDC"}</span>
        </div>
        <div className="account-identity">
          <span className="wallet-avatar"><WalletCards size={25} /></span>
          <span><small>{locale === "ru" ? "Активный профиль" : "Active profile"}</small><strong>{user.username}</strong><b>{shorten(identity)}</b></span>
          {!user.walletAddress && <button type="button" className="secondary-button small-button" onClick={connectWallet}>{locale === "ru" ? "Подключить" : "Connect"}</button>}
        </div>
      </section>

      {selfExcluded && (
        <div className="inline-alert warning"><LockKeyhole size={18} /> {locale === "ru" ? `Пауза активна до ${formatDate(user.selfExcludedUntil!, locale)}. Вывод остается доступен.` : `Play is paused until ${formatDate(user.selfExcludedUntil!, locale)}. Withdrawals remain available.`}</div>
      )}

      <nav className="account-tabs" aria-label={locale === "ru" ? "Разделы кабинета" : "Account sections"}>
        <button type="button" className={tab === "funds" ? "active" : ""} onClick={() => setTab("funds")}><CircleDollarSign size={17} />{locale === "ru" ? "Средства" : "Funds"}</button>
        <button type="button" className={tab === "activity" ? "active" : ""} onClick={() => setTab("activity")}><Clock3 size={17} />{locale === "ru" ? "История" : "Activity"}</button>
        <button type="button" className={tab === "limits" ? "active" : ""} onClick={() => setTab("limits")}><ShieldCheck size={17} />{locale === "ru" ? "Контроль" : "Controls"}</button>
        <button type="button" className={tab === "support" ? "active" : ""} onClick={() => setTab("support")}><Headphones size={17} />{locale === "ru" ? "Поддержка" : "Support"}</button>
      </nav>

      {tab === "funds" && (
        <div className="account-grid">
          <section className="surface-card funds-card">
            <div className="section-heading">
              <div><span className="section-kicker">{demoFunds ? "SANDBOX" : "USDC"}</span><h2>{locale === "ru" ? "Управление средствами" : "Manage funds"}</h2></div>
              <Landmark size={22} />
            </div>
            <label className="large-amount-field">
              <span>{locale === "ru" ? "Сумма" : "Amount"}</span>
              <span><CircleDollarSign size={20} /><input type="number" min={0.01} max={100} step={0.01} value={amount} onChange={(event) => setAmount(Math.max(0.01, Number(event.target.value) || 0.01))} /><b>USDC</b></span>
            </label>
            <div className="preset-row">{[5, 10, 25, 50].map((value) => <button type="button" key={value} onClick={() => setAmount(value)}>{value}</button>)}</div>
            <div className="fund-actions">
              <button type="button" className="primary-button" disabled={!demoFunds || selfExcluded} onClick={() => runAction(() => api.post("/api/deposits/mock", { amount }))}><ArrowDownLeft size={19} /> {locale === "ru" ? "Тестовый депозит" : "Test deposit"}</button>
              <button type="button" className="secondary-button" disabled={amount > user.balance} onClick={() => runAction(() => api.post("/api/withdrawals", { amount }))}><ArrowUpRight size={19} /> {locale === "ru" ? "Вывести" : "Withdraw"}</button>
            </div>
            <p className="field-hint"><ShieldCheck size={14} /> {demoFunds ? (locale === "ru" ? "Только тестовые средства. Транзакция не отправляется в mainnet." : "Test funds only. No mainnet transaction is created.") : (locale === "ru" ? "Real-money интеграция отключена до legal/security gate." : "Real-money integration is disabled until the legal/security gate.")}</p>
          </section>

          <section className="surface-card notification-card">
            <div className="section-heading">
              <div><span className="section-kicker">{locale === "ru" ? "События" : "Updates"}</span><h2>{locale === "ru" ? "Уведомления" : "Notifications"}</h2></div>
              <span className="quiet-badge"><Bell size={14} /> {session.notifications.length}</span>
            </div>
            <div className="notification-list">
              {session.notifications.length === 0 && <EmptyState icon={<Bell size={20} />} title={locale === "ru" ? "Все спокойно" : "All quiet"} text={locale === "ru" ? "Важные статусы появятся здесь." : "Important account updates appear here."} />}
              {session.notifications.slice(0, 6).map((item) => (
                <div key={item.id} className="notification-row"><span><Bell size={16} /></span><div><strong>{localizeNotification(item.title, locale)}</strong><p>{localizeNotification(item.body, locale)}</p><small>{formatDate(item.createdAt, locale)}</small></div></div>
              ))}
            </div>
          </section>
        </div>
      )}

      {tab === "activity" && (
        <div className="account-grid activity-grid">
          <RecentBets bets={history} locale={locale} />
          <section className="surface-card transactions-card">
            <div className="section-heading"><div><span className="section-kicker">USDC</span><h2>{locale === "ru" ? "Транзакции" : "Transactions"}</h2></div><span className="quiet-badge">{transactions.length}</span></div>
            <div className="transaction-list">
              {transactions.length === 0 && <EmptyState icon={<Landmark size={20} />} title={locale === "ru" ? "Нет транзакций" : "No transactions"} text={locale === "ru" ? "Депозиты и выводы появятся здесь." : "Deposits and withdrawals appear here."} />}
              {transactions.map((item) => (
                <div className="transaction-row" key={`${item.kind}-${item.id}`}>
                  <span className={item.kind === "deposit" ? "deposit" : "withdrawal"}>{item.kind === "deposit" ? <ArrowDownLeft size={17} /> : <ArrowUpRight size={17} />}</span>
                  <div><strong>{item.kind === "deposit" ? (locale === "ru" ? "Депозит" : "Deposit") : (locale === "ru" ? "Вывод" : "Withdrawal")}</strong><small>{formatDate(item.createdAt, locale)}</small></div>
                  <b>{item.kind === "deposit" ? "+" : "−"}{formatMoney(item.amount)}</b>
                  <em>{localizeStatus(item.status, locale)}</em>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {tab === "limits" && (
        <div className="account-grid controls-grid">
          <section className="surface-card limits-card">
            <div className="section-heading"><div><span className="section-kicker">{locale === "ru" ? "Ответственная игра" : "Responsible play"}</span><h2>{locale === "ru" ? "Ваши лимиты" : "Your limits"}</h2></div><SlidersHorizontal size={22} /></div>
            <div className="limit-fields">
              <NumberField label={locale === "ru" ? "Максимальная ставка" : "Maximum bet"} value={maxBet} setValue={setMaxBet} suffix="USDC" />
              <NumberField label={locale === "ru" ? "Депозит за 24 часа" : "24h deposit"} value={dailyDeposit} setValue={setDailyDeposit} suffix="USDC" />
              <NumberField label={locale === "ru" ? "Проигрыш за 24 часа" : "24h loss"} value={dailyLoss} setValue={setDailyLoss} suffix="USDC" />
            </div>
            <button type="button" className="primary-button" onClick={() => runAction(() => api.post("/api/responsible/limits", { maxBet, dailyDeposit, dailyLoss }))}>{locale === "ru" ? "Сохранить лимиты" : "Save limits"}</button>
            <p className="field-hint"><Clock3 size={14} /> {locale === "ru" ? "Снижение применяется сразу. Повышение — только после 24-часового cooling-off." : "Decreases apply immediately. Increases require a 24-hour cooling-off period."}</p>
            {user.limits.pendingChange && <div className="pending-limit"><Clock3 size={17} /><span>{locale === "ru" ? `Повышение ожидает до ${formatDate(user.limits.pendingChange.effectiveAt, locale)}` : `Increase pending until ${formatDate(user.limits.pendingChange.effectiveAt, locale)}`}</span></div>}
          </section>

          <section className="surface-card break-card">
            <span className="break-icon"><LockKeyhole size={24} /></span>
            <span className="section-kicker">TAKE A BREAK</span>
            <h2>{locale === "ru" ? "Пауза без исключений" : "A break with no shortcuts"}</h2>
            <p>{locale === "ru" ? "Игра и депозиты будут заблокированы до конца выбранного срока. Вывод средств останется доступным." : "Play and deposits will be blocked for the full selected period. Withdrawals remain available."}</p>
            <div className="break-options">
              <button type="button" disabled={selfExcluded} onClick={() => runAction(() => api.post("/api/responsible/self-exclusion", { hours: 24 }))}>24h</button>
              <button type="button" disabled={selfExcluded} onClick={() => runAction(() => api.post("/api/responsible/self-exclusion", { hours: 168 }))}>7 {locale === "ru" ? "дней" : "days"}</button>
              <button type="button" disabled={selfExcluded} onClick={() => runAction(() => api.post("/api/responsible/self-exclusion", { hours: 720 }))}>30 {locale === "ru" ? "дней" : "days"}</button>
            </div>
          </section>
        </div>
      )}

      {tab === "support" && (
        <div className="account-grid support-grid">
          <section className="surface-card support-form-card">
            <div className="section-heading"><div><span className="section-kicker">{locale === "ru" ? "Ответ ≤ 4 часов" : "Reply within 4 hours"}</span><h2>{locale === "ru" ? "Создать обращение" : "Create a ticket"}</h2></div><Headphones size={22} /></div>
            <label className="form-field"><span>{locale === "ru" ? "Категория" : "Category"}</span><select value={ticketCategory} onChange={(event) => setTicketCategory(event.target.value)}><option value="payment">{locale === "ru" ? "Платежи" : "Payments"}</option><option value="game">{locale === "ru" ? "Игровой раунд" : "Game round"}</option><option value="responsible">{locale === "ru" ? "Ответственная игра" : "Responsible play"}</option><option value="account">{locale === "ru" ? "Аккаунт" : "Account"}</option><option value="other">{locale === "ru" ? "Другое" : "Other"}</option></select></label>
            <label className="form-field"><span>{locale === "ru" ? "Тема" : "Subject"}</span><input value={ticketSubject} onChange={(event) => setTicketSubject(event.target.value)} placeholder={locale === "ru" ? "Коротко опишите вопрос" : "Summarize your question"} /></label>
            <label className="form-field"><span>{locale === "ru" ? "Сообщение" : "Message"}</span><textarea rows={5} value={ticketBody} onChange={(event) => setTicketBody(event.target.value)} placeholder={locale === "ru" ? "Добавьте ID раунда или транзакции, если он есть" : "Include a round or transaction ID when available"} /></label>
            <button type="button" className="primary-button" disabled={ticketSubject.trim().length < 3 || ticketBody.trim().length < 3} onClick={() => runAction(
              () => api.post("/api/support/tickets", { category: ticketCategory, subject: ticketSubject, body: ticketBody }),
              () => { setTicketSubject(""); setTicketBody(""); }
            )}><Send size={18} /> {locale === "ru" ? "Отправить" : "Send ticket"}</button>
          </section>
          <section className="surface-card ticket-list-card">
            <div className="section-heading"><div><span className="section-kicker">{locale === "ru" ? "История" : "History"}</span><h2>{locale === "ru" ? "Ваши обращения" : "Your tickets"}</h2></div><span className="quiet-badge">{session.supportTickets?.length ?? 0}</span></div>
            {(session.supportTickets?.length ?? 0) === 0 && <EmptyState icon={<Headphones size={20} />} title={locale === "ru" ? "Обращений нет" : "No tickets"} text={locale === "ru" ? "Мы рядом, если понадобится помощь." : "We're here if you need help."} />}
            <div className="ticket-list">{session.supportTickets?.map((ticket) => <div key={ticket.id}><span><strong>{ticket.subject}</strong><small>{formatDate(ticket.createdAt, locale)}</small></span><em>{localizeStatus(ticket.status, locale)}</em></div>)}</div>
          </section>
        </div>
      )}

      <section className="account-footer-stats">
        <Metric label={locale === "ru" ? "Risk score" : "Risk score"} value={`${user.riskScore}/100`} />
        <Metric label={locale === "ru" ? "Макс. ставка" : "Max bet"} value={formatMoney(user.limits.maxBet)} />
        <Metric label={locale === "ru" ? "Дневной проигрыш" : "Daily loss"} value={formatMoney(user.limits.dailyLoss)} />
        <button type="button" className="copy-id" onClick={() => navigator.clipboard?.writeText(user.id)}><Copy size={15} /> ID {user.id.slice(0, 12)}</button>
      </section>
    </div>
  );
}

function NumberField({ label, setValue, suffix, value }: { label: string; setValue: (value: number) => void; suffix: string; value: number }) {
  return <label className="number-field"><span>{label}</span><span><input type="number" min={0.01} max={500} step={0.01} value={value} onChange={(event) => setValue(Math.max(0.01, Number(event.target.value) || 0.01))} /><b>{suffix}</b></span></label>;
}

function shorten(value: string): string {
  return value.length > 24 ? `${value.slice(0, 11)}…${value.slice(-8)}` : value;
}

function localizeStatus(status: string, locale: Locale): string {
  if (locale === "en") return status.replaceAll("_", " ");
  const values: Record<string, string> = { confirmed: "подтверждено", pending_review: "на проверке", rejected: "отклонено", open: "открыто", waiting_user: "ждет ответа", escalated: "эскалация", resolved: "решено" };
  return values[status] ?? status.replaceAll("_", " ");
}

function localizeNotification(value: string, locale: Locale): string {
  if (locale === "en") return value;
  const exact: Record<string, string> = {
    "Deposit confirmed": "Депозит подтвержден",
    "Withdrawal confirmed": "Вывод подтвержден",
    "Withdrawal in review": "Вывод на проверке",
    "Self-exclusion enabled": "Пауза активирована"
  };
  if (exact[value]) return exact[value];
  return value
    .replace("USDC credited", "USDC зачислено")
    .replace("USDC sent on testnet", "USDC отправлено в testnet")
    .replace("USDC requires manual review", "USDC требует ручной проверки")
    .replace("Account locked until", "Игра заблокирована до");
}
