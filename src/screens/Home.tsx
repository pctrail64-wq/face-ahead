import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/app'
import { CATEGORIES, activeFeatures, type Feature } from '../api/features'
import { Button, Badge, Card, cx } from '../components/ui'

const EMOJI: Record<string, string> = {
  clock: '🕐', sparkle: '✨', scan: '🔍', grid: '🧩', sun: '☀️',
  palette: '🎨', shirt: '👕', scissors: '✂️', droplet: '💧',
  user: '👤', brush: '🖌️', smile: '😁', star: '⭐', frame: '🖼️',
  badge: '🏅', wand: '✨', refresh: '🔄', zap: '⚡', layers: '🔪',
  cloud: '☁️', rainbow: '🌈', eraser: '🧹',
}

export function Home() {
  const navigate = useNavigate()
  const { keys, remainingUnits, totalUnits } = useStore()
  const hasKeys = keys.length > 0

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-line/30">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-3xl tracking-wide">FACE <span className="text-brand">AHEAD</span></h1>
          <nav className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate('/settings')}>Settings</Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/diagnostics')}>Diagnostics</Button>
          </nav>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12 max-w-4xl">
        <section className="text-center mb-12">
          <h2 className="text-5xl md:text-6xl mb-3">Meet the face you're building</h2>
          <p className="text-muted max-w-md mx-auto">
            Upload a selfie, scan your skin, project your age, and try styles — all in the browser with YouCam AI.
          </p>
          <div className="mt-6 flex gap-3 justify-center">
            <Button size="lg" onClick={() => navigate('/run')}>Start a journey</Button>
            {!hasKeys && <Badge color="amber">Demo mode (add keys in Settings for real AI)</Badge>}
          </div>
          {hasKeys && (
            <div className="mt-4 text-sm text-muted">
              {remainingUnits()} units remaining across {keys.length} key{keys.length > 1 ? 's' : ''}
            </div>
          )}
        </section>

        <section className="mb-8">
          <h3 className="text-lg font-semibold mb-4">Hero flows</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <Card className="border-2 border-brand/30">
              <div className="flex items-start gap-3">
                <span className="text-2xl">{EMOJI.clock}</span>
                <div>
                  <h4 className="font-semibold">Skin Time Machine</h4>
                  <p className="text-sm text-muted mt-1">
                    Scan today, age to 50, scan again, and see the habit impact.
                  </p>
                  <div className="mt-2 text-xs">Cost: ~42 units (demo: free)</div>
                </div>
              </div>
            </Card>
            <Card className="border-2 border-brand2/30">
              <div className="flex items-start gap-3">
                <span className="text-2xl">{EMOJI.shirt}</span>
                <div>
                  <h4 className="font-semibold">Tone-Matched Try-On</h4>
                  <p className="text-sm text-muted mt-1">
                    Read your undertone, then try on a garment from a product photo.
                  </p>
                  <div className="mt-2 text-xs">Cost: ~8 units</div>
                </div>
              </div>
            </Card>
          </div>
        </section>

        <section>
          <h3 className="text-lg font-semibold mb-4">Try a tool</h3>
          <div className="grid md:grid-cols-3 lg:grid-cols-4 gap-3">
            {activeFeatures().map((f: Feature) => {
              const emoji = EMOJI[f.icon] || '🔧'
              return (
                <Card key={f.id} className="p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{emoji}</span>
                    <span className="text-sm font-medium">{f.name}</span>
                  </div>
                  <p className="text-xs text-muted mt-1 line-clamp-2">{f.blurb}</p>
                  <div className="mt-2 flex justify-between items-center">
                    <Badge size="sm" color={f.cost ? 'brand' : 'muted'}>{f.cost}u</Badge>
                    <Button size="sm" variant="ghost" onClick={() => navigate(`/run?feature=${f.id}`)}>Try</Button>
                  </div>
                </Card>
              )
            })}
          </div>
        </section>

        <footer className="mt-12 pt-6 border-t border-line/30 text-center text-xs text-muted">
          FACE AHEAD v0.9 · Built for the YouCam API Hackathon
        </footer>
      </main>
    </div>
  )
}
