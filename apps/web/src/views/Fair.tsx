import { useMemo, useState } from "react";
import { BadgeCheck, Braces, Check, Clipboard, Eye, EyeOff, Fingerprint, Hash, KeyRound, RefreshCw, ShieldCheck, X } from "lucide-react";
import { formatDate, gameName, type Locale } from "../catalog";
import { EmptyState, type RunAction } from "../components/Shared";
import type { ApiClient, Bet, GameConfigResponse } from "../lib/api";

export function FairView({ api, config, history, locale, runAction }: {
  api: ApiClient;
  config?: GameConfigResponse;
  history: Bet[];
  locale: Locale;
  runAction: RunAction;
}) {
  const [selectedBetId, setSelectedBetId] = useState(history[0]?.id ?? "");
  const [verification, setVerification] = useState<{ valid: boolean; text: string }>();
  const [showSeed, setShowSeed] = useState(false);
  const selectedBet = history.find((bet) => bet.id === selectedBetId) ?? history[0];
  const proof = selectedBet?.proof;
  const revealed = useMemo(() => config?.revealedSeeds.find((seed) => seed.id === proof?.serverSeedId), [config?.revealedSeeds, proof?.serverSeedId]);

  const verify = () => {
    if (!proof || !revealed || !selectedBet) return;
    runAction(
      () => api.get<{ valid: boolean; commitmentValid: boolean; outcomeValid: boolean; algorithm: string }>(`/api/provably-fair/bets/${selectedBet.id}/verify`),
      (result) => {
        const valid = result.valid && result.commitmentValid && result.outcomeValid;
        setVerification({ valid, text: valid
          ? (locale === "ru" ? "Seed commitment, HMAC и сохраненный игровой исход полностью совпадают." : "The seed commitment, HMAC, and recorded game outcome all match.")
          : (locale === "ru" ? "Commitment или игровой исход не совпал. Не используйте этот раунд как валидный." : "The commitment or outcome mismatched. Do not treat this round as valid.") });
      }
    );
  };

  return (
    <div className="page-stack fair-page">
      <section className="fair-hero">
        <div>
          <span className="hero-pill"><ShieldCheck size={16} /> PROVABLY FAIR</span>
          <h1>{locale === "ru" ? <>Проверяйте каждый<br /><em>бит результата.</em></> : <>Verify every<br /><em>bit of the outcome.</em></>}</h1>
          <p>{locale === "ru" ? "Мы фиксируем server seed до раунда и раскрываем его после безопасной ротации. Вы можете пересчитать криптографическое доказательство самостоятельно." : "We commit to a server seed before the round and reveal it after a safe rotation, so you can independently recalculate the cryptographic proof."}</p>
        </div>
        <div className="fair-seal" aria-hidden="true"><span><i /><i /><ShieldCheck /></span><b>SHA<br />256</b></div>
      </section>

      <section className="fair-steps">
        <Step number="01" icon={<Hash />} title={locale === "ru" ? "Commit" : "Commit"} text={locale === "ru" ? "До ставки публикуется SHA-256 hash секретного server seed." : "A SHA-256 hash of the secret server seed is published before the bet."} />
        <Step number="02" icon={<Fingerprint />} title={locale === "ru" ? "Combine" : "Combine"} text={locale === "ru" ? "Client seed, nonce и ID игры формируют уникальное сообщение." : "Client seed, nonce, and game ID form a unique message."} />
        <Step number="03" icon={<KeyRound />} title={locale === "ru" ? "Reveal" : "Reveal"} text={locale === "ru" ? "После ротации seed раскрывается, а proof можно пересчитать." : "After rotation, the seed is revealed and the proof can be recalculated."} />
      </section>

      <div className="fair-layout">
        <section className="surface-card verifier-card">
          <div className="section-heading">
            <div><span className="section-kicker">{locale === "ru" ? "Проверка раунда" : "Round verifier"}</span><h2>{locale === "ru" ? "Криптографическое доказательство" : "Cryptographic proof"}</h2></div>
            <BadgeCheck size={23} />
          </div>
          {history.length === 0 ? (
            <EmptyState icon={<Fingerprint size={20} />} title={locale === "ru" ? "Сначала сыграйте раунд" : "Play a round first"} text={locale === "ru" ? "Его proof появится в этом verifier." : "Its proof will appear in this verifier."} />
          ) : (
            <>
              <label className="form-field">
                <span>{locale === "ru" ? "Раунд" : "Round"}</span>
                <select value={selectedBet?.id} onChange={(event) => { setSelectedBetId(event.target.value); setVerification(undefined); }}>
                  {history.map((bet) => <option key={bet.id} value={bet.id}>{gameName(bet.gameId)} · {bet.multiplier.toFixed(2)}× · {formatDate(bet.createdAt, locale)}</option>)}
                </select>
              </label>
              <div className="proof-grid">
                <ProofField label="Server seed hash" value={proof?.serverSeedHash ?? "—"} />
                <ProofField label="Client seed" value={proof?.clientSeed ?? "—"} />
                <ProofField label="Nonce" value={String(proof?.nonce ?? "—")} />
                <ProofField label="Game" value={proof ? gameName(proof.gameId) : "—"} />
                <ProofField label="HMAC proof" value={proof?.hmac ?? "—"} wide />
                <div className="proof-field wide">
                  <span>Server seed</span>
                  <code>{revealed ? (showSeed ? revealed.seed : "•".repeat(42)) : (locale === "ru" ? "Ожидает безопасной ротации" : "Awaiting safe rotation")}</code>
                  {revealed && <button type="button" onClick={() => setShowSeed(!showSeed)} aria-label={showSeed ? "Hide seed" : "Show seed"}>{showSeed ? <EyeOff size={15} /> : <Eye size={15} />}</button>}
                </div>
              </div>
              {!revealed && <div className="inline-alert"><KeyRound size={17} /> {locale === "ru" ? "Активный seed пока скрыт. Ротация запрещена, если есть незавершенный Mines-раунд." : "The active seed is still hidden. Rotation is blocked while a Mines round is active."}</div>}
              {verification && <div className={`verification-result ${verification.valid ? "valid" : "invalid"}`}>{verification.valid ? <Check size={20} /> : <X size={20} />}<span><strong>{verification.valid ? (locale === "ru" ? "Доказательство валидно" : "Proof valid") : (locale === "ru" ? "Ошибка проверки" : "Verification failed")}</strong><small>{verification.text}</small></span></div>}
              <div className="verifier-actions">
                <button type="button" className="primary-button" disabled={!revealed} onClick={verify}><ShieldCheck size={18} /> {locale === "ru" ? "Проверить proof" : "Verify proof"}</button>
                <button type="button" className="secondary-button" disabled={!proof} onClick={() => navigator.clipboard?.writeText(JSON.stringify({ proof, serverSeed: revealed?.seed }, null, 2))}><Clipboard size={17} /> {locale === "ru" ? "Копировать JSON" : "Copy JSON"}</button>
              </div>
            </>
          )}
        </section>

        <aside className="fair-aside">
          <section className="surface-card active-seed-card">
            <span className="section-kicker">{locale === "ru" ? "Активный commitment" : "Active commitment"}</span>
            <h2>{locale === "ru" ? "Текущий seed hash" : "Current seed hash"}</h2>
            <code>{config?.serverSeedHash ?? "loading"}</code>
            <button type="button" className="secondary-button" onClick={() => runAction(() => api.post("/api/provably-fair/rotate", {}), () => setVerification(undefined))}><RefreshCw size={17} /> {locale === "ru" ? "Безопасно ротировать" : "Rotate safely"}</button>
            <p>{locale === "ru" ? "Ротация раскрывает предыдущий seed только после проверки незавершенных сессий." : "Rotation reveals the previous seed only after unresolved sessions are checked."}</p>
          </section>
          <section className="surface-card algorithm-card">
            <span className="section-kicker">{locale === "ru" ? "Публичный алгоритм" : "Public algorithm"}</span>
            <h2><Braces size={19} /> HMAC-SHA256</h2>
            <pre><code>{`message = clientSeed
 ":" + nonce
 ":" + gameId

commitment = HMAC_SHA256(
  serverSeed, message
)

outcome = HMAC_SHA256(
  serverSeed,
  message + ":" + salt
)`}</code></pre>
          </section>
        </aside>
      </div>

      <section className="surface-card revealed-list-card">
        <div className="section-heading"><div><span className="section-kicker">{locale === "ru" ? "Архив" : "Archive"}</span><h2>{locale === "ru" ? "Раскрытые seeds" : "Revealed seeds"}</h2></div><span className="quiet-badge">{config?.revealedSeeds.length ?? 0}</span></div>
        {(config?.revealedSeeds.length ?? 0) === 0 && <EmptyState icon={<KeyRound size={20} />} title={locale === "ru" ? "Архив пуст" : "Archive empty"} text={locale === "ru" ? "Первый seed появится после безопасной ротации." : "The first seed appears after a safe rotation."} />}
        <div className="revealed-seed-list">{config?.revealedSeeds.map((seed) => <div key={seed.id}><span><strong>{seed.hash.slice(0, 18)}…{seed.hash.slice(-8)}</strong><small>{formatDate(seed.revealedAt, locale)}</small></span><code>{seed.seed.slice(0, 18)}…</code><button type="button" onClick={() => navigator.clipboard?.writeText(seed.seed)} aria-label="Copy seed"><Clipboard size={15} /></button></div>)}</div>
      </section>
    </div>
  );
}

function Step({ icon, number, text, title }: { icon: React.ReactNode; number: string; text: string; title: string }) {
  return <div><span>{icon}</span><small>{number}</small><strong>{title}</strong><p>{text}</p></div>;
}

function ProofField({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return <div className={`proof-field ${wide ? "wide" : ""}`}><span>{label}</span><code title={value}>{value}</code><button type="button" onClick={() => navigator.clipboard?.writeText(value)} aria-label={`Copy ${label}`}><Clipboard size={15} /></button></div>;
}
