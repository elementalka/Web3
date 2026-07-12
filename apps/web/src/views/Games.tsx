import { useMemo, useState } from "react";
import { Bomb, CircleDot, Gem, Play, RadioTower, Rocket, ShieldCheck, Sparkles, Waves } from "lucide-react";
import { formatMoney, gameCatalog, signals, type Locale } from "../catalog";
import { BetControls, GameFrame, ResultCard, type RunAction } from "../components/Shared";
import { createIdempotencyKey, type ApiClient, type Bet, type GameConfigResponse, type GameId, type MinesSession } from "../lib/api";

export function GameView({
  activeMines,
  api,
  busy,
  clientSeed,
  config,
  gameId,
  locale,
  onBack,
  onBet,
  onMinesSession,
  runAction,
  setClientSeed
}: {
  activeMines?: MinesSession;
  api: ApiClient;
  busy: boolean;
  clientSeed: string;
  config: GameConfigResponse;
  gameId: GameId;
  locale: Locale;
  onBack: () => void;
  onBet: (bet: Bet) => void;
  onMinesSession: (session?: MinesSession) => void;
  runAction: RunAction;
  setClientSeed: (value: string) => void;
}) {
  const game = gameCatalog.find((item) => item.id === gameId)!;
  const frameProps = { clientSeed, config: config.games[gameId], game, locale, onBack, setClientSeed };

  if (gameId === "dice") return <GameFrame {...frameProps}><DiceGame api={api} busy={busy} clientSeed={clientSeed} config={config} locale={locale} onBet={onBet} runAction={runAction} /></GameFrame>;
  if (gameId === "mines") return <GameFrame {...frameProps}><MinesGame active={activeMines} api={api} busy={busy} clientSeed={clientSeed} config={config} locale={locale} onBet={onBet} onSession={onMinesSession} runAction={runAction} /></GameFrame>;
  if (gameId === "plinko") return <GameFrame {...frameProps}><PlinkoGame api={api} busy={busy} clientSeed={clientSeed} config={config} locale={locale} onBet={onBet} runAction={runAction} /></GameFrame>;
  if (gameId === "orbit") return <GameFrame {...frameProps}><OrbitGame api={api} busy={busy} clientSeed={clientSeed} config={config} locale={locale} onBet={onBet} runAction={runAction} /></GameFrame>;
  return <GameFrame {...frameProps}><SignalGame api={api} busy={busy} clientSeed={clientSeed} config={config} locale={locale} onBet={onBet} runAction={runAction} /></GameFrame>;
}

interface GameProps {
  api: ApiClient;
  busy: boolean;
  clientSeed: string;
  config: GameConfigResponse;
  locale: Locale;
  onBet: (bet: Bet) => void;
  runAction: RunAction;
}

function DiceGame({ api, busy, clientSeed, config, locale, onBet, runAction }: GameProps) {
  const gameConfig = config.games.dice;
  const [betAmount, setBetAmount] = useState(0.05);
  const [chance, setChance] = useState(49.5);
  const [mode, setMode] = useState<"under" | "over">("under");
  const [result, setResult] = useState<Bet>();
  const rtp = config.risk.tier <= 1 ? gameConfig.rtpStarter : gameConfig.rtpNormal;
  const multiplier = rtp / (chance / 100);
  const disabled = busy || !gameConfig.limitPreview.available;

  return (
    <div className="game-controls-grid dice-controls">
      <div className="play-panel">
        <div className={`dice-display ${result ? (result.win ? "win" : "loss") : ""}`}>
          <span className="dice-value" key={result?.id}>{Number(result?.payload.roll ?? chance).toFixed(2)}</span>
          <span>{mode === "under" ? (locale === "ru" ? "Бросок меньше" : "Roll under") : (locale === "ru" ? "Бросок больше" : "Roll over")}</span>
          <i style={{ left: `${Number(result?.payload.roll ?? chance)}%` }} />
        </div>
        <div className="range-labels"><span>0</span><strong>{chance.toFixed(1)}</strong><span>100</span></div>
        <input
          aria-label={locale === "ru" ? "Шанс выигрыша" : "Win chance"}
          className="range-input"
          disabled={disabled}
          max={95}
          min={5}
          step={0.5}
          type="range"
          value={chance}
          onChange={(event) => setChance(Number(event.target.value))}
        />
        <div className="segmented-control">
          <button type="button" className={mode === "under" ? "active" : ""} disabled={disabled} onClick={() => setMode("under")}>{locale === "ru" ? "Меньше" : "Under"}</button>
          <button type="button" className={mode === "over" ? "active" : ""} disabled={disabled} onClick={() => setMode("over")}>{locale === "ru" ? "Больше" : "Over"}</button>
        </div>
      </div>
      <div className="wager-panel">
        <BetControls value={betAmount} setValue={setBetAmount} max={gameConfig.limitPreview.maxBet} disabled={disabled} locale={locale} />
        <div className="wager-summary">
          <span><small>{locale === "ru" ? "Шанс" : "Win chance"}</small><strong>{chance.toFixed(1)}%</strong></span>
          <span><small>{locale === "ru" ? "Множитель" : "Multiplier"}</small><strong>{multiplier.toFixed(2)}×</strong></span>
          <span><small>{locale === "ru" ? "Возможная выплата" : "Potential payout"}</small><strong>{formatMoney(betAmount * multiplier)}</strong></span>
        </div>
        <button type="button" className="primary-button bet-button" disabled={disabled} onClick={() => runAction(
          () => api.post<{ bet: Bet }>("/api/games/dice/bet", { idempotencyKey: createIdempotencyKey(), betAmount, chance, mode, clientSeed }),
          ({ bet }) => { setResult(bet); onBet(bet); }
        )}><Play size={19} /> {busy ? (locale === "ru" ? "Бросаем…" : "Rolling…") : (locale === "ru" ? "Сделать бросок" : "Roll dice")}</button>
        {result && <ResultCard bet={result} locale={locale} />}
      </div>
    </div>
  );
}

function MinesGame({ active, api, busy, clientSeed, config, locale, onBet, onSession, runAction }: GameProps & {
  active?: MinesSession;
  onSession: (session?: MinesSession) => void;
}) {
  const gameConfig = config.games.mines;
  const [betAmount, setBetAmount] = useState(0.05);
  const [minesCount, setMinesCount] = useState(3);
  const [result, setResult] = useState<Bet>();
  const opened = active?.openedCells ?? [];
  const disabled = busy || !gameConfig.limitPreview.available;
  const isActive = active?.status === "active";
  const nextApprox = Math.min(gameConfig.maxMultiplier, Math.max(1, (active?.currentMultiplier ?? 1) * (1 + minesCount / 24)));

  return (
    <div className="game-controls-grid mines-controls">
      <div className="play-panel mines-play-panel">
        <div className="mines-toolbar">
          <span><Gem size={17} /> <b>{25 - minesCount}</b> {locale === "ru" ? "кристаллов" : "gems"}</span>
          <span><Bomb size={17} /> <b>{minesCount}</b> {locale === "ru" ? "мин" : "mines"}</span>
        </div>
        <div className="mines-grid" aria-label={locale === "ru" ? "Поле Mines 5 на 5" : "5 by 5 Mines board"}>
          {Array.from({ length: 25 }, (_, cell) => {
            const revealed = opened.includes(cell);
            const mine = active?.minePositions.includes(cell);
            return (
              <button
                type="button"
                key={cell}
                aria-label={`${locale === "ru" ? "Клетка" : "Cell"} ${cell + 1}${revealed ? (mine ? ", mine" : ", safe") : ""}`}
                className={revealed ? (mine ? "mine" : "safe") : ""}
                disabled={!isActive || revealed || disabled}
                onClick={() => runAction(
                  () => api.post<{ session: MinesSession; bet?: Bet }>(`/api/games/mines/${active?.id}/reveal`, { cell }),
                  ({ session, bet }) => { onSession(session); if (bet) { setResult(bet); onBet(bet); } }
                )}
              >
                <span>{revealed ? (mine ? <Bomb size={18} /> : <Gem size={18} />) : <i />}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="wager-panel">
        {!isActive && (
          <>
            <label className="field-label"><span>{locale === "ru" ? "Количество мин" : "Number of mines"}</span></label>
            <div className="segmented-control four-items">
              {[3, 5, 8, 12].map((count) => <button type="button" key={count} className={minesCount === count ? "active" : ""} disabled={disabled} onClick={() => setMinesCount(count)}>{count}</button>)}
            </div>
            <BetControls value={betAmount} setValue={setBetAmount} max={gameConfig.limitPreview.maxBet} disabled={disabled} locale={locale} />
          </>
        )}
        <div className="wager-summary">
          <span><small>{locale === "ru" ? "Открыто" : "Opened"}</small><strong>{opened.length}</strong></span>
          <span><small>{locale === "ru" ? "Сейчас" : "Current"}</small><strong>{(active?.currentMultiplier ?? 1).toFixed(2)}×</strong></span>
          <span><small>{locale === "ru" ? "Следующий ~" : "Next ~"}</small><strong>{nextApprox.toFixed(2)}×</strong></span>
        </div>
        {!isActive ? (
          <button type="button" className="primary-button bet-button" disabled={disabled} onClick={() => runAction(
            () => api.post<{ session: MinesSession }>("/api/games/mines/start", { idempotencyKey: createIdempotencyKey(), betAmount, minesCount, clientSeed }),
            ({ session }) => { setResult(undefined); onSession(session); }
          )}><Play size={19} /> {locale === "ru" ? "Начать раунд" : "Start round"}</button>
        ) : (
          <button type="button" className="primary-button bet-button" disabled={disabled || opened.length === 0} onClick={() => runAction(
            () => api.post<{ bet: Bet; session: MinesSession }>(`/api/games/mines/${active.id}/cashout`, {}),
            ({ bet, session }) => { setResult(bet); onBet(bet); onSession(session); }
          )}><Gem size={19} /> {locale === "ru" ? "Забрать" : "Cash out"} {formatMoney(active.betAmount * active.currentMultiplier)}</button>
        )}
        {result && <ResultCard bet={result} locale={locale} />}
      </div>
    </div>
  );
}

function PlinkoGame({ api, busy, clientSeed, config, locale, onBet, runAction }: GameProps) {
  const gameConfig = config.games.plinko;
  const [betAmount, setBetAmount] = useState(0.05);
  const [riskMode, setRiskMode] = useState<"low" | "medium" | "high">("low");
  const [result, setResult] = useState<Bet>();
  const highLocked = config.risk.availableRiskBank < 1000;
  const disabled = busy || !gameConfig.limitPreview.available || (riskMode === "high" && highLocked);
  const multipliers = riskMode === "low" ? [2, 1.45, 1.15, .95, .68, .95, 1.15, 1.45, 2]
    : riskMode === "medium" ? [5, 2, 1.3, .75, .67, .75, 1.3, 2, 5]
      : [25, 3, 1.15, .68, .1, .68, 1.15, 3, 25];

  return (
    <div className="game-controls-grid plinko-controls">
      <div className="play-panel plinko-play-panel">
        <div className="plinko-board">
          <span className={`plinko-ball ${result ? "dropped" : ""}`} key={result?.id} style={{ "--bucket": Number(result?.payload.bucketIndex ?? 4) } as React.CSSProperties} />
          {Array.from({ length: 36 }, (_, index) => <i key={index} />)}
        </div>
        <div className="bucket-row">
          {multipliers.map((multiplier, index) => <span key={index} className={index === result?.payload.bucketIndex ? "hit" : ""}>{multiplier}×</span>)}
        </div>
      </div>
      <div className="wager-panel">
        <label className="field-label"><span>{locale === "ru" ? "Режим риска" : "Risk mode"}</span></label>
        <div className="segmented-control">
          {(["low", "medium", "high"] as const).map((mode) => (
            <button type="button" key={mode} className={riskMode === mode ? "active" : ""} disabled={busy || (mode === "high" && highLocked)} onClick={() => setRiskMode(mode)}>
              {mode === "low" ? (locale === "ru" ? "Низкий" : "Low") : mode === "medium" ? (locale === "ru" ? "Средний" : "Medium") : (locale === "ru" ? "Высокий" : "High")}
            </button>
          ))}
        </div>
        {highLocked && <p className="field-hint"><ShieldCheck size={14} /> {locale === "ru" ? "High откроется при risk bank от 1 000 USDC" : "High unlocks at a 1,000 USDC risk bank"}</p>}
        <BetControls value={betAmount} setValue={setBetAmount} max={gameConfig.limitPreview.maxBet} disabled={disabled} locale={locale} />
        <div className="wager-summary">
          <span><small>{locale === "ru" ? "Рядов" : "Rows"}</small><strong>8</strong></span>
          <span><small>{locale === "ru" ? "Ячеек" : "Buckets"}</small><strong>9</strong></span>
          <span><small>{locale === "ru" ? "Макс. множитель" : "Top multiplier"}</small><strong>{Math.max(...multipliers)}×</strong></span>
        </div>
        <button type="button" className="primary-button bet-button" disabled={disabled} onClick={() => runAction(
          () => api.post<{ bet: Bet }>("/api/games/plinko/drop", { idempotencyKey: createIdempotencyKey(), betAmount, riskMode, clientSeed }),
          ({ bet }) => { setResult(bet); onBet(bet); }
        )}><Waves size={19} /> {busy ? (locale === "ru" ? "Падение…" : "Dropping…") : (locale === "ru" ? "Бросить шар" : "Drop ball")}</button>
        {result && <ResultCard bet={result} locale={locale} />}
      </div>
    </div>
  );
}

function OrbitGame({ api, busy, clientSeed, config, locale, onBet, runAction }: GameProps) {
  const gameConfig = config.games.orbit;
  const [betAmount, setBetAmount] = useState(0.05);
  const [selectedOrbit, setSelectedOrbit] = useState(2);
  const [result, setResult] = useState<Bet>();
  const disabled = busy || !gameConfig.limitPreview.available;
  return (
    <div className="game-controls-grid orbit-controls">
      <div className="play-panel orbit-play-panel">
        <div className={`orbit-field ${busy ? "launching" : ""} ${result?.win ? "win" : ""}`}>
          {[0, 1, 2, 3, 4].map((ring) => (
            <button
              type="button"
              key={ring}
              aria-label={`${locale === "ru" ? "Выбрать орбиту" : "Select orbit"} ${ring + 1}`}
              className={selectedOrbit === ring ? "selected" : ""}
              disabled={disabled}
              onClick={() => setSelectedOrbit(ring)}
              style={{ inset: `${ring * 7 + 6}%` }}
            ><span>{ring + 1}</span></button>
          ))}
          <span className="orbit-core"><i /><Sparkles size={24} /><strong>{(result?.payload.outcomeType as string | undefined) ?? `${gameConfig.maxMultiplier}×`}</strong></span>
          <b className="orbit-pulse" />
        </div>
      </div>
      <div className="wager-panel">
        <label className="field-label"><span>{locale === "ru" ? "Выбранная орбита" : "Selected orbit"}</span><b>0{selectedOrbit + 1}</b></label>
        <BetControls value={betAmount} setValue={setBetAmount} max={gameConfig.limitPreview.maxBet} disabled={disabled} locale={locale} />
        <div className="wager-summary">
          <span><small>{locale === "ru" ? "Исходы" : "Outcomes"}</small><strong>0× · 2× · 5×{gameConfig.maxMultiplier >= 10 ? " · 10×" : ""}</strong></span>
          <span><small>{locale === "ru" ? "Макс. импульс" : "Max impulse"}</small><strong>{gameConfig.maxMultiplier}×</strong></span>
        </div>
        <button type="button" className="primary-button bet-button" disabled={disabled} onClick={() => runAction(
          () => api.post<{ bet: Bet }>("/api/games/orbit/bet", { idempotencyKey: createIdempotencyKey(), betAmount, selectedOrbit, clientSeed }),
          ({ bet }) => { setResult(bet); onBet(bet); }
        )}><Rocket size={19} /> {busy ? (locale === "ru" ? "Запуск…" : "Launching…") : (locale === "ru" ? "Запустить импульс" : "Launch impulse")}</button>
        {result && <ResultCard bet={result} locale={locale} />}
      </div>
    </div>
  );
}

function SignalGame({ api, busy, clientSeed, config, locale, onBet, runAction }: GameProps) {
  const gameConfig = config.games.signal;
  const [betAmount, setBetAmount] = useState(0.05);
  const [selectedSignal, setSelectedSignal] = useState<typeof signals[number]>("Alpha");
  const [result, setResult] = useState<Bet>();
  const disabled = busy || !gameConfig.limitPreview.available;
  const signalIndex = useMemo(() => signals.indexOf(selectedSignal), [selectedSignal]);
  return (
    <div className="game-controls-grid signal-controls">
      <div className="play-panel signal-play-panel">
        <div className={`radar-screen ${busy ? "scanning" : ""} ${result?.win ? "win" : ""}`}>
          <span className="radar-grid" /><span className="radar-sweep" />
          {signals.map((signal, index) => <i key={signal} className={(result?.payload.winningSignal ?? selectedSignal) === signal ? "active" : ""} style={{ "--signal-index": index } as React.CSSProperties}><b>{signal.slice(0, 1)}</b></i>)}
          <strong><small>{busy ? (locale === "ru" ? "СКАНИРОВАНИЕ" : "SCANNING") : (locale === "ru" ? "СИГНАЛ" : "SIGNAL")}</small>{(result?.payload.winningSignal as string | undefined) ?? selectedSignal}</strong>
        </div>
        <div className="signal-selector">
          {signals.map((signal, index) => <button type="button" key={signal} className={signalIndex === index ? "active" : ""} disabled={disabled} onClick={() => setSelectedSignal(signal)}><CircleDot size={14} />{signal}</button>)}
        </div>
      </div>
      <div className="wager-panel">
        <BetControls value={betAmount} setValue={setBetAmount} max={gameConfig.limitPreview.maxBet} disabled={disabled} locale={locale} />
        <div className="wager-summary">
          <span><small>{locale === "ru" ? "Вероятность" : "Probability"}</small><strong>20%</strong></span>
          <span><small>{locale === "ru" ? "Множитель" : "Multiplier"}</small><strong>4.80×</strong></span>
          <span><small>{locale === "ru" ? "Возможная выплата" : "Potential payout"}</small><strong>{formatMoney(betAmount * 4.8)}</strong></span>
        </div>
        <button type="button" className="primary-button bet-button" disabled={disabled} onClick={() => runAction(
          () => api.post<{ bet: Bet }>("/api/games/signal/bet", { idempotencyKey: createIdempotencyKey(), betAmount, selectedSignal, clientSeed }),
          ({ bet }) => { setResult(bet); onBet(bet); }
        )}><RadioTower size={19} /> {busy ? (locale === "ru" ? "Ищем сигнал…" : "Scanning…") : (locale === "ru" ? "Поймать сигнал" : "Catch signal")}</button>
        {result && <ResultCard bet={result} locale={locale} />}
      </div>
    </div>
  );
}
