import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useStore } from '../store/app'
import { Button, Badge, Card, cx } from '../components/ui'
import { diagnosticsBus, type RawEvent } from '../lib/diagnostics'

const STATUS_COLOR: Record<number, string> = {
  200: 'text-green-600',
  201: 'text-green-600',
  400: 'text-amber-600',
  401: 'text-red-600',
  403: 'text-red-600',
  404: 'text-red-600',
  429: 'text-yellow-600',
  500: 'text-red-600',
}

export function Diagnostics() {
  const navigate = useNavigate()
  const { diagnostics } = useStore()

  const [filter, setFilter] = useState<'all' | 'errors' | 'success'>('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    diagnosticsBus.subscribe(() => {})
  }, [])

  const filtered = diagnostics.filter((e: RawEvent) => {
    if (filter === 'errors' && e.status < 400 && !e.error) return false
    if (filter === 'success' && e.status >= 400) return false
    if (search && !e.url.includes(search) && !(e.responseBody || '').includes(search)) return false
    return true
  })

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-line/30">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <Link to="/"><h1 className="text-3xl tracking-wide">FACE <span className="text-brand">AHEAD</span></h1></Link>
          <nav className="flex gap-2">
            <Link to="/settings" className="text-sm text-muted hover:text-ink">Settings</Link>
          </nav>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Diagnostics Bus</h2>
          <div className="flex gap-2">
            <Badge color="muted">{diagnostics.length} events</Badge>
            <Button variant="ghost" size="sm" onClick={() => diagnosticsBus.clear()}>Clear</Button>
          </div>
        </div>

        <div className="flex gap-3 mb-4">
          {(['all', 'errors', 'success'] as const).map((f) => (
            <Button
              key={f} size="sm" variant={filter === f ? 'primary' : 'ghost'}
              onClick={() => setFilter(f)}
            >
              {f}
            </Button>
          ))}
          <input
            type="text" placeholder="Filter by URL or response..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 px-3 py-1 rounded-[6px] bg-panel/50 border border-line text-sm"
          />
        </div>

        <div className="space-y-2">
          {filtered.length === 0 ? (
            <p className="text-muted">No events yet.</p>
          ) : (
            filtered.map((e: RawEvent) => (
              <Card key={e.id} className="p-3">
                <div className="flex items-baseline gap-3 text-xs font-mono">
                  <span className={cx('w-16', STATUS_COLOR[e.status] || 'text-muted')}>
                    {e.status || 'ERR'}
                  </span>
                  <span className="text-muted w-16">{e.method}</span>
                  <span className="text-muted truncate max-w-2xl">{e.url}</span>
                  <span className="text-muted w-20 text-right">{e.durationMs}ms</span>
                  <span className="text-muted w-24">{e.keyDisplay}</span>
                </div>
                {e.error && <div className="text-xs text-bad mt-1">Error: {e.error}</div>}
                {e.responseBody && (
                  <details className="mt-1">
                    <summary className="text-xs text-muted cursor-pointer">Response body</summary>
                    <pre className="text-xs text-muted mt-1 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                      {e.responseBody}
                    </pre>
                  </details>
                )}
              </Card>
            ))
          )}
        </div>
      </main>
    </div>
  )
}
