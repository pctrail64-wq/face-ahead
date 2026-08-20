import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useStore } from '../store/app'
import { Button, Input, Badge, Card, cx, formatUnits } from '../components/ui'
import { UNITS_PER_KEY } from '../api/keypool'
import { verifyKey } from '../api/client'
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
    keys, addKey, removeKey, resetKey, updateKeyLabel, setKeyState,
    remainingUnits, totalUnits,
  } = useStore()

  const [newKey, setNewKey] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [notice, setNotice] = useState<{ kind: 'ok' | 'warn' | 'bad'; text: string } | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)

  const handleAdd = () => {
    const v = newKey.trim()
    if (!v) return
    const k = addKey(v)
    if (k) {
      setNewKey('')
      setNotice({ kind: 'ok', text: `Added "${k.label}". It will be tested on first use — or tap Test to verify now.` })
    } else {
      setNotice({ kind: 'warn', text: 'That key is already in the pool (or is empty).' })
    }
  }

  const handleTest = async (k: PoolKey) => {
    setTestingId(k.id)
    setNotice(null)
    const res = await verifyKey(k.value)
    if (res.ok) {
      setKeyState(k.id, 'ready', { verified: true, lastError: undefined })
      setNotice({ kind: 'ok', text: `Key "${k.label}" is valid ✅` })
    } else {
      setKeyState(k.id, res.state, { lastError: res.reason })
      setNotice({ kind: 'bad', text: `Key "${k.label}" failed: ${res.reason}` })
    }
    setTestingId(null)
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
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-line/30">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <Link to="/"><h1 className="text-3xl tracking-wide">FACE <span className="text-brand">AHEAD</span></h1></Link>
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
            {notice && (
              <p className={cx(
                'text-sm mt-3',
                notice.kind === 'ok' ? 'text-good' : notice.kind === 'warn' ? 'text-warn' : 'text-bad',
              )}>
                {notice.text}
              </p>
            )}
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
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleTest(k)}
                        disabled={testingId === k.id}
                      >
                        {testingId === k.id ? 'Testing…' : 'Test'}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => resetKey(k.id)}>Reset</Button>
                      <Button size="sm" variant="danger" onClick={() => removeKey(k.id)}>Remove</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </section>

        <footer>
          <Button variant="ghost" onClick={() => navigate('/')}>Back to app</Button>
        </footer>
      </main>
    </div>
  )
}
