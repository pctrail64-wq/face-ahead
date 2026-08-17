// ---------------------------------------------------------------------------
// FACE AHEAD — local persistence: scan history + revisits (progress loop).
// "Re-take in 90 days" is the impact story: your future face becomes a
// baseline you can beat.
// ---------------------------------------------------------------------------
import type { ScanResult } from './youcam';
import type { AgeFrame } from './aging';
import type { ComparisonReport } from './compare';

export interface JourneyEntry {
  id: string;
  at: string;                 // ISO timestamp
  today: ScanResult;
  future: ScanResult;
  frames: AgeFrame[];         // urls are TTL ~2h; stored for session replay
  targetAge: number;
  comparison: ComparisonReport;
  provider: 'youcam' | 'demo';
}

const KEY = 'face-ahead-journeys-v1';

export function loadJourneys(): JourneyEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

export function saveJourney(entry: JourneyEntry): void {
  const list = loadJourneys().filter((e) => e.id !== entry.id);
  list.unshift(entry);
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 12))); } catch { /* quota */ }
}

export function clearJourneys(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
