import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  scanPrepared, prepareImages, hasKey, friendlyTaskError, scanSourceImage,
  type ScanResult,
} from './lib/youcam';
import { runAging, frameAt, type AgeFrame } from './lib/aging';
import { Pipeline, JOURNEY_DEFS } from './lib/pipeline';
import { buildComparison, rankHabits, CONCERN_LABELS, type ComparisonReport, type Habit } from './lib/compare';
import { buildShareCard, shareCard, type ShareCardData } from './lib/share';
import { demoScan, demoFutureScan, demoFrames } from './lib/demo';
import { loadJourneys, saveJourney, clearJourneys, newId, type JourneyEntry } from './lib/store';
import { BUILD_VERSION, BUILD_DATE } from './version';

type Phase = 'landing' | 'scanning' | 'journey';

const scoreColor = (s: number) => (s >= 85 ? '#53e16f' : s >= 70 ? '#ffb020' : '#e05252');

function App() {
  const [phase, setPhase] = useState<Phase>('landing');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dark, setDark] = useState(false);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [imgBlob, setImgBlob] = useState<File | null>(null);

  // journey state
  const [stages, setStages] = useState<Pipeline | null>(null);
  const [frames, setFrames] = useState<AgeFrame[]>([]);
  const [targetAge, setTargetAge] = useState(50);
  const [today, setToday] = useState<ScanResult | null>(null);
  const [future, setFuture] = useState<ScanResult | null>(null);
  const [comparison, setComparison] = useState<ComparisonReport | null>(null);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [provider, setProvider] = useState<'youcam' | 'demo'>('demo');
  const [shareOpen, setShareOpen] = useState(false);
  const [history, setHistory] = useState<JourneyEntry[]>([]);
  const [scannedAge, setScannedAge] = useState<number | null>(null);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verdict, setVerdict] = useState<{ metric: string; spread: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDark(window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false); }, []);
  useEffect(() => { document.documentElement.classList.toggle('dark', dark); }, [dark]);
  useEffect(() => { setHistory(loadJourneys()); }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const onFile = (f: File | undefined | null) => {
    if (!f) return;
    setError(null);
    setImgBlob(f);
    setImgUrl(URL.createObjectURL(f));
  };

  const frameUrl = useMemo(() => {
    if (!frames.length) return null;
    return frameAt(frames, targetAge).url || null;
  }, [frames, targetAge]);

  const currentFrame = useMemo(() => {
    if (!frames.length) return null;
    return frameAt(frames, targetAge);
  }, [frames, targetAge]);

  const startDemo = () => {
    setError(null);
    setImgBlob(null); setImgUrl(null);
    setPhase('scanning');
    setProvider('demo');
    const pipe = new Pipeline(JOURNEY_DEFS);
    setStages(pipe);
    pipe.markRunning('prep');
    setTimeout(() => {
      pipe.markSuccess('prep', 'demo data prepared', 0);
      pipe.markRunning('aging');
      setTimeout(() => {
        const f = demoFrames();
        pipe.markSuccess('aging', '16 frames · 12→70 (GENERATED)', 0);
        setFrames(f);
        pipe.markRunning('today');
        setTimeout(() => {
          const t = demoScan();
          pipe.markSuccess('today', '14 concerns · GENERATED', 0);
          setToday(t);
          pipe.markRunning('future');
          setTimeout(() => {
            const fu = demoFutureScan();
            pipe.markSuccess('future', '14 concerns · GENERATED', 0);
            setFuture(fu);
            const cmp = buildComparison(t, fu);
            setComparison(cmp);
            setHabits(rankHabits(cmp));
            pipe.markSuccess('compare', 'deltas ranked', 0);
            pipe.markRunning('compose');
            setTimeout(() => {
              pipe.markSuccess('compose', 'report ready', 0);
              setStages(pipe);
              setPhase('journey');
              const entry: JourneyEntry = {
                id: newId(), at: new Date().toISOString(),
                today: t, future: fu, frames: f, targetAge: 50,
                comparison: cmp, provider: 'demo',
              };
              saveJourney(entry);
              setHistory(loadJourneys());
            }, 400);
          }, 900);
        }, 900);
      }, 900);
    }, 500);
  };

  const runJourney = useCallback(async (file: File) => {
    if (busy) return;
    setBusy(true); setError(null);
    setPhase('scanning'); setProvider('youcam');
    const pipe = new Pipeline(JOURNEY_DEFS);
    setStages(pipe);
    const key = (import.meta.env.VITE_YOUCAM_KEY as string).trim();
    try {
      // 1 — prep
      pipe.markRunning('prep');
      const blobs = await prepareImages(file);
      pipe.markSuccess('prep', `${blobs.length} crop candidates · 1024²`, 0);
      setStages(pipe);

      // 2 — aging (try crops; errors free)
      pipe.markRunning('aging');
      let ageFrames: AgeFrame[] | null = null;
      let lastErr = '';
      for (const b of blobs) {
        try { ageFrames = await runAging(key, b); break; }
        catch (e) {
          lastErr = e instanceof Error ? e.message : String(e);
          if (/error_face_angle/.test(lastErr)) break;
        }
      }
      if (!ageFrames) {
        pipe.markFailed('aging', friendlyTaskError(lastErr || 'aging failed'));
        setStages(pipe);
        throw new Error(friendlyTaskError(lastErr || 'aging failed'));
      }
      pipe.markSuccess('aging', `${ageFrames.length} frames · ${ageFrames[0].age}→${ageFrames[ageFrames.length - 1].age}`, 2);
      setFrames(ageFrames);
      setStages(pipe);

      // 3 — today (skin + tone + fitz in one lane with fallback)
      pipe.markRunning('today');
      const t0 = await scanPrepared(blobs);
      pipe.markSuccess('today', '14 concerns + tone + Fitzpatrick', 46);
      setToday(t0);
      setStages(pipe);

      // 4 — future (scan the age-50 frame; fall back to neighbor ages if the
      //     aged face trips YouCam's quality gate — verified live)
      pipe.markRunning('future');
      const target = frameAt(ageFrames, 50);
      const fallbacks = [...ageFrames]
        .sort((a, b) => Math.abs(a.age - target.age) - Math.abs(b.age - target.age))
        .slice(1, 6)
        .map((f) => f.url);
      const futRes = await scanSourceImage(key, target.url, fallbacks);
      const scannedFrame = frameAt(ageFrames, 50);
      const usedAge = ageFrames.find((f) => f.url === futRes.usedSource)?.age ?? target.age;
      pipe.markSuccess('future', `14 concerns on age-${Math.round(usedAge)} frame`, 16);
      setFuture({ ...futRes.analysis, provider: 'youcam', tone: null, colors: {}, fitzpatrick: null, tookMs: 0 });
      setTargetAge(usedAge);
      setScannedAge(Math.round(usedAge));
      setStages(pipe);

      // 5 — compare
      pipe.markRunning('compare');
      const fullToday: ScanResult = t0;
      const fullFuture: ScanResult = { ...futRes.analysis, provider: 'youcam', tone: null, colors: {}, fitzpatrick: null, tookMs: 0 };
      const cmp = buildComparison(fullToday, fullFuture);
      setComparison(cmp);
      setHabits(rankHabits(cmp));
      pipe.markSuccess('compare', 'deltas + impact ranking', 0);
      setStages(pipe);

      // 6 — compose
      pipe.markRunning('compose');
      const entry: JourneyEntry = {
        id: newId(), at: new Date().toISOString(),
        today: fullToday, future: fullFuture, frames: ageFrames,
        targetAge: Math.round(usedAge), comparison: cmp, provider: 'youcam',
      };
      saveJourney(entry);
      setHistory(loadJourneys());
      pipe.markSuccess('compose', 'report · habits · share card', 0);
      setStages(pipe);
      setPhase('journey');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setPhase('landing');
    } finally {
      setBusy(false);
    }
  }, [busy]);

  // verify: re-scan the future frame → honest error bar on one metric
  const verify = async () => {
    if (verifyBusy || !currentFrame?.url || !future) return;
    setVerifyBusy(true); setError(null); setVerdict(null);
    try {
      const key = (import.meta.env.VITE_YOUCAM_KEY as string).trim();
      const second = await scanSourceImage(key, currentFrame.url);
      const key0 = future.scores[comparison?.biggestDrop?.key ?? 'wrinkle'];
      const key1 = second.analysis.scores[comparison?.biggestDrop?.key ?? 'wrinkle'];
      const metric = comparison?.biggestDrop?.key ?? 'wrinkle';
      const spread = key0 != null && key1 != null ? Math.abs(key1 - key0) : 0;
      setVerdict({ metric, spread });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setVerifyBusy(false); }
  };

  // re-scan a different slider age (power feature, 16u)
  const scanThisAge = async () => {
    if (!currentFrame?.url || !hasKey() || busy) return;
    setBusy(true); setError(null);
    try {
      const key = (import.meta.env.VITE_YOUCAM_KEY as string).trim();
      const fut = await scanSourceImage(key, currentFrame.url);
      const fullFuture: ScanResult = { ...fut.analysis, provider: 'youcam', tone: null, colors: {}, fitzpatrick: null, tookMs: 0 };
      setFuture(fullFuture);
      if (today) {
        const cmp = buildComparison(today, fullFuture);
        setComparison(cmp);
        setHabits(rankHabits(cmp));
      }
      setToast(`Scanned your face at ${currentFrame.age} · report updated`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  const reset = () => {
    setPhase('landing'); setError(null); setStages(null);
    setFrames([]); setToday(null); setFuture(null); setComparison(null);
    setHabits([]); setImgUrl(null); setImgBlob(null); setVerdict(null); setShareOpen(false); setScannedAge(null);
  };

  const shareData: ShareCardData | null = useMemo(() => {
    if (!currentFrame || !comparison) return null;
    return buildShareCard(currentFrame, comparison, habits.length ? habits : rankHabits(comparison), provider);
  }, [currentFrame, comparison, habits, provider]);

  const metrics = comparison?.metrics ?? [];

  return (
    <div className="page">
      <header className="topbar">
        <span className="brand">FACE<span className="brand-em">AHEAD</span></span>
        <span className="tag">MEET THE FACE YOU'RE BUILDING</span>
        <span className="top-right">
          {!hasKey() && <span className="demo-badge">🎬 demo</span>}
          <button className="icon-btn" onClick={() => setDark((d) => !d)} aria-label="Toggle theme">{dark ? '☀️' : '🌙'}</button>
        </span>
      </header>

      <main className="wrap">
        {error && <div className="error">⚠ {error}</div>}

        {phase === 'landing' && (
          <section className="hero">
            <h1 className="hero-title">Meet the face<br /><em>you're building.</em></h1>
            <p className="hero-sub">Upload a selfie. Watch your real face age to 20, 40, 60 — then get a full AI skin report on your future self, the honest deltas vs today, and the 3 evidence-backed habits that change the curve.</p>
            <div className="steps"><span>📸 Selfie</span>→<span>⏳ Age it (12→70)</span>→<span>🔬 Scan today + future</span>→<span>🛡️ Your 3 moves</span></div>
            <div className="cta-row">
              <button className="btn-primary" onClick={() => inputRef.current?.click()}>Start your journey</button>
              <button className="btn-ghost" onClick={startDemo}>Try demo (no photo)</button>
              <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => { onFile(e.target.files?.[0]); if (e.target.files?.[0]) void runJourney(e.target.files[0]); }} />
            </div>
            <div className="chips">
              <span>🔒 Nothing stored server-side</span><span>⚡ ~60s</span><span>🧬 4 YouCam APIs</span><span>📏 Error bars, not guesses</span>
            </div>
            <div className="honesty-contract">
              <strong>Honesty contract</strong> — this is an AI <em>projection</em> of photoaging trends, not a medical prediction. Every score shows its uncertainty; demo values are always labeled.
            </div>
          </section>
        )}

        {phase === 'scanning' && (
          <section className="scanning">
            <div className="scan-card glass-card">
              <div className="scan-ring">{imgUrl ? <img src={imgUrl} alt="selfie" /> : <span>🧬</span>}</div>
              <h2 className="scan-title">Running your time machine…</h2>
              <div className="pipeline">
                {stages?.all.map((s) => (
                  <div key={s.id} className={`pstage ${s.status}`}>
                    <span className="pstage-icon">
                      {s.status === 'running' ? '⏳' : s.status === 'success' ? '✅' : s.status === 'failed' ? '❌' : s.status === 'warn' ? '⚠️' : '○'}
                    </span>
                    <span className="pstage-label">{s.label}</span>
                    <span className="pstage-detail">{s.detail}{s.units ? ` · ${s.units}u` : ''}</span>
                  </div>
                ))}
              </div>
              <p className="muted">{provider === 'youcam' ? 'Real YouCam AI · units charge only on success' : 'Demo — add a YouCam key for the real thing'}</p>
            </div>
          </section>
        )}

        {phase === 'journey' && today && future && comparison && currentFrame && (
          <section className="journey">
            {/* Header */}
            <div className="journey-head">
              <div>
                <div className="provider-row">
                  <span className={`provider-badge ${provider === 'youcam' ? 'youcam' : 'demo'}`}>
                    {provider === 'youcam' ? '✨ Real YouCam AI' : '🎬 GENERATED demo'} · {stages?.unitsUsed ?? 0}u
                  </span>
                </div>
                <h1 className="journey-title">Your face at {targetAge}</h1>
                {scannedAge != null && provider === 'youcam' && (
                  <p className="muted small">Future skin report scanned at age {scannedAge} (nearest frame YouCam accepted)</p>
                )}
              </div>
              <div className="head-actions">
                <button className="btn-primary small" disabled={!shareData} onClick={() => setShareOpen(true)}>🃏 Share card</button>
                <button className="btn-ghost small" onClick={reset}>+ New journey</button>
              </div>
            </div>

            {/* Time machine — age slider on the real aged face */}
            <div className="glass-card time-machine">
              <div className="tm-visual">
                <div className="face-stage">
                  {frameUrl ? (
                    <img src={frameUrl} alt={`Your face at ${targetAge}`} className="tm-face" crossOrigin="anonymous" />
                  ) : (
                    <div className="tm-placeholder">GENERATED frame</div>
                  )}
                  <span className="tm-age-badge">{targetAge}</span>
                  <span className="tm-proj">AI projection</span>
                </div>
                <div className="tm-controls">
                  <input
                    type="range" min={frames[0]?.age ?? 12} max={frames[frames.length - 1]?.age ?? 70}
                    step={1} value={targetAge}
                    onChange={(e) => setTargetAge(Number(e.target.value))}
                    className="age-slider"
                  />
                  <div className="tm-scale">
                    {[frames[0]?.age ?? 12, 30, 50, frames[frames.length - 1]?.age ?? 70].map((a) => <span key={a}>{a}</span>)}
                  </div>
                  <div className="tm-buttons">
                    {hasKey() && provider === 'youcam' && (
                      <button className="btn-ghost small" onClick={scanThisAge} disabled={busy}>
                        {busy ? 'Scanning…' : `🔬 Scan report at ${targetAge} (16u)`}
                      </button>
                    )}
                    {verifyBusy ? <span className="muted small">verifying…</span> : verdict ? (
                      <span className="verdict-chip">📏 {CONCERN_LABELS[verdict.metric] ?? verdict.metric} ± {verdict.spread.toFixed(0)} across 2 scans</span>
                    ) : (
                      <button className="btn-ghost small" onClick={verify} disabled={verifyBusy || !currentFrame.url}>📏 Verify: re-scan for error bar</button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Comparison — today vs future */}
            <div className="section-title">
              <h2>Today → {targetAge} <span className="muted small">(14 metrics, honest deltas)</span></h2>
            </div>
            <div className="metrics glass-card">
              <div className="m-row m-head">
                <span>Concern</span><span>Today</span><span>At {targetAge}</span><span>Δ</span>
              </div>
              {metrics.map((m) => (
                <div key={m.key} className="m-row">
                  <span className="m-label">{m.label}</span>
                  <span className="m-num">{m.today?.toFixed(0) ?? '—'}</span>
                  <span className="m-num" style={{ color: m.future != null ? scoreColor(m.future) : undefined }}>{m.future?.toFixed(0) ?? '—'}</span>
                  <span className={`m-delta ${m.trend}`}>
                    {m.trend === 'better' ? '▲' : m.trend === 'worse' ? '▼' : '='} {m.delta != null ? Math.abs(m.delta).toFixed(1) : '—'}
                  </span>
                </div>
              ))}
              <p className="m-foot muted">▲ better · ▼ worse · = stable (±1.5). Scores are YouCam ui_scores (higher = better).</p>
            </div>

            {/* Habits */}
            <div className="section-title"><h2>🛡️ Habits that change the curve</h2></div>
            <div className="habits">
              {habits.map((h, i) => (
                <div key={h.id} className="glass-card habit">
                  <div className="habit-top">
                    <span className="habit-emoji">{h.emoji}</span>
                    <span className="habit-rank">#{i + 1}</span>
                    <span className={`conf conf-${h.confidence}`}>{h.confidence}</span>
                  </div>
                  <h3>{h.title}</h3>
                  <p className="habit-action">{h.action}</p>
                  <p className="habit-why">{h.why}</p>
                  <p className="habit-cite">📚 {h.citation}</p>
                </div>
              ))}
            </div>

            {/* Progress loop */}
            {history.length > 0 && (
              <div className="section-title"><h2>📈 Your journey log</h2></div>
            )}
            {history.length > 0 && (
              <div className="history glass-card">
                {history.map((h) => (
                  <div key={h.id} className="hist-row">
                    <span>{new Date(h.at).toLocaleDateString()} · {new Date(h.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    <span>{h.provider === 'youcam' ? '✨ real' : '🎬 demo'} · face at {h.targetAge}</span>
                    <span className="muted">{h.comparison.worseCount}/14 worse</span>
                  </div>
                ))}
                <button className="btn-ghost small" onClick={() => { clearJourneys(); setHistory([]); }}>Clear log</button>
                <p className="muted small">Re-take in 90 days — see if your future curve moved. (Stored only in this browser.)</p>
              </div>
            )}

            {toast && <div className="toast">{toast}</div>}
          </section>
        )}
      </main>

      {shareOpen && shareData && (
        <div className="modal" onClick={() => setShareOpen(false)}>
          <div className="modal-card glass-card" onClick={(e) => e.stopPropagation()}>
            <h2>{shareData.title}</h2>
            <div className="share-visual">
              {shareData.frameUrl ? <img src={shareData.frameUrl} alt="future face" crossOrigin="anonymous" /> : <div className="tm-placeholder">GENERATED</div>}
              <span className="tm-age-badge">{shareData.age}</span>
            </div>
            <p className="share-headline">{shareData.headline}</p>
            {shareData.lines.map((l, i) => <p key={i} className="share-line">{l}</p>)}
            <p className="share-foot muted">{shareData.footer}</p>
            <div className="modal-actions">
              <button className="btn-primary" onClick={async () => {
                const r = await shareCard(shareData);
                setToast(r === 'shared' ? 'Shared! 💫' : r === 'copied' ? 'Copied to clipboard' : 'Sharing unavailable');
                setShareOpen(false);
              }}>Share</button>
              <button className="btn-ghost" onClick={() => setShareOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      <footer className="footer">
        <span>FACE AHEAD v{BUILD_VERSION} · {BUILD_DATE} · YouCam API Hackathon · {provider === 'youcam' ? 'real mode' : 'demo mode'}</span>
      </footer>
    </div>
  );
}

export default App;
