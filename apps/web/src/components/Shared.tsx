import { useState, type ReactNode } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  CircleDollarSign,
  ExternalLink,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  WalletCards,
  X
} from "lucide-react";
import { formatDate, formatMoney, gameName, type GameMeta, type Locale } from "../catalog";
import type { Bet, GameConfigResponse } from "../lib/api";

export type RunAction = <T>(action: () => Promise<T>, onSuccess?: (value: T) => void) => Promise<void>;

export function CasinoBackdrop() {
  return (
    <div className="casino-backdrop" aria-hidden="true">
      <span className="aurora aurora-one" />
      <span className="aurora aurora-two" />
      <span className="grid-plane" />
      <span className="noise-layer" />
    </div>
  );
}

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand-mark ${compact ? "compact" : ""}`} aria-label="Lumina Casino">
      <span className="brand-symbol"><i /><i /><i /></span>
      {!compact && (
        <span className="brand-wordmark">
          <strong>LUMINA</strong>
          <small>PROVABLY FAIR</small>
        </span>
      )}
    </div>
  );
}

export function SandboxRibbon({ locale }: { locale: Locale }) {
  return (
    <div className="sandbox-ribbon" role="status">
      <span className="status-dot" />
      <strong>{locale === "ru" ? "SANDBOX" : "SANDBOX"}</strong>
      <span>{locale === "ru" ? "Тестовые средства · без реальных выплат" : "Test funds · no real payouts"}</span>
    </div>
  );
}

export function Metric({ label, value, tone }: { label: string; value: string; tone?: "positive" | "warning" }) {
  return (
    <div className={`metric ${tone ? `metric-${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function GamePreview({ gameId }: { gameId: GameMeta["id"] }) {
  if (gameId === "dice") return <span className="preview-dice"><i /><i /><i /><i /><i /></span>;
  if (gameId === "mines") return <span className="preview-mines">{Array.from({ length: 9 }, (_, index) => <i key={index} />)}</span>;
  if (gameId === "plinko") return <span className="preview-plinko">{Array.from({ length: 15 }, (_, index) => <i key={index} />)}<b /></span>;
  if (gameId === "orbit") return <span className="preview-orbit"><i /><i /><i /><b /></span>;
  return <span className="preview-signal">{Array.from({ length: 5 }, (_, index) => <i key={index} />)}<b /></span>;
}

export function RecentBets({ bets, locale, compact = false }: { bets: Bet[]; locale: Locale; compact?: boolean }) {
  return (
    <section className={`surface-card recent-bets ${compact ? "compact" : ""}`}>
      <div className="section-heading">
        <div>
          <span className="section-kicker">{locale === "ru" ? "Личная статистика" : "Personal stats"}</span>
          <h2>{locale === "ru" ? "Последние раунды" : "Recent rounds"}</h2>
        </div>
        <span className="quiet-badge">{bets.length}</span>
      </div>
      <div className="bet-list">
        {bets.length === 0 && (
          <EmptyState
            icon={<Sparkles size={20} />}
            title={locale === "ru" ? "История пока пуста" : "No rounds yet"}
            text={locale === "ru" ? "Первый честный раунд появится здесь." : "Your first fair round will appear here."}
          />
        )}
        {bets.map((bet) => (
          <div className="bet-row" key={bet.id}>
            <span className={`game-mini game-mini-${bet.gameId}`}>{gameName(bet.gameId).slice(0, 1)}</span>
            <span className="bet-main">
              <strong>{gameName(bet.gameId)}</strong>
              <small>{formatDate(bet.createdAt, locale)}</small>
            </span>
            <span className="bet-stake">{formatMoney(bet.betAmount)}</span>
            <span className={`outcome-chip ${bet.win ? "win" : "loss"}`}>
              {bet.multiplier.toFixed(2)}x
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function BetControls({ value, setValue, max, disabled, locale }: {
  value: number;
  setValue: (value: number) => void;
  max: number;
  disabled?: boolean;
  locale: Locale;
}) {
  const safeMax = Math.max(max, 0.01);
  const update = (next: number) => setValue(Math.min(safeMax, Math.max(0.01, Number(next.toFixed(2)))));
  return (
    <div className="bet-box">
      <label>
        <span>{locale === "ru" ? "Сумма ставки" : "Bet amount"}</span>
        <span className="amount-input">
          <CircleDollarSign size={17} />
          <input
            aria-label={locale === "ru" ? "Сумма ставки" : "Bet amount"}
            disabled={disabled}
            inputMode="decimal"
            min={0.01}
            max={safeMax}
            step={0.01}
            type="number"
            value={value}
            onChange={(event) => update(Number(event.target.value) || 0.01)}
          />
          <b>USDC</b>
        </span>
      </label>
      <div className="quick-bets" aria-label={locale === "ru" ? "Быстрый выбор ставки" : "Quick bet controls"}>
        <button type="button" disabled={disabled} onClick={() => update(value / 2)}>½</button>
        <button type="button" disabled={disabled} onClick={() => update(value * 2)}>2×</button>
        <button type="button" disabled={disabled} onClick={() => update(safeMax)}>MAX</button>
      </div>
    </div>
  );
}

export function GameFrame({
  children,
  clientSeed,
  config,
  game,
  locale,
  onBack,
  setClientSeed
}: {
  children: ReactNode;
  clientSeed: string;
  config: GameConfigResponse["games"][GameMeta["id"]];
  game: GameMeta;
  locale: Locale;
  onBack: () => void;
  setClientSeed: (value: string) => void;
}) {
  return (
    <div className={`game-layout accent-${game.accent}`}>
      <section className="game-stage">
        <div className="game-stage-glow" aria-hidden="true" />
        <header className="game-heading">
          <button type="button" className="icon-button" onClick={onBack} aria-label={locale === "ru" ? "Назад к играм" : "Back to games"}>
            <ArrowLeft size={19} />
          </button>
          <div>
            <span className="section-kicker">{game.eyebrow[locale]}</span>
            <h1>{game.name}</h1>
          </div>
          <span className={`live-pill ${config.limitPreview.available ? "" : "paused"}`}>
            <i /> {config.limitPreview.available ? "LIVE" : "PAUSED"}
          </span>
        </header>

        {!config.limitPreview.available && <div className="inline-alert warning">{config.limitPreview.reason}</div>}
        {children}
      </section>

      <aside className="game-aside">
        <section className="surface-card game-info-card">
          <div className="section-heading compact-heading">
            <div>
              <span className="section-kicker">{locale === "ru" ? "Параметры стола" : "Table parameters"}</span>
              <h2>{locale === "ru" ? "Прозрачная математика" : "Transparent math"}</h2>
            </div>
            <ShieldCheck size={21} />
          </div>
          <div className="parameter-list">
            <span><small>RTP</small><strong>{game.rtp}</strong></span>
            <span><small>{locale === "ru" ? "Макс. ставка" : "Max bet"}</small><strong>{formatMoney(config.limitPreview.maxBet)}</strong></span>
            <span><small>{locale === "ru" ? "Макс. выплата" : "Max payout"}</small><strong>{formatMoney(config.limitPreview.maxSinglePayout)}</strong></span>
            <span><small>{locale === "ru" ? "Волатильность" : "Volatility"}</small><strong>{game.volatility[locale]}</strong></span>
          </div>
        </section>

        <details className="surface-card fair-settings">
          <summary><LockKeyhole size={17} /> {locale === "ru" ? "Настройки честности" : "Fairness settings"}</summary>
          <label>
            <span>Client seed</span>
            <input maxLength={128} value={clientSeed} onChange={(event) => setClientSeed(event.target.value)} />
          </label>
          <p>{locale === "ru" ? "Seed входит в HMAC каждого раунда и позволяет независимо проверить доказательство после раскрытия server seed." : "This seed is included in every round HMAC and lets you independently audit the proof after the server seed is revealed."}</p>
        </details>

        <div className="responsible-note">
          <ShieldCheck size={18} />
          <span>{locale === "ru" ? "Играйте в рамках установленного лимита. Результат не зависит от прошлых побед или проигрышей." : "Stay within your limit. Outcomes never depend on previous wins or losses."}</span>
        </div>
      </aside>
    </div>
  );
}

export function ResultCard({ bet, locale }: { bet: Bet; locale: Locale }) {
  const net = bet.payoutAmount - bet.betAmount;
  return (
    <div className={`result-card ${bet.win ? "win" : "loss"}`} role="status" aria-live="polite">
      <span className="result-icon">{bet.win ? <BadgeCheck size={22} /> : <X size={22} />}</span>
      <span>
        <small>{bet.win ? (locale === "ru" ? "Выигрыш" : "Won") : (locale === "ru" ? "Раунд завершён" : "Round complete")}</small>
        <strong>{net >= 0 ? "+" : ""}{formatMoney(net)}</strong>
      </span>
      <b>{bet.multiplier.toFixed(2)}×</b>
    </div>
  );
}

export function EmptyState({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="empty-state">
      <span>{icon}</span>
      <div><strong>{title}</strong><small>{text}</small></div>
    </div>
  );
}

export function Onboarding({ locale, onClose }: { locale: Locale; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [accepted, setAccepted] = useState(false);
  const slides = locale === "ru" ? [
    { icon: <ShieldCheck />, tag: "01 · Честность", title: "Каждый исход можно проверить", text: "Server seed фиксируется хешем до ставки. Client seed и nonce формируют независимое HMAC-доказательство." },
    { icon: <WalletCards />, tag: "02 · Контроль", title: "Ваши лимиты — часть продукта", text: "Ограничьте ставку, депозит или дневной проигрыш. Самоисключение блокирует игру, но никогда не блокирует вывод." },
    { icon: <Sparkles />, tag: "03 · Sandbox", title: "Сейчас вы в демонстрации", text: "Все средства тестовые, реальных депозитов и выплат нет. Этот режим создан для безопасной проверки механик." }
  ] : [
    { icon: <ShieldCheck />, tag: "01 · Fairness", title: "Every outcome is auditable", text: "The server seed is committed before a bet. Client seed and nonce form an independent HMAC proof." },
    { icon: <WalletCards />, tag: "02 · Control", title: "Your limits are built in", text: "Set bet, deposit, or daily-loss limits. Self-exclusion stops play but never blocks withdrawals." },
    { icon: <Sparkles />, tag: "03 · Sandbox", title: "You are viewing a demo", text: "All funds are simulated. There are no real deposits or payouts in this safe showcase environment." }
  ];
  const slide = slides[step];

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="onboarding-modal" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
        <div className="onboarding-visual">
          <BrandMark />
          <span className="onboarding-orbit"><i /><i /><i /><b>{slide.icon}</b></span>
          <small>{locale === "ru" ? "Пять игр · одна проверяемая система" : "Five games · one verifiable system"}</small>
        </div>
        <div className="onboarding-copy">
          <span className="section-kicker">{slide.tag}</span>
          <h2 id="onboarding-title">{slide.title}</h2>
          <p>{slide.text}</p>
          <div className="step-dots" aria-label={`${step + 1} / ${slides.length}`}>
            {slides.map((_, index) => <i key={index} className={index === step ? "active" : ""} />)}
          </div>
          {step === slides.length - 1 && (
            <label className="consent-check">
              <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
              <span>{locale === "ru" ? "Мне исполнилось 18 лет. Я понимаю, что это sandbox-демонстрация азартного продукта." : "I am 18 or older and understand this is a sandbox gambling-product demo."}</span>
            </label>
          )}
          <div className="modal-actions">
            {step > 0 && <button type="button" className="secondary-button" onClick={() => setStep(step - 1)}>{locale === "ru" ? "Назад" : "Back"}</button>}
            <button
              type="button"
              className="primary-button"
              disabled={step === slides.length - 1 && !accepted}
              onClick={() => step < slides.length - 1 ? setStep(step + 1) : onClose()}
            >
              {step < slides.length - 1 ? (locale === "ru" ? "Продолжить" : "Continue") : (locale === "ru" ? "Войти в Lumina" : "Enter Lumina")}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

export function AuthLanding({ locale, busy, connectWallet, tryDemo }: {
  locale: Locale;
  busy: boolean;
  connectWallet: () => void;
  tryDemo: () => void;
}) {
  return (
    <main className="auth-page">
      <CasinoBackdrop />
      <header className="auth-header"><BrandMark /><span>18+</span></header>
      <section className="auth-hero">
        <span className="hero-pill"><ShieldCheck size={16} /> {locale === "ru" ? "Provably fair sandbox" : "Provably fair sandbox"}</span>
        <h1>{locale === "ru" ? <>Вероятность.<br /><em>Без секретов.</em></> : <>Probability.<br /><em>Without secrets.</em></>}</h1>
        <p>{locale === "ru" ? "Пять оригинальных игр, динамический риск-контроль и доказательство каждого результата." : "Five original games, dynamic risk controls, and a proof behind every outcome."}</p>
        <div className="auth-actions">
          <button type="button" className="primary-button" disabled={busy} onClick={connectWallet}><WalletCards size={19} /> {locale === "ru" ? "Подключить кошелёк" : "Connect wallet"}</button>
          <button type="button" className="secondary-button" disabled={busy} onClick={tryDemo}>{locale === "ru" ? "Открыть демо" : "Open demo"}</button>
        </div>
        <div className="auth-trust"><span>HMAC-SHA256</span><span>5 GAMES</span><span>USDC TESTNET</span></div>
      </section>
      <a className="auth-source" href="https://github.com/elementalka/Web3" target="_blank" rel="noreferrer">GitHub <ExternalLink size={14} /></a>
    </main>
  );
}
