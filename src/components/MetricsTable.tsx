import type { ComparisonReport } from '../lib/compare';

const scoreColor = (s: number) => (s >= 85 ? '#53e16f' : s >= 70 ? '#ffb020' : '#e05252');

interface MetricsTableProps {
  comparison: ComparisonReport;
  targetAge: number;
}

export function MetricsTable({ comparison, targetAge }: MetricsTableProps) {
  const metrics = comparison.metrics ?? [];

  return (
    <>
      <div className="section-title">
        <h2>
          Today → {targetAge}{' '}
          <span className="muted small">(14 metrics, honest deltas)</span>
        </h2>
      </div>
      <div className="metrics glass-card">
        <div className="m-row m-head">
          <span>Concern</span>
          <span>Today</span>
          <span>At {targetAge}</span>
          <span>Δ</span>
        </div>
        {metrics.map((m) => (
          <div key={m.key} className="m-row">
            <span className="m-label">{m.label}</span>
            <span className="m-num">{m.today?.toFixed(0) ?? '—'}</span>
            <span
              className="m-num"
              style={{ color: m.future != null ? scoreColor(m.future) : undefined }}
            >
              {m.future?.toFixed(0) ?? '—'}
            </span>
            <span className={`m-delta ${m.trend}`}>
              {m.trend === 'better' ? '▲' : m.trend === 'worse' ? '▼' : '='}{' '}
              {m.delta != null ? Math.abs(m.delta).toFixed(1) : '—'}
            </span>
          </div>
        ))}
        <p className="m-foot muted">
          ▲ better · ▼ worse · = stable (±1.5). Scores are YouCam ui_scores
          (higher = better).
        </p>
      </div>
    </>
  );
}
