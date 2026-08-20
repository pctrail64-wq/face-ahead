import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useStore } from '../store/app'
import { Button, Input, Badge, Card, cx, formatUnits } from '../components/ui'
import { UNITS_PER_KEY } from '../api/keypool'
import type { PoolKey, KeyState } from '../api/keypool'

const STATE_LABEL: Record<KeyState, string> = {
  unverified: 'Not tested',
  ready: 'Ready',
  cooling: 'Cooling down',
  exhausted: 'Out of units',
  invalid: 'Invalid',
}

export function Settings() {
  const navigate = useNavigate()
  const {
    keys, addKey, removeKey, resetKey, updateKeyLabel, setDark,
    remainingUnits, totalUnits, ui,
  } = useStore()

  const [newKey, setNewKey] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')

  const handleAdd = () => {
    const k = addKey(newKey.trim())
    if (k) {
      setNewKey('')
    }
  }

  const handleEdit = (k: PoolKey) => {
    setEditingId(k.id)
    setEditLabel(k.label)
  }

  const handleSave = () => {
    if (editingId && editLabel.trim()) {
      updateKeyLabel(editingId, editLabel.trim())
    }
    setEditingId(null)
    setEditLabel('')
  }

  const stateColor: Record<KeyState, 'brand' | 'green' | 'red' | 'amber' | 'muted'> = {
    ready: 'green', cooling: 'amber', exhausted: 'red',
    invalid: 'red', unverified: 'muted',
  }

  return (
    <div className="min-h-screen bg-ink text-ink">
      <header className="border-b border-line/30">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <Link to="/"><h1 className="text-xl font-bold">FACE <span className="text-brand">AHEAD</span></h1></Link>
          <nav className="flex gap-2">
            <Link to="/diagnostics" className="text-sm text-muted hover:text-ink">Diagnostics</Link>
          </nav>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <h2 className="text-2xl font-bold mb-6">Settings</h2>

        <section className="mb-8">
          <h3 className="text-lg font-semibold mb-4">API Key Pool</h3>
          <p className="text-sm text-muted mb-4">
            YouCam gives 1,000 units per key. Add multiple keys to increase your
            total quota and enable automatic failover when one is exhausted.
            Keys are stored only in your browser (localStorage).
          </p>

          <Card className="mb-4 p-4">
            <div className="flex gap-2">
              <Input
                placeholder="Enter YouCam API key"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                type="password"
              />
              <Button onClick={handleAdd} disabled={!newKey.trim()}>Add</Button>
            </div>
          </Card>

          <Card className="mb-4 p-4">
            <div className="mb-3">
              <Badge color="muted">{keys.length} key{keys.length > 1 ? 's' : ''} · {formatUnits(remainingUnits())}/{formatUnits(totalUnits())} units</Badge>
            </div>

            {keys.length === 0 ? (
              <p className="text-sm text-muted text-center py-4">
                No keys added. Add one above for real YouCam AI.
              </p>
            ) : (
              <div className="space-y-2">
                {keys.map((k: PoolKey) => (
                  <div key={k.id} className="flex items-center justify-between p-2 border border-line/20 rounded-[6px]">
                    <div className="flex items-center gap-2">
                      <Badge color={stateColor[k.state]}>{STATE_LABEL[k.state]}</Badge>
                      <span className="font-mono text-sm">
                        {k.value.length > 8
                          ? `${k.value.slice(0, 4)}••••${k.value.slice(-4)}`
                          : '••••••'}
                      </span>
                      <span className="text-sm">{k.label}</span>
                      <span className="text-xs text-muted">{k.used}/{UNITS_PER_KEY}u</span>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => resetKey(k.id)}>Reset</Button>
                      <Button size="sm" variant="danger" onClick={() => removeKey(k.id)}>Remove</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </section>

        <section className="mb-8">
          <h3 className="text-lg font-semibold mb-4">Appearance</h3>
          <Card className="p-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={ui.dark}
                onChange={(e) => {
                  const dark = e.target.checked
                  document.documentElement.classList.toggle('dark', dark)
                  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
                  setDark(dark)
                }}
              />
              <span>Dark mode</span>
            </label>
          </Card>
        </section>

        <footer>
          <Button variant="ghost" onClick={() => navigate('/')}>Back to app</Button>
        </footer>
      </main>
    </div>
  )
}
