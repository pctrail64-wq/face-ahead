// ---------------------------------------------------------------------------
// FACE AHEAD — orchestration pipeline (deterministic, fail-closed, live-trace).
// Inspired by ECC's orchestration pattern: explicit stages, parallel lanes,
// structured-output validation at every gate, and NO result shown unless the
// schema validates. The UI renders this trace live during a journey.
// ---------------------------------------------------------------------------

export type StageStatus = 'pending' | 'running' | 'success' | 'failed' | 'warn' | 'skipped';

export interface PipelineStage {
  id: string;
  label: string;
  detail: string;
  status: StageStatus;
  tookMs: number | null;
  units: number | null;
}

export interface PipelineEvent {
  stageId: string;
  status: StageStatus;
  detail?: string;
  units?: number | null;
}

export class Pipeline {
  private stages: PipelineStage[] = [];
  private startedAt = 0;

  constructor(defs: { id: string; label: string; detail: string }[]) {
    this.stages = defs.map((d) => ({ ...d, status: 'pending', tookMs: null, units: null }));
  }

  get all(): PipelineStage[] { return this.stages; }

  private set(id: string, patch: Partial<PipelineStage>): void {
    const s = this.stages.find((x) => x.id === id);
    if (s) Object.assign(s, patch);
  }

  markRunning(id: string, detail?: string): void {
    if (!this.startedAt) this.startedAt = Date.now();
    this.set(id, { status: 'running', detail: detail ?? this.stages.find((x) => x.id === id)?.detail ?? '' });
  }

  markSuccess(id: string, detail?: string, units?: number): void {
    this.set(id, { status: 'success', detail: detail ?? '', units: units ?? null, tookMs: Date.now() - this.startedAt });
  }

  markWarn(id: string, detail: string): void {
    this.set(id, { status: 'warn', detail, tookMs: Date.now() - this.startedAt });
  }

  /** Fail-closed: a fatal stage failure invalidates the whole journey. */
  markFailed(id: string, detail: string): void {
    this.set(id, { status: 'failed', detail, tookMs: Date.now() - this.startedAt });
  }

  get fatal(): boolean {
    return this.stages.some((s) => s.status === 'failed');
  }

  get done(): boolean {
    return this.stages.every((s) => s.status === 'success' || s.status === 'warn' || s.status === 'failed');
  }

  get unitsUsed(): number {
    return this.stages.reduce((sum, s) => sum + (s.units ?? 0), 0);
  }
}

// ---- journey orchestration (wires the real API calls; pure wiring) ---------

export const JOURNEY_DEFS = [
  { id: 'prep', label: 'Prepare photo', detail: 'decode · face crop · 1024² render' },
  { id: 'aging', label: 'Age your face', detail: 'YouCam aging · 16 frames · 12→70' },
  { id: 'today', label: 'Scan today', detail: '14 concerns + tone + Fitzpatrick (parallel)' },
  { id: 'future', label: 'Scan future', detail: '14 concerns on your aged face' },
  { id: 'compare', label: 'Compare', detail: 'deltas + impact ranking' },
  { id: 'compose', label: 'Assemble', detail: 'report · habits · share card' },
];

export const JOURNEY_UNITS = {
  prep: 0,
  aging: 2,
  today: 46,   // skin-analysis 16 + tone 20 + fitzpatrick 10
  future: 16,  // skin-analysis on the aged frame
  compare: 0,
  compose: 0,
};
