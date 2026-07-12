import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BookOpenCheck,
  Check,
  CircleDollarSign,
  FileClock,
  Gauge,
  Landmark,
  LockKeyhole,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
  TestTube2,
  Users,
  X
} from "lucide-react";
import { formatDate, formatMoney, gameCatalog, gameName, type Locale } from "../catalog";
import { BrandMark, EmptyState, Metric, type RunAction } from "../components/Shared";
import type { ApiClient, Bet, GameId } from "../lib/api";

type AdminTab = "overview" | "withdrawals" | "sandbox" | "audit";

interface Dashboard {
  risk: {
    casinoEquity: number;
    availableRiskBank: number;
    totalUserBalances: number;
    tier: number;
    tierLabel: string;
    gamesEnabled: boolean;
    dailyLossCap: number;
  };
  bankroll: {
    treasuryBalance: number;
    pendingWithdrawals: number;
    minimumReserve: number;
    gasReserve: number;
    emergencyPaused: boolean;
  };
  users: number;
  activeMines: number;
  pendingWithdrawals: Array<{ id: string; userId: string; amount: number; createdAt: string; status: string }>;
  recentBets: Bet[];
  analytics: Array<{ id: string; name: string; createdAt: string; gameId?: GameId }>;
  ledgerReconciliation: { ok: boolean; errors: string[] };
}

interface AuditResponse {
  auditLogs: Array<{ id: string; actorUserId: string; action: string; target?: string; createdAt: string; metadata?: Record<string, unknown> }>;
  ledgerEntries: Array<{ id: string; type: string; description: string; createdAt: string }>;
}

interface SimulationReport {
  gameId: GameId;
  rounds: number;
  wagered: number;
  paid: number;
  actualRtp: number;
  winRate: number;
  generatedAt: string;
}

export function AdminView({ api, authenticateAdmin, isAdmin, locale, runAction }: {
  api: ApiClient;
  authenticateAdmin: () => void;
  isAdmin: boolean;
  locale: Locale;
  runAction: RunAction;
}) {
  const [tab, setTab] = useState<AdminTab>("overview");
  const [dashboard, setDashboard] = useState<Dashboard>();
  const [audit, setAudit] = useState<AuditResponse>();
  const [report, setReport] = useState<SimulationReport>();
  const [simGame, setSimGame] = useState<GameId>("dice");
  const [simRounds, setSimRounds] = useState(1000);
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [adjustmentAmount, setAdjustmentAmount] = useState(1);

  const loadDashboard = useCallback(async () => {
    const [nextDashboard, nextAudit] = await Promise.all([
      api.get<Dashboard>("/api/admin/dashboard"),
      api.get<AuditResponse>("/api/admin/audit")
    ]);
    setDashboard(nextDashboard);
    setAudit(nextAudit);
  }, [api]);

  useEffect(() => {
    if (isAdmin) loadDashboard().catch(() => undefined);
  }, [isAdmin, loadDashboard]);

  const gameStats = useMemo(() => gameCatalog.map((game) => {
    const bets = dashboard?.recentBets.filter((bet) => bet.gameId === game.id) ?? [];
    const wagered = bets.reduce((sum, bet) => sum + bet.betAmount, 0);
    const paid = bets.reduce((sum, bet) => sum + bet.payoutAmount, 0);
    return { ...game, rounds: bets.length, rtpActual: wagered > 0 ? paid / wagered : 0 };
  }), [dashboard?.recentBets]);

  if (!isAdmin) {
    return (
      <section className="admin-gate">
        <div className="admin-gate-visual"><BrandMark /><span><LockKeyhole size={34} /></span></div>
        <div>
          <span className="section-kicker">RESTRICTED AREA</span>
          <h1>{locale === "ru" ? "Операционный контур" : "Operations console"}</h1>
          <p>{locale === "ru" ? "В демонстрации используется отдельная sandbox-роль. Production-доступ требует реального второго фактора и IP allowlist." : "The showcase uses a separate sandbox role. Production access requires a real second factor and an IP allowlist."}</p>
          <button type="button" className="primary-button" onClick={authenticateAdmin}><ShieldCheck size={19} /> {locale === "ru" ? "Войти как sandbox admin" : "Enter as sandbox admin"}</button>
        </div>
      </section>
    );
  }

  return (
    <div className="page-stack admin-page">
      <section className="admin-header">
        <div><span className="hero-pill"><ShieldCheck size={15} /> SANDBOX OPERATIONS</span><h1>{locale === "ru" ? "Центр управления" : "Control center"}</h1><p>{locale === "ru" ? "Bankroll, risk, ledger и симуляции в одном наблюдаемом контуре." : "Bankroll, risk, ledger, and simulations in one observable control plane."}</p></div>
        <div className={`system-health ${dashboard?.ledgerReconciliation.ok ? "healthy" : "danger"}`}><span>{dashboard?.ledgerReconciliation.ok ? <Check /> : <AlertTriangle />}</span><div><small>{locale === "ru" ? "Состояние системы" : "System health"}</small><strong>{dashboard?.ledgerReconciliation.ok ? (locale === "ru" ? "Все инварианты в норме" : "All invariants healthy") : (locale === "ru" ? "Требуется проверка" : "Review required")}</strong></div></div>
      </section>

      <nav className="admin-tabs">
        <button type="button" className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}><BarChart3 size={17} />{locale === "ru" ? "Обзор" : "Overview"}</button>
        <button type="button" className={tab === "withdrawals" ? "active" : ""} onClick={() => setTab("withdrawals")}><Landmark size={17} />{locale === "ru" ? "Выводы" : "Withdrawals"}<b>{dashboard?.pendingWithdrawals.length ?? 0}</b></button>
        <button type="button" className={tab === "sandbox" ? "active" : ""} onClick={() => setTab("sandbox")}><TestTube2 size={17} />Sandbox</button>
        <button type="button" className={tab === "audit" ? "active" : ""} onClick={() => setTab("audit")}><FileClock size={17} />Audit</button>
        <button type="button" className="refresh-admin" onClick={() => runAction(loadDashboard)}><RefreshCw size={16} /></button>
      </nav>

      {tab === "overview" && (
        <>
          <section className="admin-metrics">
            <Metric label={locale === "ru" ? "Казино equity" : "Casino equity"} value={formatMoney(dashboard?.risk.casinoEquity ?? 0)} />
            <Metric label={locale === "ru" ? "Risk bank" : "Risk bank"} value={formatMoney(dashboard?.risk.availableRiskBank ?? 0)} tone="positive" />
            <Metric label={locale === "ru" ? "Баланс игроков" : "Player balances"} value={formatMoney(dashboard?.risk.totalUserBalances ?? 0)} />
            <Metric label={locale === "ru" ? "Пользователи" : "Users"} value={String(dashboard?.users ?? 0)} />
          </section>
          <div className="admin-overview-grid">
            <section className="surface-card bankroll-card">
              <div className="section-heading"><div><span className="section-kicker">BANKROLL ENGINE</span><h2>{locale === "ru" ? "Резервы и риск" : "Reserves & risk"}</h2></div><Gauge size={22} /></div>
              <div className="tier-display"><span><small>TIER {dashboard?.risk.tier ?? "—"}</small><strong>{dashboard?.risk.tierLabel ?? "Loading"}</strong></span><i><b style={{ width: `${Math.max(5, ((dashboard?.risk.tier ?? 0) / 4) * 100)}%` }} /></i></div>
              <div className="parameter-list">
                <span><small>Treasury</small><strong>{formatMoney(dashboard?.bankroll.treasuryBalance ?? 0)}</strong></span>
                <span><small>{locale === "ru" ? "Мин. резерв" : "Minimum reserve"}</small><strong>{formatMoney(dashboard?.bankroll.minimumReserve ?? 0)}</strong></span>
                <span><small>Gas reserve</small><strong>{formatMoney(dashboard?.bankroll.gasReserve ?? 0)}</strong></span>
                <span><small>{locale === "ru" ? "Дневной loss cap" : "Daily loss cap"}</small><strong>{formatMoney(dashboard?.risk.dailyLossCap ?? 0)}</strong></span>
              </div>
              <div className="emergency-actions">
                <button type="button" className="danger-button" disabled={dashboard?.bankroll.emergencyPaused} onClick={() => runAction(() => api.post("/api/admin/emergency-pause", { paused: true, reason: "Manual sandbox risk pause" }), loadDashboard)}><Pause size={17} /> {locale === "ru" ? "Пауза" : "Pause"}</button>
                <button type="button" className="secondary-button" disabled={!dashboard?.bankroll.emergencyPaused} onClick={() => runAction(() => api.post("/api/admin/emergency-pause", { paused: false, reason: "Manual sandbox resume" }), loadDashboard)}><Play size={17} /> {locale === "ru" ? "Возобновить" : "Resume"}</button>
              </div>
            </section>

            <section className="surface-card operations-card">
              <div className="section-heading"><div><span className="section-kicker">LIVE OPERATIONS</span><h2>{locale === "ru" ? "Текущая нагрузка" : "Current operations"}</h2></div><Activity size={22} /></div>
              <div className="operations-ring"><span><i /><b>{dashboard?.activeMines ?? 0}</b><small>{locale === "ru" ? "активных Mines" : "active Mines"}</small></span></div>
              <div className="ops-mini-grid"><span><Users size={17} /><b>{dashboard?.users ?? 0}</b><small>{locale === "ru" ? "профилей" : "profiles"}</small></span><span><Landmark size={17} /><b>{dashboard?.pendingWithdrawals.length ?? 0}</b><small>{locale === "ru" ? "на review" : "in review"}</small></span><span><BookOpenCheck size={17} /><b>{audit?.ledgerEntries.length ?? 0}</b><small>ledger entries</small></span></div>
            </section>
          </div>

          <section className="surface-card games-ops-card">
            <div className="section-heading"><div><span className="section-kicker">GAME ENGINE</span><h2>{locale === "ru" ? "Состояние пяти игр" : "Five-game health"}</h2></div><span className="quiet-badge">5 / 5</span></div>
            <div className="games-ops-table">
              <div className="table-head"><span>{locale === "ru" ? "Игра" : "Game"}</span><span>Target RTP</span><span>Recent RTP</span><span>{locale === "ru" ? "Раунды" : "Rounds"}</span><span>{locale === "ru" ? "Статус" : "Status"}</span></div>
              {gameStats.map((game) => <div className="table-row" key={game.id}><span><i className={`game-mini game-mini-${game.id}`}>{game.name[0]}</i><strong>{game.name}</strong></span><span>{game.rtp}</span><span>{game.rounds ? `${(game.rtpActual * 100).toFixed(1)}%` : "—"}</span><span>{game.rounds}</span><span><em className="status-online"><i /> LIVE</em></span></div>)}
            </div>
          </section>
        </>
      )}

      {tab === "withdrawals" && (
        <section className="surface-card withdrawal-review-card">
          <div className="section-heading"><div><span className="section-kicker">DUAL CONTROL</span><h2>{locale === "ru" ? "Ручная проверка выводов" : "Withdrawal review"}</h2></div><span className="quiet-badge">{dashboard?.pendingWithdrawals.length ?? 0}</span></div>
          {(dashboard?.pendingWithdrawals.length ?? 0) === 0 && <EmptyState icon={<Landmark size={20} />} title={locale === "ru" ? "Очередь пуста" : "Queue clear"} text={locale === "ru" ? "Все выводы обработаны." : "All withdrawals are processed."} />}
          <div className="withdrawal-list">{dashboard?.pendingWithdrawals.map((withdrawal) => <div key={withdrawal.id}><span className="wallet-avatar small"><CircleDollarSign size={18} /></span><span><strong>{withdrawal.userId}</strong><small>{formatDate(withdrawal.createdAt, locale)}</small></span><b>{formatMoney(withdrawal.amount)}</b><em>{locale === "ru" ? "Risk review" : "Risk review"}</em><button type="button" className="approve-button" onClick={() => runAction(() => api.post(`/api/admin/withdrawals/${withdrawal.id}/approve`, {}), loadDashboard)}><Check size={16} /></button><button type="button" className="reject-button" onClick={() => runAction(() => api.post(`/api/admin/withdrawals/${withdrawal.id}/reject`, { reason: "Manual compliance review rejected" }), loadDashboard)}><X size={16} /></button></div>)}</div>
        </section>
      )}

      {tab === "sandbox" && (
        <div className="sandbox-admin-grid">
          <section className="surface-card simulation-card">
            <div className="section-heading"><div><span className="section-kicker">SIMULATION RUNNER</span><h2>{locale === "ru" ? "Статистический прогон" : "Statistical run"}</h2></div><TestTube2 size={22} /></div>
            <label className="form-field"><span>{locale === "ru" ? "Игра" : "Game"}</span><select value={simGame} onChange={(event) => setSimGame(event.target.value as GameId)}>{gameCatalog.map((game) => <option key={game.id} value={game.id}>{game.name}</option>)}</select></label>
            <label className="form-field"><span>{locale === "ru" ? "Количество раундов" : "Rounds"}</span><select value={simRounds} onChange={(event) => setSimRounds(Number(event.target.value))}><option value={100}>100</option><option value={1000}>1 000</option><option value={5000}>5 000</option><option value={10000}>10 000</option></select></label>
            <button type="button" className="primary-button" onClick={() => runAction(() => api.post<{ report: SimulationReport }>("/api/sandbox/simulate", { gameId: simGame, rounds: simRounds }), ({ report: value }) => setReport(value))}><Activity size={18} /> {locale === "ru" ? "Запустить симуляцию" : "Run simulation"}</button>
          </section>
          <section className="surface-card simulation-report-card">
            <div className="section-heading"><div><span className="section-kicker">REPORT</span><h2>{report ? gameName(report.gameId) : (locale === "ru" ? "Результат прогона" : "Run result")}</h2></div>{report && <span className="quiet-badge">{report.rounds}</span>}</div>
            {!report ? <EmptyState icon={<BarChart3 size={20} />} title={locale === "ru" ? "Ожидает запуска" : "Awaiting a run"} text={locale === "ru" ? "Выберите игру и количество раундов." : "Choose a game and number of rounds."} /> : <div className="report-grid"><Metric label="Actual RTP" value={`${(report.actualRtp * 100).toFixed(2)}%`} /><Metric label={locale === "ru" ? "Поставлено" : "Wagered"} value={formatMoney(report.wagered)} /><Metric label={locale === "ru" ? "Выплачено" : "Paid"} value={formatMoney(report.paid)} /><Metric label={locale === "ru" ? "Результат казино" : "Casino result"} value={formatMoney(report.wagered - report.paid)} tone={report.wagered - report.paid >= 0 ? "positive" : "warning"} /><Metric label={locale === "ru" ? "Доля побед" : "Win rate"} value={`${(report.winRate * 100).toFixed(1)}%`} /></div>}
          </section>
          <section className="surface-card adjustment-card">
            <div className="section-heading"><div><span className="section-kicker">LEDGER CONTROL</span><h2>{locale === "ru" ? "Запрос корректировки" : "Adjustment request"}</h2></div><BookOpenCheck size={22} /></div>
            <p>{locale === "ru" ? "Создание заявки не меняет баланс. Утверждение выполняет другой Super Admin." : "Creating a request never changes a balance. A different Super Admin must approve it."}</p>
            <label className="form-field"><span>{locale === "ru" ? "Сумма" : "Amount"}</span><input type="number" min={0.01} max={1000} value={adjustmentAmount} onChange={(event) => setAdjustmentAmount(Number(event.target.value) || 0.01)} /></label>
            <label className="form-field"><span>{locale === "ru" ? "Причина" : "Reason"}</span><textarea rows={3} value={adjustmentReason} onChange={(event) => setAdjustmentReason(event.target.value)} placeholder={locale === "ru" ? "Минимум 10 символов, привязка к инциденту обязательна" : "At least 10 characters; incident reference is required"} /></label>
            <button type="button" className="secondary-button" disabled={adjustmentReason.trim().length < 10} onClick={() => runAction(() => api.post("/api/admin/ledger-adjustments", { targetUserId: "demo-player", amount: adjustmentAmount, direction: "credit", reason: adjustmentReason, incidentUrl: "https://github.com/elementalka/Web3/issues/1" }), () => setAdjustmentReason(""))}>{locale === "ru" ? "Создать заявку" : "Create request"}</button>
          </section>
        </div>
      )}

      {tab === "audit" && (
        <section className="surface-card audit-card">
          <div className="section-heading"><div><span className="section-kicker">APPEND ONLY</span><h2>{locale === "ru" ? "Неизменяемый audit log" : "Immutable audit log"}</h2></div><FileClock size={22} /></div>
          <div className="audit-list">{audit?.auditLogs.map((item) => <div key={item.id}><span className="audit-icon"><FileClock size={16} /></span><span><strong>{item.action.replaceAll("_", " ")}</strong><small>{item.actorUserId} · {item.target ?? "system"}</small></span><time>{formatDate(item.createdAt, locale)}</time></div>)}</div>
          {(audit?.auditLogs.length ?? 0) === 0 && <EmptyState icon={<FileClock size={20} />} title={locale === "ru" ? "Действий пока нет" : "No actions yet"} text={locale === "ru" ? "Каждое admin-действие появится здесь." : "Every admin action will appear here."} />}
        </section>
      )}
    </div>
  );
}
