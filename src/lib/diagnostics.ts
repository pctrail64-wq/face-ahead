/**
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ SkinForge — Diagnostics Bus                                          │
 * │                                                                      │
 * │ Every raw HTTP request/response, regardless of which layer produced  │
 * │ it, is published here UNFILTERED. The UI subscribes for a live raw   │
 * │ log on /diagnostics. Nothing is lost to a "friendly error" wrapper   │
 * │ before it lands here.                                                │
 * │                                                                      │
 * │ Per PRD §4 (Diagnostics Bus) and §7 (Diagnostics screen).            │
 * └──────────────────────────────────────────────────────────────────────┘
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'OPTIONS'

export interface RawEvent {
  id: string
  timestamp: number
  /** masked key, e.g. "yce_••••1234" — never the full secret */
  keyDisplay: string
  method: HttpMethod
  /** full URL including host */
  url: string
  /** request body as text (may be truncated) */
  requestBody: string | null
  /** HTTP status code (0 = network error, no response) */
  status: number
  /** response headers */
  headers: Record<string, string>
  /** raw response body text (may be truncated) */
  responseBody: string
  /** duration of the fetch call in ms */
  durationMs: number
  /** network error message if no response was received */
  error: string | null
}

export type DiagnosticsListener = (event: RawEvent) => void

const MAX_EVENTS = 500
const TRUNCATE_AT = 8_000

class DiagnosticsBus {
  private listeners = new Set<DiagnosticsListener>()
  private events: RawEvent[] = []

  /** Subscribe to new raw events. Returns an unsubscriber. */
  subscribe(listener: DiagnosticsListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Publish a raw event. Called by client.ts on every request attempt. */
  publish(event: Omit<RawEvent, 'id' | 'timestamp'>): RawEvent {
    const full: RawEvent = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      ...event,
    }
    this.events.unshift(full)
    if (this.events.length > MAX_EVENTS) {
      this.events = this.events.slice(0, MAX_EVENTS)
    }
    for (const l of this.listeners) {
      try { l(full) } catch { /* never throw inside a listener */ }
    }
    return full
  }

  /** All captured events, newest first. */
  get history(): RawEvent[] {
    return this.events
  }

  /** Events for a specific masked key. */
  byKey(keyDisplay: string): RawEvent[] {
    return this.events.filter((e) => e.keyDisplay === keyDisplay)
  }

  clear(): void {
    this.events = []
  }
}

export const diagnosticsBus = new DiagnosticsBus()

/** Truncate long bodies so the log stays readable. */
export function truncateBody(s: string, max = TRUNCATE_AT): string {
  return s.length > max ? s.slice(0, max) + '…[truncated]' : s
}
