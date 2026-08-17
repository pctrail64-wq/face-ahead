import { useMemo } from 'react';
import { frameAt, type AgeFrame } from '../lib/aging';
import { hasKey } from '../lib/youcam';
import { CONCERN_LABELS } from '../lib/compare';

interface TimeMachineProps {
  frames: AgeFrame[];
  targetAge: number;
  onAgeChange: (age: number) => void;
  onScanAge: () => void;
  onVerify: () => void;
  busy: boolean;
  verifyBusy: boolean;
  verdict: { metric: string; spread: number } | null;
}

export function TimeMachine({
  frames,
  targetAge,
  onAgeChange,
  onScanAge,
  onVerify,
  busy,
  verifyBusy,
  verdict,
}: TimeMachineProps) {
  const frameUrl = useMemo(() => {
    if (!frames.length) return null;
    return frameAt(frames, targetAge).url || null;
  }, [frames, targetAge]);

  const minAge = frames[0]?.age ?? 12;
  const maxAge = frames[frames.length - 1]?.age ?? 70;

  return (
    <div className="glass-card time-machine">
      <div className="tm-visual">
        <div className="face-stage">
          {frameUrl ? (
            <img
              src={frameUrl}
              alt={`Your face at ${targetAge}`}
              className="tm-face"
              crossOrigin="anonymous"
            />
          ) : (
            <div className="tm-placeholder">GENERATED frame</div>
          )}
          <span className="tm-age-badge">{targetAge}</span>
          <span className="tm-proj">AI projection</span>
        </div>
        <div className="tm-controls">
          <input
            type="range"
            min={minAge}
            max={maxAge}
            step={1}
            value={targetAge}
            onChange={(e) => onAgeChange(Number(e.target.value))}
            className="age-slider"
          />
          <div className="tm-scale">
            {[minAge, 30, 50, maxAge].map((a) => (
              <span key={a}>{a}</span>
            ))}
          </div>
          <div className="tm-buttons">
            {hasKey() && (
              <button
                className="btn-ghost small"
                onClick={onScanAge}
                disabled={busy}
              >
                {busy ? 'Scanning…' : `🔬 Scan report at ${targetAge} (16u)`}
              </button>
            )}
            {verifyBusy ? (
              <span className="muted small">verifying…</span>
            ) : verdict ? (
              <span className="verdict-chip">
                📏 {CONCERN_LABELS[verdict.metric] ?? verdict.metric} ±{' '}
                {verdict.spread.toFixed(0)} across 2 scans
              </span>
            ) : (
              <button
                className="btn-ghost small"
                onClick={onVerify}
                disabled={verifyBusy}
              >
                📏 Verify: re-scan for error bar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
