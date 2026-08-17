import { describe, expect, it } from 'vitest';
import { parseAgingFrames, frameAt, demoFrames, type AgeFrame } from './aging';

describe('parseAgingFrames', () => {
  it('extracts and sorts frames, skipping bad entries', () => {
    const out = parseAgingFrames([
      { res_age: 70, url: 'u70' },
      { res_age: 12, url: 'u12' },
      { res_age: 35, url: 'u35' },
      { res_age: null, url: 'bad' },
      { res_age: 20 }, // no url
    ]);
    expect(out.map((f) => f.age)).toEqual([12, 35, 70]);
  });
  it('fail-closed: throws when too few frames', () => {
    expect(() => parseAgingFrames([{ res_age: 30, url: 'u' }])).toThrow(/too few/);
  });
});

describe('frameAt', () => {
  it('returns the nearest frame', () => {
    const frames: AgeFrame[] = [{ age: 20, url: 'a' }, { age: 50, url: 'b' }, { age: 70, url: 'c' }];
    expect(frameAt(frames, 48).url).toBe('b');
    expect(frameAt(frames, 21).url).toBe('a');
  });
  it('throws on empty frames', () => {
    expect(() => frameAt([], 30)).toThrow();
  });
});

describe('demoFrames', () => {
  it('covers 12→70 with empty urls (labeled demo)', () => {
    const f = demoFrames();
    expect(f.length).toBeGreaterThanOrEqual(12);
    expect(f[0].age).toBeLessThanOrEqual(12);
    expect(f[f.length - 1].age).toBeGreaterThanOrEqual(70);
    expect(f.every((x) => x.url === '')).toBe(true);
  });
});
