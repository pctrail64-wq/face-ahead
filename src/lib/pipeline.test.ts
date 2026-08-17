import { describe, expect, it } from 'vitest';
import { Pipeline, JOURNEY_DEFS, JOURNEY_UNITS } from './pipeline';

describe('Pipeline lifecycle', () => {
  it('starts pending, runs, and completes', () => {
    const p = new Pipeline(JOURNEY_DEFS);
    expect(p.all.every((s) => s.status === 'pending')).toBe(true);
    p.markRunning('aging');
    expect(p.all.find((s) => s.id === 'aging')?.status).toBe('running');
    p.markSuccess('aging', '16 frames', 2);
    expect(p.all.find((s) => s.id === 'aging')?.status).toBe('success');
    expect(p.unitsUsed).toBe(2);
  });

  it('fail-closed: fatal when any stage fails', () => {
    const p = new Pipeline(JOURNEY_DEFS);
    p.markFailed('aging', 'no face');
    expect(p.fatal).toBe(true);
    expect(p.done).toBe(false); // other stages still pending
    for (const s of p.all) if (s.status === 'pending') p.markFailed(s.id, 'aborted');
    expect(p.done).toBe(true);
  });

  it('done only when every stage settles', () => {
    const p = new Pipeline([{ id: 'a', label: 'A', detail: '' }, { id: 'b', label: 'B', detail: '' }]);
    p.markSuccess('a', '', 0);
    expect(p.done).toBe(false);
    p.markWarn('b', 'partial');
    expect(p.done).toBe(true);
    expect(p.fatal).toBe(false);
  });

  it('units accumulate only from marked stages', () => {
    const p = new Pipeline(JOURNEY_DEFS);
    p.markSuccess('aging', '', JOURNEY_UNITS.aging);
    p.markSuccess('today', '', JOURNEY_UNITS.today);
    expect(p.unitsUsed).toBe(48);
  });
});
