import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useStore } from '../store/app'
import { PIPELINES, singleFeaturePipeline, runPipeline, type Pipeline, type StepResult } from '../api/orchestrator'
import { byId, type Feature } from '../api/features'
import { KeyPool } from '../api/keypool'
import { listTemplates, type Template } from '../api/client'
import { Button, Badge, Card, Spinner, Progress, Modal, Thumb, cx } from '../components/ui'
import { parseSkinScan } from '../lib/skin'

export function Run() {
  const navigate = useNavigate()
  const location = useLocation()
  const search = new URLSearchParams(location.search)
  const featureParam = search.get('feature')

  const {
    keys, journey, setImages, setResults, setToday, setFuture, setFrames,
    setTargetAge, setRunning, setError, setPipeline,
    resetJourney, saveJourney,
  } = useStore()
  const { running } = journey

  const [file, setFile] = useState<File | null>(null)
  const [refFile, setRefFile] = useState<File | null>(null)
  const [maskFile, setMaskFile] = useState<File | null>(null)
  const [pipeline, setPipelineState] = useState<Pipeline | null>(null)
  const [results, setResultsLocal] = useState<Record<string, StepResult>>({})
  const [showMaskEditor, setShowMaskEditor] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [templates, setTemplates] = useState<Template[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [params, setParams] = useState<Record<string, any>>({})

  const hasKeys = keys.length > 0
  const canRun = file && (hasKeys || true) // demo mode allowed without keys
  const selectedFeature = featureParam ? byId(featureParam) : null

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  // Fetch style templates for template-based features (hairstyle, beard,
  // avatar, studio, headshot, AI art). Previously these were never loaded,
  // so every needsTemplate feature failed with "Pick a style first."
  useEffect(() => {
    if (!selectedFeature?.needsTemplate || !hasKeys) {
      setTemplates([])
      setSelectedTemplate(null)
      return
    }
    let cancelled = false
    setTemplatesLoading(true)
    const pool = new KeyPool(keys)
    listTemplates(selectedFeature.path, { pool, onPoolChange: () => {} }, 24)
      .then((res) => {
        if (cancelled) return
        setTemplates(res.items)
        if (res.items[0]) setSelectedTemplate(res.items[0].id)
      })
      .catch(() => {
        if (!cancelled) setTemplates([])
      })
      .finally(() => {
        if (!cancelled) setTemplatesLoading(false)
      })
    return () => { cancelled = true }
  }, [selectedFeature?.id, hasKeys, keys])

  const onSelectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(URL.createObjectURL(f))
  }

  const onSelectRef = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRefFile(e.target.files?.[0] ?? null)
  }

  const onSelectMask = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) setMaskFile(f)
  }

  const buildPipeline = () => {
    if (selectedFeature) {
      return singleFeaturePipeline(selectedFeature.id, params)
    }
    // default hero flow
    return PIPELINES.timeMachine
  }

  const handleRun = useCallback(async () => {
    if (!file) return
    setRunning(true)
    setError(null)
    setResults(null)

    const pipe = buildPipeline()
    setPipelineState(pipe)
    setPipeline(pipe.id)

    const apiCtx = { pool: new KeyPool(keys), onPoolChange: () => {} }
    const images: { primary?: Blob; reference?: Blob; mask?: Blob } = { primary: file }
    if (refFile) images.reference = refFile
    if (maskFile) images.mask = maskFile
    setImages(images)

    const templatesMap: Record<string, string> = {}
    if (selectedFeature?.needsTemplate && selectedTemplate) {
      templatesMap[selectedFeature.id] = selectedTemplate
    }

    setResultsLocal((p) => Object.fromEntries(pipe.steps.map((s) => [s.id, {
      id: s.id, featureId: s.featureId, label: s.label || byId(s.featureId)?.name || s.featureId,
      state: 'idle' as const, cost: byId(s.featureId)?.cost ?? 1,
    }])))

    try {
      const results: Record<string, StepResult> = await runPipeline(pipe, {
        ctx: apiCtx,
        images,
        signal: AbortSignal.timeout(300_000),
        concurrency: 3,
        templates: templatesMap,
        onUpdate: (r) => setResultsLocal(r),
        onCharge: (keyId, units) => {
          const pool = apiCtx.pool
          pool.charge(keyId, units)
        },
      })

      setResultsLocal(results)
      setResults(results)

      // parse scan results
      const scanStep = results.scan || results.main
      if (scanStep?.scores) {
        const report = parseSkinScan(scanStep.scores)
        setToday(report)
        if (pipe.id === 'timeMachine') {
          const futureStep = results.future
          if (futureStep?.scores) {
            const futureReport = parseSkinScan(futureStep.scores)
            setFuture(futureReport)
          }
        }
      }

      // aging frames
      const ageStep = results.age || results.aging
      if (ageStep?.urls) {
        const frames = ageStep.urls.map((url, i) => ({ age: 12 + i * 4, url }))
        setFrames(frames)
      }

      saveJourney()
      navigate('/results')
    } catch (e: any) {
      setError(e?.message || 'Pipeline failed.')
    } finally {
      setRunning(false)
    }
  }, [file, keys, refFile, maskFile, selectedFeature, selectedTemplate, params])

  const handleDemo = () => {
    setRunning(true)
    setError(null)
    setPipeline('demo')

    const pipe = buildPipeline()
    setPipelineState(pipe)

    const demoResults: Record<string, StepResult> = {}
    for (const s of pipe.steps) {
      const f = byId(s.featureId)
      demoResults[s.id] = {
        id: s.id, featureId: s.featureId, label: s.label || f?.name || s.featureId,
        state: 'success', cost: f?.cost ?? 1, url: '', urls: [],
      }
    }

    setTimeout(() => {
      setResultsLocal(demoResults)
      setResults(demoResults)
      setRunning(false)
      saveJourney()
      navigate('/results')
    }, 1500)
  }

  return (
    <div className="min-h-screen bg-ink text-ink">
      <header className="border-b border-line/30">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <Link to="/"><h1 className="text-xl font-bold">FACE <span className="text-brand">AHEAD</span></h1></Link>
          <nav className="flex gap-2">
            <Link to="/history" className="text-sm text-muted hover:text-ink">History</Link>
            <Link to="/settings" className="text-sm text-muted hover:text-ink">Settings</Link>
          </nav>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <h2 className="text-2xl font-bold mb-6">Start a journey</h2>

        {selectedFeature && (
          <Card className="mb-4 p-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">{selectedFeature.icon}</span>
              <span className="font-medium">{selectedFeature.name}</span>
              <span className="text-sm text-muted">({selectedFeature.blurb})</span>
            </div>
          </Card>
        )}

        <Card className="mb-6 p-4">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Main photo</label>
              <input
                type="file" accept="image/*" capture="user"
                onChange={onSelectFile} className="w-full text-sm"
              />
              <Input type="file" accept="image/*" onChange={onSelectFile} />
              {previewUrl && <Thumb src={previewUrl} alt="preview" className="mt-2 h-48 w-48 object-cover" />}
            </div>

            {(selectedFeature?.input === 'face+ref' || selectedFeature?.input === 'body+ref') && (
              <div>
                <label className="block text-sm font-medium mb-1">Reference photo (garment / look)</label>
                <input type="file" accept="image/*" onChange={onSelectRef} className="w-full text-sm" />
              </div>
            )}

            {selectedFeature?.input === 'photo+mask' && (
              <div>
                <label className="block text-sm font-medium mb-1">Or paint a mask</label>
                <Button variant="ghost" size="sm" onClick={() => setShowMaskEditor(true)}>Open mask editor</Button>
                <input type="file" accept="image/*" onChange={onSelectMask} className="w-full text-sm mt-2" />
              </div>
            )}

            {selectedFeature?.needsTemplate && (
              <div>
                <label className="block text-sm font-medium mb-1">Pick a style</label>
                {templatesLoading && <p className="text-sm text-muted">Loading styles…</p>}
                {!templatesLoading && templates.length === 0 && (
                  <p className="text-sm text-muted">No styles found. Add a working key in Settings, then retry.</p>
                )}
                {!templatesLoading && templates.length > 0 && (
                  <div className="grid grid-cols-5 sm:grid-cols-6 gap-2 max-h-56 overflow-y-auto pr-1">
                    {templates.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setSelectedTemplate(t.id)}
                        className={cx(
                          'rounded-[6px] border p-1 text-center transition',
                          selectedTemplate === t.id ? 'border-brand ring-1 ring-brand' : 'border-line/30 hover:border-line',
                        )}
                      >
                        {t.thumbnail ? (
                          <img src={t.thumbnail} alt={t.name || t.id} loading="lazy" className="w-full aspect-square object-cover rounded-[4px] bg-panel" />
                        ) : (
                          <div className="w-full aspect-square rounded-[4px] bg-panel" />
                        )}
                        <span className="text-[10px] text-muted truncate block mt-1">{t.name || t.id}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {selectedFeature?.params?.length ? (
              <div className="space-y-3">
                {selectedFeature.params.map((p) => {
                  if (p.type === 'select') {
                    return (
                      <div key={p.key}>
                        <label className="block text-sm font-medium mb-1">{p.label}</label>
                        <select
                          className="w-full text-sm bg-panel border border-line/30 rounded-[6px] p-2"
                          value={String(params[p.key] ?? p.default ?? '')}
                          onChange={(e) => {
                            const opt = p.options?.find((o) => String(o.value) === e.target.value)
                            setParams((prev) => ({
                              ...prev,
                              [p.key]: opt && typeof opt.value === 'number' ? Number(e.target.value) : e.target.value,
                            }))
                          }}
                        >
                          {p.options?.map((o) => (
                            <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
                          ))}
                        </select>
                      </div>
                    )
                  }
                  if (p.type === 'text') {
                    return (
                      <div key={p.key}>
                        <label className="block text-sm font-medium mb-1">{p.label}</label>
                        <input
                          type="text"
                          className="w-full text-sm bg-panel border border-line/30 rounded-[6px] p-2"
                          value={String(params[p.key] ?? p.default ?? '')}
                          onChange={(e) => setParams((prev) => ({ ...prev, [p.key]: e.target.value }))}
                        />
                      </div>
                    )
                  }
                  return null
                })}
              </div>
            ) : null}

            {!selectedFeature && (
              <div className="text-xs text-muted">
                Running: <strong>Skin Time Machine</strong> — aging + scan + routine forecast
                <br />Cost: ~42 units per journey
              </div>
            )}
          </div>
        </Card>

        <div className="flex gap-3">
          {!hasKeys && (
            <Badge color="amber">No API keys — using demo mode</Badge>
          )}
          {hasKeys && (
            <Badge color="green">{keys.filter(k => k.state === 'ready').length} key{keys.filter(k => k.state === 'ready').length > 1 ? 's' : ''} ready</Badge>
          )}
        </div>

        <div className="mt-6 flex gap-3">
          {canRun && (
            <>
              <Button onClick={handleRun} disabled={running || !hasKeys} size="lg">
                {running ? <><Spinner size="sm" className="mr-2" /> Running…</> : '🚀 Run with YouCam'}
              </Button>
              <Button variant="secondary" onClick={handleDemo} disabled={running}>
                {running ? <><Spinner size="sm" className="mr-2" /> Generating…</> : '🎬 Demo mode'}
              </Button>
            </>
          )}
          {!canRun && <Button onClick={() => navigate('/settings')} variant="secondary">Add API keys first</Button>}
        </div>

        {running && pipeline && (
          <Card className="mt-6 p-4">
            <h3 className="font-medium mb-3">Pipeline progress</h3>
            <div className="space-y-2">
              {pipeline.steps.map((s, i) => {
                const r = results[s.id]
                const pct = r ? (r.state === 'success' ? 100 : r.state === 'running' ? 50 : 0) : 0
                return (
                  <div key={s.id} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>{r?.label || s.label || s.featureId}</span>
                      <Badge size="sm" color={r?.state === 'success' ? 'green' : r?.state === 'error' ? 'red' : r?.state === 'running' ? 'brand' : 'muted'}>
                        {r?.state || 'idle'}
                      </Badge>
                    </div>
                    <Progress value={pct} />
                    {r?.error && <div className="text-xs text-bad">{r.error}</div>}
                  </div>
                )
              })}
            </div>
          </Card>
        )}

        {showMaskEditor && (
          <Modal onClose={() => setShowMaskEditor(false)} title="Mask editor (coming soon)">
            <p className="text-sm text-muted">Upload a grayscale mask where white = erase, black = keep. Match the source dimensions.</p>
            <input type="file" accept="image/*" onChange={onSelectMask} className="w-full text-sm mt-3" />
          </Modal>
        )}
      </main>
    </div>
  )
}

const Input = ({ type, accept, onChange }: { type: string; accept: string; onChange: (e: any) => void }) => (
  <input type={type} accept={accept} onChange={onChange} className="w-full text-sm file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-panel file:text-ink hover:file:bg-panel/80" />
)
