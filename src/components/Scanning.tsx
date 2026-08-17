import type { Pipeline } from '../lib/pipeline';

interface ScanningProps {
  stages: Pipeline | null;
  imgUrl: string | null;
  provider: 'youcam' | 'demo';
}

export function Scanning({ stages, imgUrl, provider }: ScanningProps) {
  return (
    <section className="scanning">
      <div className="scan-card glass-card">
        <div className="scan-ring">
          {imgUrl ? <img src={imgUrl} alt="selfie" /> : <span>🧬</span>}
        </div>
        <h2 className="scan-title">Running your time machine…</h2>
        <div className="pipeline">
          {stages?.all.map((s) => (
            <div key={s.id} className={`pstage ${s.status}`}>
              <span className="pstage-icon">
                {s.status === 'running'
                  ? '⏳'
                  : s.status === 'success'
                    ? '✅'
                    : s.status === 'failed'
                      ? '❌'
                      : s.status === 'warn'
                        ? '⚠️'
                        : '○'}
              </span>
              <span className="pstage-label">{s.label}</span>
              <span className="pstage-detail">
                {s.detail}
                {s.units ? ` · ${s.units}u` : ''}
              </span>
            </div>
          ))}
        </div>
        <p className="muted">
          {provider === 'youcam'
            ? 'Real YouCam AI · units charge only on success'
            : 'Demo — add a YouCam key for the real thing'}
        </p>
      </div>
    </section>
  );
}
