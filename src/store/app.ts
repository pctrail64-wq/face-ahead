/**
 * Zustand store — the single source of truth for the app.
 * Replaces the old lib/store.ts + scattered useState.
 *
 * State slices:
 *  - keys: the API key pool (persisted to localStorage as face-ahead-keys-v1)
 *  - journey: current scan results / pipeline run
 *  - history: saved journeys (persisted as face-ahead-journeys-v1)
 *  - diagnostics: live events from the Diagnostics Bus
 *  - ui: theme, toast, etc.
 */
import { create } from 'zustand'
import { persist, subscribeWithSelector } from 'zustand/middleware'
import { KeyPool, makeKey, maskKey, type PoolKey, type KeyState } from '../api/keypool'
import { diagnosticsBus, type RawEvent } from '../lib/diagnostics'
import type { StepResult } from '../api/orchestrator'
import type { SkinReport } from '../lib/skin'

export interface JourneyEntry {
  id: string
  at: string
  today: SkinReport | null
  future: SkinReport | null
  frames: { age: number; url: string }[]
  targetAge: number
  pipelineResults: Record<string, StepResult>
  provider: 'youcam' | 'demo'
  unitsUsed: number
}

export interface AppState {
  keys: PoolKey[]
  pool: KeyPool
  journey: {
    primary: Blob | null
    reference: Blob | null
    mask: Blob | null
    results: Record<string, StepResult> | null
    today: SkinReport | null
    future: SkinReport | null
    frames: { age: number; url: string }[]
    targetAge: number
    running: boolean
    error: string | null
    pipelineId: string | null
  }
  history: JourneyEntry[]
  diagnostics: RawEvent[]
  ui: {
    dark: boolean
    toast: string | null
    activePanel: 'journey' | 'history' | 'settings' | 'diagnostics'
  }

  addKey: (value: string) => PoolKey | null
  removeKey: (id: string) => void
  resetKey: (id: string) => void
  updateKeyLabel: (id: string, label: string) => void
  setKeys: (keys: PoolKey[]) => void
  setKeyState: (id: string, state: KeyState, extra?: Partial<PoolKey>) => void

  setImages: (images: { primary?: Blob | null; reference?: Blob | null; mask?: Blob | null }) => void
  setResults: (results: Record<string, StepResult> | null) => void
  setToday: (report: SkinReport | null) => void
  setFuture: (report: SkinReport | null) => void
  setFrames: (frames: { age: number; url: string }[]) => void
  setTargetAge: (age: number) => void
  setRunning: (running: boolean) => void
  setError: (error: string | null) => void
  setPipeline: (id: string | null) => void
  resetJourney: () => void

  saveJourney: () => void
  deleteJourney: (id: string) => void
  clearHistory: () => void

  setDark: (dark: boolean) => void
  setToast: (toast: string | null) => void
  setActivePanel: (panel: AppState['ui']['activePanel']) => void
  setDiagnostics: (events: RawEvent[]) => void

  poolDisplay: () => Array<{ id: string; label: string; display: string; state: KeyState; used: number }>
  remainingUnits: () => number
  totalUnits: () => number
}

const KEY_POOL_LS = 'face-ahead-keys-v1'
const HISTORY_LS = 'face-ahead-journeys-v1'

const DEFAULT_KEY = 'sk-FKXpCUZg0k8JXufDnGwJ9p7zcFyIwO_1wF485kjGCyutTILi1hcOH53uPTO7YcwN'

function loadKeys(): PoolKey[] {
  try {
    const raw = localStorage.getItem(KEY_POOL_LS)
    const parsed = raw ? JSON.parse(raw) : []
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((k: any) => ({
        id: k.id ?? makeKey(k.value, 0).id,
        value: k.value,
        label: k.label ?? 'Key ' + String(k.id ?? ''),
        state: (k.state ?? 'unverified') as KeyState,
        used: k.used ?? 0,
        cooldownUntil: k.cooldownUntil,
        lastError: k.lastError,
        lastStatus: k.lastStatus,
        verified: k.verified,
      }))
    }
    // Default to the provided YouCam key on first run
    return [makeKey(DEFAULT_KEY, 0)] as PoolKey[]
  } catch { return [makeKey(DEFAULT_KEY, 0)] as PoolKey[] }
}

function saveKeys(keys: PoolKey[]) {
  try { localStorage.setItem(KEY_POOL_LS, JSON.stringify(keys)) } catch { }
}

function loadHistory(): JourneyEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_LS)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

function saveHistory(entries: JourneyEntry[]) {
  try { localStorage.setItem(HISTORY_LS, JSON.stringify(entries.slice(0, 20))) } catch { }
}

export const useStore = create<AppState>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        keys: loadKeys(),
        get pool() {
          return new KeyPool(get().keys)
        },
        journey: {
          primary: null,
          reference: null,
          mask: null,
          results: null,
          today: null,
          future: null,
          frames: [],
          targetAge: 50,
          running: false,
          error: null,
          pipelineId: null,
        },
        history: loadHistory(),
        diagnostics: [],
        ui: {
          dark: false,
          toast: null,
          activePanel: 'journey',
        },

        addKey: (value) => {
          const pool = get().pool
          const k = pool.add(value)
          if (k) {
            const keys = [...get().keys, k]
            set({ keys })
            saveKeys(keys)
          }
          return k ?? null
        },
        removeKey: (id) => {
          const pool = get().pool
          pool.remove(id)
          const keys = [...pool.keys]
          set({ keys })
          saveKeys(keys)
        },
        resetKey: (id) => {
          const pool = get().pool
          pool.reset(id)
          const keys = [...pool.keys]
          set({ keys })
          saveKeys(keys)
        },
        updateKeyLabel: (id, label) => {
          const pool = get().pool
          const k = pool.keys.find((x) => x.id === id)
          if (k) k.label = label
          const keys = [...pool.keys]
          set({ keys })
          saveKeys(keys)
        },
        setKeys: (keys) => {
          set({ keys })
          saveKeys(keys)
        },
        setKeyState: (id, state, extra = {}) => {
          const keys = get().keys.map((k) => (k.id === id ? { ...k, ...extra, state } : k))
          set({ keys })
          saveKeys(keys)
        },

        setImages: (images) =>
          set((s) => ({
            journey: {
              ...s.journey,
              primary: images.primary ?? null,
              reference: images.reference ?? null,
              mask: images.mask ?? null,
            },
          })),
        setResults: (results) =>
          set((s) => ({ journey: { ...s.journey, results } })),
        setToday: (today) =>
          set((s) => ({ journey: { ...s.journey, today } })),
        setFuture: (future) =>
          set((s) => ({ journey: { ...s.journey, future } })),
        setFrames: (frames) =>
          set((s) => ({ journey: { ...s.journey, frames } })),
        setTargetAge: (targetAge) =>
          set((s) => ({ journey: { ...s.journey, targetAge } })),
        setRunning: (running) =>
          set((s) => ({ journey: { ...s.journey, running } })),
        setError: (error) =>
          set((s) => ({ journey: { ...s.journey, error } })),
        setPipeline: (pipelineId) =>
          set((s) => ({ journey: { ...s.journey, pipelineId } })),
        resetJourney: () =>
          set({
            journey: {
              primary: null,
              reference: null,
              mask: null,
              results: null,
              today: null,
              future: null,
              frames: [],
              targetAge: 50,
              running: false,
              error: null,
              pipelineId: null,
            },
          }),

        saveJourney: () => {
          const s = get().journey
          if (!s.primary) return
          const unitsUsed = s.results
            ? Object.values(s.results).reduce((n, r) => n + (r.cost ?? 0), 0)
            : 0
          const entry: JourneyEntry = {
            id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
            at: new Date().toISOString(),
            today: s.today,
            future: s.future,
            frames: s.frames,
            targetAge: s.targetAge,
            pipelineResults: s.results ?? {},
            provider: 'youcam',
            unitsUsed,
          }
          const history = [entry, ...get().history]
          saveHistory(history)
          set({ history })
        },
        deleteJourney: (id) => {
          const history = get().history.filter((j) => j.id !== id)
          saveHistory(history)
          set({ history })
        },
        clearHistory: () => {
          localStorage.removeItem(HISTORY_LS)
          set({ history: [] })
        },

        setDark: (dark) => set((s) => ({ ui: { ...s.ui, dark } })),
        setToast: (toast) => set((s) => ({ ui: { ...s.ui, toast } })),
        setActivePanel: (activePanel) =>
          set((s) => ({ ui: { ...s.ui, activePanel } })),
        setDiagnostics: (diagnostics) => set({ diagnostics }),

        poolDisplay: () =>
          get().pool.keys.map((k) => ({
            id: k.id,
            label: k.label,
            display: maskKey(k.value),
            state: k.state,
            used: k.used,
          })),
        remainingUnits: () => get().pool.remaining(),
        totalUnits: () => get().pool.total(),
      }),
      {
        name: 'face-ahead-app',
        partialize: (s: AppState) => ({
          keys: s.keys,
          ui: { dark: s.ui.dark, activePanel: s.ui.activePanel },
        }),
      },
    ),
  ),
)

/** Wire the Diagnostics Bus into the store on first import. */
if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
  let buf: RawEvent[] = []
  diagnosticsBus.subscribe((e) => {
    buf = [e, ...buf].slice(0, 200)
    useStore.setState({ diagnostics: buf })
  })
}
