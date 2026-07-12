import { ArrowRight, BadgeCheck, CircleDollarSign, Gauge, ShieldCheck, Sparkles, TimerReset, Zap } from "lucide-react";
import { formatMoney, gameCatalog, type Locale } from "../catalog";
import { GamePreview, Metric, RecentBets } from "../components/Shared";
import type { Bet, GameConfigResponse, GameId, SessionResponse } from "../lib/api";

export interface RecommendationResponse {
  summary: {
    rounds24h: number;
    wagered24h: number;
    net24h: number;
    maxBet: number;
    dailyLoss: number;
  };
  recommendations: Array<{
    level: "ok" | "notice" | "warning" | "cooldown";
    title: string;
    body: string;
  }>;
}

export function Lobby({ config, history, locale, onOpen, onWallet, recommendations, user }: {
  config?: GameConfigResponse;
  history: Bet[];
  locale: Locale;
  onOpen: (id: GameId) => void;
  onWallet: () => void;
  recommendations?: RecommendationResponse;
  user?: SessionResponse["user"];
}) {
  const totalWagered = history.reduce((sum, bet) => sum + bet.betAmount, 0);
  const totalPaid = history.reduce((sum, bet) => sum + bet.payoutAmount, 0);
  const primary = recommendations?.recommendations[0];

  return (
    <div className="page-stack lobby-page">
      <section className="lobby-hero">
        <div className="hero-copy">
          <span className="hero-pill"><BadgeCheck size={15} /> {locale === "ru" ? "Проверяемая игра" : "Verifiable play"}</span>
          <h1>{locale === "ru" ? <>Честность —<br /><em>не вопрос веры.</em></> : <>Fairness is<br /><em>not a matter of trust.</em></>}</h1>
          <p>{locale === "ru" ? "Пять игр с открытой математикой, provably fair доказательствами и лимитами, которые защищают игрока и банк." : "Five games with transparent math, provably fair proofs, and limits that protect both player and bankroll."}</p>
          <div className="hero-actions">
            <button type="button" className="primary-button" onClick={() => onOpen("dice")}>
              <Zap size={18} /> {locale === "ru" ? "Играть в Dice" : "Play Dice"}
            </button>
            <button type="button" className="secondary-button" onClick={onWallet}>
              <CircleDollarSign size={18} /> {locale === "ru" ? "Тестовый баланс" : "Demo balance"}
            </button>
          </div>
          <div className="hero-footnote"><ShieldCheck size={15} /> HMAC-SHA256 · Server seed + Client seed + Nonce</div>
        </div>

        <div className="hero-art" aria-hidden="true">
          <span className="hero-core"><i /><i /><i /><b>L</b></span>
          <span className="floating-card card-one"><small>RTP</small><strong>96–98%</strong></span>
          <span className="floating-card card-two"><small>{locale === "ru" ? "БАНК" : "BANK"}</small><strong>{formatMoney(config?.risk.availableRiskBank ?? 0, true)}</strong></span>
          <span className="floating-card card-three"><ShieldCheck size={17} /><strong>VERIFIED</strong></span>
        </div>
      </section>

      <section className="trust-ticker" aria-label={locale === "ru" ? "Статус платформы" : "Platform status"}>
        <span><i /> {config?.risk.gamesEnabled ? (locale === "ru" ? "Игры доступны" : "Games online") : (locale === "ru" ? "Игры на паузе" : "Games paused")}</span>
        <span>HOUSE EDGE ONLY</span>
        <span>DOUBLE-ENTRY LEDGER</span>
        <span>NO ADAPTIVE RNG</span>
      </section>

      <section className="stats-strip">
        <Metric label={locale === "ru" ? "Ваш баланс" : "Your balance"} value={formatMoney(user?.balance ?? 0)} />
        <Metric label={locale === "ru" ? "Раундов" : "Rounds"} value={String(history.length)} />
        <Metric label={locale === "ru" ? "Поставлено" : "Wagered"} value={formatMoney(totalWagered)} />
        <Metric label={locale === "ru" ? "Выплачено" : "Paid out"} value={formatMoney(totalPaid)} />
      </section>

      <section className="games-section">
        <div className="section-heading wide-heading">
          <div>
            <span className="section-kicker">{locale === "ru" ? "Коллекция Lumina" : "The Lumina collection"}</span>
            <h2>{locale === "ru" ? "Выберите свою вероятность" : "Choose your probability"}</h2>
          </div>
          <p>{locale === "ru" ? "Результат зависит только от публичных правил и seed — никогда от истории игрока." : "Outcomes depend only on public rules and seeds—never on player history."}</p>
        </div>
        <div className="game-grid">
          {gameCatalog.map((game, index) => {
            const gameConfig = config?.games[game.id];
            const Icon = game.icon;
            return (
              <button
                type="button"
                className={`game-card accent-${game.accent} ${index === 0 ? "featured" : ""}`}
                key={game.id}
                onClick={() => onOpen(game.id)}
              >
                <span className="game-card-art"><GamePreview gameId={game.id} /></span>
                <span className="game-card-top">
                  <span className="game-card-icon"><Icon size={20} /></span>
                  <span className={`availability-dot ${gameConfig?.limitPreview.available ? "online" : ""}`}>
                    {gameConfig?.limitPreview.available ? "LIVE" : "PAUSED"}
                  </span>
                </span>
                <span className="game-card-copy">
                  <small>{game.eyebrow[locale]}</small>
                  <strong>{game.name}</strong>
                  <span>{game.description[locale]}</span>
                </span>
                <span className="game-card-meta">
                  <span><small>RTP</small><b>{game.rtp}</b></span>
                  <span><small>{locale === "ru" ? "МАКС" : "MAX"}</small><b>{formatMoney(gameConfig?.limitPreview.maxBet ?? 0)}</b></span>
                  <ArrowRight size={18} />
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="lobby-lower-grid">
        {primary && (
          <section className={`surface-card safety-card level-${primary.level}`}>
            <div className="safety-visual" aria-hidden="true"><span><i /><i /></span><ShieldCheck /></div>
            <div className="safety-copy">
              <span className="section-kicker">{locale === "ru" ? "Пульс ответственной игры" : "Responsible play pulse"}</span>
              <h2>{translateSafetyTitle(primary.title, locale)}</h2>
              <p>{translateSafetyBody(primary.body, locale)}</p>
              <div className="safety-metrics">
                <span><TimerReset size={16} /><b>{recommendations?.summary.rounds24h}</b> {locale === "ru" ? "раундов за 24ч" : "rounds in 24h"}</span>
                <span><Gauge size={16} /><b>{formatMoney(recommendations?.summary.net24h ?? 0)}</b> net</span>
              </div>
            </div>
          </section>
        )}
        <section className="surface-card proof-promo">
          <span className="proof-promo-icon"><Sparkles size={24} /></span>
          <span className="section-kicker">PROVABLY FAIR</span>
          <h2>{locale === "ru" ? "Не доверяйте. Проверяйте." : "Don't trust. Verify."}</h2>
          <p>{locale === "ru" ? "До ставки виден hash, после ротации — исходный server seed. Любое доказательство можно пересчитать." : "See the hash before a bet and the server seed after rotation. Every proof can be recalculated."}</p>
        </section>
      </div>

      <RecentBets bets={history.slice(0, 8)} locale={locale} />
    </div>
  );
}

function translateSafetyTitle(value: string, locale: Locale): string {
  if (locale === "en") return value;
  const map: Record<string, string> = {
    "Reality check": "Пора сделать паузу",
    "Loss limit signal": "Вы приближаетесь к лимиту",
    "Cooling-off active": "Период охлаждения активен",
    "Safety pulse stable": "Активность в пределах лимитов"
  };
  return map[value] ?? value;
}

function translateSafetyBody(value: string, locale: Locale): string {
  if (locale === "en") return value;
  if (value.includes("25+")) return "За последние 24 часа сыграно 25+ раундов. Небольшая пауза поможет сохранить контроль.";
  if (value.includes("comfort zone")) return "Текущий результат приблизился к установленному дневному лимиту проигрыша.";
  if (value.includes("delayed")) return "Повышение лимитов вступит в силу только после обязательных 24 часов.";
  if (value.includes("within")) return "Лимиты и недавняя активность находятся в выбранных вами рамках.";
  return value;
}
