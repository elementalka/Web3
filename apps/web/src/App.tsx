import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Bell,
  ChevronRight,
  CircleDollarSign,
  Gamepad2,
  Globe2,
  Home,
  Info,
  Menu,
  ShieldCheck,
  Sparkles,
  UserRound,
  WalletCards,
  X
} from "lucide-react";
import { gameCatalog, formatMoney, type Locale } from "./catalog";
import {
  AuthLanding,
  BrandMark,
  CasinoBackdrop,
  Onboarding,
  SandboxRibbon,
  type RunAction
} from "./components/Shared";
import { ApiClient, ApiRequestError, type Bet, type GameConfigResponse, type GameId, type MinesSession, type SessionResponse } from "./lib/api";
import { bootTelegram } from "./lib/telegram";
import { AdminView } from "./views/Admin";
import { FairView } from "./views/Fair";
import { GameView } from "./views/Games";
import { Lobby, type RecommendationResponse } from "./views/Lobby";
import { WalletView } from "./views/Wallet";

type View = "lobby" | "wallet" | "fair" | "admin" | GameId;

const navigation = [
  { id: "lobby" as const, icon: Home, ru: "Главная", en: "Lobby" },
  { id: "wallet" as const, icon: WalletCards, ru: "Кабинет", en: "Wallet" },
  { id: "fair" as const, icon: ShieldCheck, ru: "Честность", en: "Fairness" },
  { id: "admin" as const, icon: BarChart3, ru: "Управление", en: "Admin" }
];

export default function App() {
  const [api] = useState(() => new ApiClient(localStorage.getItem("lumina_token") ?? undefined));
  const [view, setView] = useState<View>(initialView);
  const [locale, setLocale] = useState<Locale>(() => localStorage.getItem("lumina_locale") === "en" ? "en" : "ru");
  const [session, setSession] = useState<SessionResponse>();
  const [config, setConfig] = useState<GameConfigResponse>();
  const [history, setHistory] = useState<Bet[]>([]);
  const [lastBet, setLastBet] = useState<Bet>();
  const [activeMines, setActiveMines] = useState<MinesSession>();
  const [recommendations, setRecommendations] = useState<RecommendationResponse>();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => new URLSearchParams(window.location.search).get("skipOnboarding") !== "1" && localStorage.getItem("lumina_onboarding") !== "complete");
  const [showRealityCheck, setShowRealityCheck] = useState(false);
  const [selectedContent, setSelectedContent] = useState<SessionResponse["contentPages"][number]>();
  const [clientSeed, setClientSeedState] = useState(() => localStorage.getItem("lumina_client_seed") ?? makeClientSeed());
  const [sessionStartedAt] = useState(Date.now());

  const refresh = useCallback(async () => {
    const [sessionResult, configResult, historyResult, recommendationsResult] = await Promise.allSettled([
      api.session(),
      api.config(),
      api.history(),
      api.get<RecommendationResponse>("/api/recommendations")
    ]);

    if (sessionResult.status === "rejected") throw sessionResult.reason;
    if (configResult.status === "rejected") throw configResult.reason;

    setSession(sessionResult.value);
    setConfig(configResult.value);
    setActiveMines(sessionResult.value.activeMinesSessions[0]);
    if (historyResult.status === "fulfilled") setHistory(historyResult.value.bets);
    if (recommendationsResult.status === "fulfilled") setRecommendations(recommendationsResult.value);
  }, [api]);

  const saveAuth = useCallback(async (token: string) => {
    api.setToken(token);
    localStorage.setItem("lumina_token", token);
    try {
      await refresh();
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) {
        api.clearToken();
        localStorage.removeItem("lumina_token");
      }
      throw error;
    }
  }, [api, refresh]);

  const authenticate = useCallback(async (role: "player" | "admin" = "player") => {
    setBusy(true);
    setMessage("");
    try {
      const webApp = bootTelegram();
      const auth = role === "admin"
        ? await api.authDemo("admin")
        : webApp?.initData
          ? await api.authTelegram(webApp.initData)
          : await api.authDemo("player");
      await saveAuth(auth.token);
      if (role === "admin") setView("admin");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Authentication failed");
      if (role === "player") setSession(undefined);
    } finally {
      setBusy(false);
      setInitializing(false);
    }
  }, [api, saveAuth]);

  const connectWallet = useCallback(async () => {
    setBusy(true);
    setMessage("");
    try {
      if (!window.ethereum) throw new Error(locale === "ru" ? "Установите MetaMask или другой EVM-кошелёк" : "Install MetaMask or another EVM wallet");
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" }) as string[];
      const walletAddress = accounts[0];
      if (!walletAddress) throw new Error(locale === "ru" ? "Кошелёк не вернул адрес" : "Wallet did not return an address");
      const { nonce } = await api.walletNonce(walletAddress);
      const signature = await window.ethereum.request({ method: "personal_sign", params: [nonce, walletAddress] }) as string;
      const auth = await api.authWallet(walletAddress, signature, nonce);
      await saveAuth(auth.token);
      setView("wallet");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Wallet connection failed");
    } finally {
      setBusy(false);
      setInitializing(false);
    }
  }, [api, locale, saveAuth]);

  useEffect(() => {
    bootTelegram();
    const reviewAdmin = import.meta.env.DEV && new URLSearchParams(window.location.search).get("reviewAdmin") === "1";
    const initialize = api.hasToken()
      ? refresh().catch((error: unknown) => {
        if (error instanceof ApiRequestError && error.status === 401) {
          api.clearToken();
          localStorage.removeItem("lumina_token");
          return authenticate(reviewAdmin ? "admin" : "player");
        }
        setMessage(error instanceof Error ? error.message : "Demo API initialization failed");
        setSession(undefined);
      })
      : authenticate(reviewAdmin ? "admin" : "player");

    void initialize
      .finally(() => setInitializing(false));
  }, [api, authenticate, refresh]);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowRealityCheck(true), 30 * 60 * 1000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const runAction = useCallback(async <T,>(action: () => Promise<T>, onSuccess?: (value: T) => void | Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      const value = await action();
      await onSuccess?.(value);
      await refresh();
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success");
    } catch (error) {
      const text = error instanceof Error ? error.message : "Action failed";
      setMessage(text);
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("error");
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const setClientSeed = (value: string) => {
    setClientSeedState(value);
    localStorage.setItem("lumina_client_seed", value);
  };

  const changeLocale = () => {
    const next = locale === "ru" ? "en" : "ru";
    setLocale(next);
    localStorage.setItem("lumina_locale", next);
  };

  const navigate = (next: View) => {
    setView(next);
    setSidebarOpen(false);
    const url = new URL(window.location.href);
    if (next === "lobby") url.searchParams.delete("view");
    else url.searchParams.set("view", next);
    window.history.replaceState({}, "", url);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const selectedGame = gameCatalog.find((game) => game.id === view);
  const isAdmin = Boolean(session?.user.roles.some((role) => ["admin", "super_admin", "sandbox_admin", "risk"].includes(role)));
  const riskPercent = useMemo(() => Math.max(4, Math.min(100, ((config?.risk.tier ?? 0) / 4) * 100)), [config?.risk.tier]);
  const title = selectedGame?.name ?? pageTitle(view, locale);

  if (initializing) {
    return <div className="app-loader"><CasinoBackdrop /><BrandMark /><span><i /><i /><i /></span><p>{locale === "ru" ? "Проверяем окружение…" : "Verifying environment…"}</p></div>;
  }

  if (!session) {
    return <><AuthLanding locale={locale} busy={busy} connectWallet={connectWallet} tryDemo={() => authenticate("player")} />{message && <Toast message={message} onClose={() => setMessage("")} />}</>;
  }

  return (
    <main className={`app-shell view-${view}`}>
      <CasinoBackdrop />
      <SandboxRibbon locale={locale} />

      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-top">
          <BrandMark />
          <button type="button" className="sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close menu"><X size={19} /></button>
        </div>
        <nav className="side-nav" aria-label={locale === "ru" ? "Главная навигация" : "Main navigation"}>
          <span className="nav-label">{locale === "ru" ? "Платформа" : "Platform"}</span>
          {navigation.map((item) => {
            const Icon = item.icon;
            return <button type="button" key={item.id} className={view === item.id ? "active" : ""} onClick={() => navigate(item.id)}><Icon size={19} /><span>{item[locale]}</span>{item.id === "wallet" && session.notifications.length > 0 && <b>{session.notifications.length}</b>}</button>;
          })}
          <span className="nav-label games-label">{locale === "ru" ? "Игры" : "Games"}</span>
          {gameCatalog.map((game) => {
            const Icon = game.icon;
            return <button type="button" key={game.id} className={view === game.id ? "active" : ""} onClick={() => navigate(game.id)}><Icon size={18} /><span>{game.name}</span><i className={config?.games[game.id].limitPreview.available ? "online" : ""} /></button>;
          })}
        </nav>

        <div className="sidebar-trust-card">
          <span><ShieldCheck size={18} /></span>
          <div><strong>{locale === "ru" ? "Исход не адаптируется" : "Non-adaptive outcomes"}</strong><small>{locale === "ru" ? "Банк влияет только на лимиты" : "Bankroll changes limits only"}</small></div>
          <ChevronRight size={16} />
        </div>
        <div className="sidebar-footer">
          {session.contentPages.slice(0, 2).map((page) => <button type="button" key={page.id} onClick={() => setSelectedContent(page)}>{page.title}</button>)}
          <span>18+ · {locale === "ru" ? "Играйте ответственно" : "Play responsibly"}</span>
        </div>
      </aside>

      {sidebarOpen && <button type="button" className="sidebar-scrim" onClick={() => setSidebarOpen(false)} aria-label="Close navigation" />}

      <section className="app-main">
        <header className="topbar">
          <div className="topbar-title">
            <button type="button" className="menu-button" onClick={() => setSidebarOpen(true)} aria-label="Open menu"><Menu size={21} /></button>
            <div><span>{selectedGame?.eyebrow[locale] ?? (locale === "ru" ? "Lumina · Sandbox" : "Lumina · Sandbox")}</span><h2>{title}</h2></div>
          </div>
          <div className="topbar-actions">
            {config && (
              <div className="risk-pill" title={`${config.risk.tierLabel} · ${formatMoney(config.risk.availableRiskBank)}`}>
                <span><GaugeIcon /><b>Tier {config.risk.tier}</b></span>
                <i><b style={{ width: `${riskPercent}%` }} /></i>
              </div>
            )}
            <button type="button" className="language-button" onClick={changeLocale}><Globe2 size={16} /> {locale.toUpperCase()}</button>
            <button type="button" className="notification-button" onClick={() => navigate("wallet")} aria-label={locale === "ru" ? "Уведомления" : "Notifications"}><Bell size={18} />{session.notifications.length > 0 && <b>{session.notifications.length}</b>}</button>
            <button type="button" className="balance-button" onClick={() => navigate("wallet")}><CircleDollarSign size={18} /><span><small>{locale === "ru" ? "Баланс" : "Balance"}</small><strong>{formatMoney(session.user.balance)}</strong></span></button>
            <button type="button" className="profile-button" onClick={() => navigate("wallet")} aria-label={session.user.username}><UserRound size={19} /></button>
          </div>
        </header>

        {config && !config.risk.gamesEnabled && <div className="platform-pause"><Info size={17} /> {locale === "ru" ? "Новые ставки временно приостановлены risk engine. Вывод средств доступен." : "New bets are paused by the risk engine. Withdrawals remain available."}</div>}
        {message && <Toast message={message} onClose={() => setMessage("")} inline />}

        <section className="content-surface" aria-busy={busy}>
          {view === "lobby" && <Lobby config={config} history={history} locale={locale} onOpen={navigate} onWallet={() => navigate("wallet")} recommendations={recommendations} user={session.user} />}
          {view === "wallet" && <WalletView api={api} connectWallet={connectWallet} history={history} locale={locale} runAction={runAction as RunAction} session={session} />}
          {view === "fair" && <FairView api={api} config={config} history={history} locale={locale} runAction={runAction as RunAction} />}
          {view === "admin" && <AdminView api={api} authenticateAdmin={() => authenticate("admin")} isAdmin={isAdmin} locale={locale} runAction={runAction as RunAction} />}
          {selectedGame && config && <GameView activeMines={activeMines} api={api} busy={busy} clientSeed={clientSeed} config={config} gameId={selectedGame.id} locale={locale} onBack={() => navigate("lobby")} onBet={setLastBet} onMinesSession={setActiveMines} runAction={runAction as RunAction} setClientSeed={setClientSeed} />}
        </section>

        <footer className="site-footer">
          <BrandMark compact />
          <p>{locale === "ru" ? "Sandbox showcase. Не является предложением азартной игры на реальные средства." : "Sandbox showcase. Not an offer of real-money gambling."}</p>
          <span>© 2026 Lumina · HMAC-SHA256</span>
        </footer>
      </section>

      <nav className="mobile-nav" aria-label={locale === "ru" ? "Мобильная навигация" : "Mobile navigation"}>
        {navigation.map((item) => {
          const Icon = item.icon;
          return <button type="button" key={item.id} className={view === item.id || (item.id === "lobby" && Boolean(selectedGame)) ? "active" : ""} onClick={() => navigate(item.id)}><Icon size={19} /><span>{item[locale]}</span></button>;
        })}
      </nav>

      {showOnboarding && <Onboarding locale={locale} onClose={() => { localStorage.setItem("lumina_onboarding", "complete"); setShowOnboarding(false); }} />}
      {showRealityCheck && <RealityCheck locale={locale} minutes={Math.max(30, Math.floor((Date.now() - sessionStartedAt) / 60000))} onContinue={() => setShowRealityCheck(false)} onBreak={() => { setShowRealityCheck(false); navigate("wallet"); }} />}
      {selectedContent && <ContentModal page={selectedContent} onClose={() => setSelectedContent(undefined)} />}
    </main>
  );
}

function Toast({ inline, message, onClose }: { inline?: boolean; message: string; onClose: () => void }) {
  return <div className={`toast ${inline ? "inline" : ""}`} role="alert"><Info size={17} /><span>{message}</span><button type="button" onClick={onClose} aria-label="Close"><X size={16} /></button></div>;
}

function RealityCheck({ locale, minutes, onBreak, onContinue }: { locale: Locale; minutes: number; onBreak: () => void; onContinue: () => void }) {
  return (
    <div className="modal-backdrop">
      <section className="reality-modal" role="dialog" aria-modal="true">
        <span className="reality-icon"><Gamepad2 size={27} /></span>
        <span className="section-kicker">REALITY CHECK</span>
        <h2>{locale === "ru" ? `Вы играете уже ${minutes} минут` : `You've been playing for ${minutes} minutes`}</h2>
        <p>{locale === "ru" ? "Остановитесь на секунду и убедитесь, что время и расходы соответствуют вашему плану." : "Take a moment to check that your time and spending still match your plan."}</p>
        <div><button type="button" className="secondary-button" onClick={onBreak}>{locale === "ru" ? "Сделать паузу" : "Take a break"}</button><button type="button" className="primary-button" onClick={onContinue}>{locale === "ru" ? "Продолжить" : "Continue"}</button></div>
      </section>
    </div>
  );
}

function ContentModal({ onClose, page }: { onClose: () => void; page: SessionResponse["contentPages"][number] }) {
  return <div className="modal-backdrop"><section className="content-modal" role="dialog" aria-modal="true"><button type="button" className="modal-close" onClick={onClose}><X size={18} /></button><span className="section-kicker">VERSION {page.version}</span><h2>{page.title}</h2><p>{page.body}</p></section></div>;
}

function GaugeIcon() {
  return <span className="mini-gauge" aria-hidden="true"><i /></span>;
}

function makeClientSeed(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return `lumina-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function initialView(): View {
  const value = new URLSearchParams(window.location.search).get("view");
  return ["lobby", "wallet", "fair", "admin", ...gameCatalog.map((game) => game.id)].includes(value ?? "") ? value as View : "lobby";
}

function pageTitle(view: View, locale: Locale): string {
  if (view === "wallet") return locale === "ru" ? "Кабинет" : "Wallet";
  if (view === "fair") return locale === "ru" ? "Provably Fair" : "Provably Fair";
  if (view === "admin") return locale === "ru" ? "Управление" : "Admin";
  return locale === "ru" ? "Главная" : "Lobby";
}
