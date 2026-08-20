import { useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useStore } from '../store/app'
import { Button, Badge, Card, Thumb } from '../components/ui'
import { severityColor, severityBg } from '../lib/skin'
import type { SkinReport } from '../lib/skin'
import type { StepResult } from '../api/orchestrator'

export function Results() {
  const navigate = useNavigate()
  const {
    journey, resetJourney, saveJourney,
  } = useStore()

  const { results, today, future, targetAge, frames, running } = journey

  useEffect(() => {
    if (!results && !today && !future) {
      navigate('/')
    }
  }, [results, today, future, navigate])

  if (!today && !future && !results) return null

  return (
    <div className="min-h-screen bg-ink text-ink">
      <header className="border-b border-line/30">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <Link to="/"><h1 className="text-xl font-bold">FACE <span className="text-brand">AHEAD</span></h1></Link>
          <nav className="flex gap-2">
            <Link to="/history" className="text-sm text-muted hover:text-ink">History</Link>
            <Button variant="ghost" size="sm" onClick={() => navigate('/run')}>New scan</Button>
          </nav>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <h2 className="text-2xl font-bold mb-6">Your results</h2>

        {today && (
          <Card className="mb-6 p-4">
            <h3 className="text-lg font-semibold mb-3">Today's skin scan</h3>
            <div className="mb-3">
              <Badge color={today.overall >= 70 ? 'red' : today.overall >= 40 ? 'amber' : 'green'}>
                Overall: {today.overall}/100
              </Badge>
              <span className="text-sm text-muted ml-2">Type: {today.skinType} · Fitzpatrick: {today.fitzpatrick}</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {today.concerns.slice(0, 8).map((c) => (
                <div key={c.label} className={`p-2 rounded-[6px] ${severityBg(c.score)}`}>
                  <div className="flex justify-between">
                    <span className="text-xs text-muted">{c.label}</span>
                    <span className={`text-sm font-bold ${severityColor(c.score)}`}>{Math.round(c.score)}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {future && (
          <Card className="mb-6 p-4">
            <h3 className="text-lg font-semibold mb-3">Future projection (age {targetAge})</h3>
            <div className="mb-3">
              <Badge color={future.overall >= 70 ? 'red' : future.overall >= 40 ? 'amber' : 'green'}>
                Overall: {future.overall}/100
              </Badge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {future.concerns.slice(0, 8).map((c) => (
                <div key={c.label} className={`p-2 rounded-[6px] ${severityBg(c.score)}`}>
                  <div className="flex justify-between">
                    <span className="text-xs text-muted">{c.label}</span>
                    <span className={`text-sm font-bold ${severityColor(c.score)}`}>{Math.round(c.score)}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {today && future && (
          <Card className="mb-6 p-4">
            <h3 className="text-lg font-semibold mb-3">What the scan found</h3>
            {today.concerns.map((c) => {
              const futureC = future.concerns.find((fc) => fc.label === c.label)
              const delta = futureC ? futureC.score - c.score : null
              return (
                <div key={c.label} className="border-b border-line/20 py-2 last:border-0">
                  <div className="flex justify-between">
                    <span className="font-medium">{c.label}</span>
                    <span className={`text-sm ${delta != null && delta > 0 ? 'text-bad' : delta != null ? 'text-good' : 'text-muted'}`}>
                      {c.score.toFixed(0)} → {futureC ? futureC.score.toFixed(0) : '?'} {delta != null && (delta > 0 ? `▲${delta.toFixed(0)}` : delta < 0 ? `▼${Math.abs(delta).toFixed(0)}` : '')}
                    </span>
                  </div>
                  {c.advice && <p className="text-xs text-muted mt-1">{c.advice}</p>}
                </div>
              )
            })}
          </Card>
        )}

        {frames.length > 0 && (
          <Card className="mb-6 p-4">
            <h3 className="text-lg font-semibold mb-3">Aging progression</h3>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {frames.map((f, i) => (
                <div key={i} className="flex flex-col items-center min-w-[80px]">
                  <Thumb src={f.url} alt={`Age ${f.age}`} className="h-48 w-48 object-cover" />
                  <span className="text-xs text-muted mt-1">{f.age}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {results && (
          <Card className="mb-6 p-4">
            <h3 className="text-lg font-semibold mb-3">Pipeline results</h3>
            <div className="space-y-2 text-sm">
              {Object.values(results).map((r: StepResult) => (
                <div key={r.id} className="flex justify-between items-center py-1 border-b border-line/10">
                  <span>{r.label}</span>
                  <Badge size="sm" color={r.state === 'success' ? 'green' : r.state === 'error' ? 'red' : 'amber'}>
                    {r.state}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        )}

        <div className="flex gap-3 mt-8">
          <Button onClick={() => saveJourney()} variant="secondary">💾 Save to history</Button>
          <Button variant="ghost" onClick={() => navigate('/history')}>View history</Button>
        </div>
      </main>
    </div>
  )
}
