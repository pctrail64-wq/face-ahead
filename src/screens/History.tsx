import { useNavigate, Link } from 'react-router-dom'
import { useStore } from '../store/app'
import { Button, Badge, Card, Thumb } from '../components/ui'
import type { JourneyEntry } from '../store/app'

export function History() {
  const navigate = useNavigate()
  const { history, deleteJourney, clearHistory } = useStore()

  return (
    <div className="min-h-screen bg-ink text-ink">
      <header className="border-b border-line/30">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <Link to="/"><h1 className="text-xl font-bold">FACE <span className="text-brand">AHEAD</span></h1></Link>
          <nav className="flex gap-2">
            <Link to="/run" className="text-sm text-muted hover:text-ink">New scan</Link>
          </nav>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Your history</h2>
          {history.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearHistory}>Clear all</Button>
          )}
        </div>

        {history.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-muted">No saved journeys yet. Run a scan first!</p>
            <Button className="mt-3" onClick={() => navigate('/run')}>Start a journey</Button>
          </Card>
        ) : (
          <div className="space-y-4">
            {history.map((j: JourneyEntry) => (
              <Card key={j.id} className="p-4">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <Badge size="sm" color={j.provider === 'youcam' ? 'brand' : 'amber'}>
                      {j.provider === 'youcam' ? 'YouCam AI' : 'Demo'}
                    </Badge>
                    <div className="text-sm text-muted">
                      {new Date(j.at).toLocaleDateString()} · {j.unitsUsed} units
                    </div>
                    {j.today && (
                      <div className="text-sm">
                        Today: <Badge size="sm" color={j.today.overall >= 70 ? 'red' : j.today.overall >= 40 ? 'amber' : 'green'}>{j.today.overall}/100</Badge>
                      </div>
                    )}
                    {j.future && (
                      <div className="text-sm">
                        Future (age {j.targetAge}): <Badge size="sm" color={j.future.overall >= 70 ? 'red' : j.future.overall >= 40 ? 'amber' : 'green'}>{j.future.overall}/100</Badge>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => navigate('/results')}>Revisit</Button>
                    <Button size="sm" variant="danger" onClick={() => deleteJourney(j.id)}>Delete</Button>
                  </div>
                </div>
                {j.frames.length > 0 && (
                  <div className="mt-3 flex gap-1 overflow-x-auto">
                    {j.frames.slice(0, 5).map((f, i) => (
                      <Thumb key={i} src={f.url} alt={`Age ${f.age}`} className="h-12 w-12 object-cover" />
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
