import type { JourneyEntry } from '../lib/store';

interface JourneyLogProps {
  history: JourneyEntry[];
  onClear: () => void;
}

export function JourneyLog({ history, onClear }: JourneyLogProps) {
  if (history.length === 0) return null;

  return (
    <>
      <div className="section-title">
        <h2>📈 Your journey log</h2>
      </div>
      <div className="history glass-card">
        {history.map((h) => (
          <div key={h.id} className="hist-row">
            <span>
              {new Date(h.at).toLocaleDateString()} ·{' '}
              {new Date(h.at).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            <span>
              {h.provider === 'youcam' ? '✨ real' : '🎬 demo'} · face at{' '}
              {h.targetAge}
            </span>
            <span className="muted">
              {h.comparison.worseCount}/14 worse
            </span>
          </div>
        ))}
        <button className="btn-ghost small" onClick={onClear}>
          Clear log
        </button>
        <p className="muted small">
          Re-take in 90 days — see if your future curve moved. (Stored only in
          this browser.)
        </p>
      </div>
    </>
  );
}
