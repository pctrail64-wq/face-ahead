import { useRef, useEffect, useState, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Button, Card } from '../components/ui'

/**
 * Mask editor for the generative-fill (object removal) feature.
 * White = remove, black = keep, gray = partial.
 * Uses an HTML canvas with a single RGBA buffer.
 */
export function MaskEditor() {
  const navigate = useNavigate()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement>(new Image())
  const [brushSize, setBrushSize] = useState(40)
  const [mode, setMode] = useState<'erase' | 'keep'>('erase')
  const [imgLoaded, setImgLoaded] = useState(false)
  const [imgSrc, setImgSrc] = useState<string | null>(null)
  const drawingRef = useRef(false)

  const loadFromStorage = () => {
    const stored = sessionStorage.getItem('face-ahead-mask-src')
    if (stored) setImgSrc(stored)
  }

  useEffect(() => { loadFromStorage() }, [])

  const onImgLoad = useCallback(() => {
    if (!canvasRef.current || !imgSrc) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')!
    const img = imgRef.current
    canvas.width = img.width
    canvas.height = img.height
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    // Start with a fully black (keep) mask
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.globalCompositeOperation = 'source-over'
    ctx.drawImage(img, 0, 0)
    // Mask layer: start as black
    ctx.globalCompositeOperation = 'source-over'
    const maskData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const mask = ctx.createImageData(canvas.width, canvas.height)
    mask.data.fill(0) // all black = keep everything
    ctx.putImageData(mask, 0, 0)
    // Draw image normally
    ctx.globalCompositeOperation = 'source-over'
    ctx.drawImage(img, 0, 0)
    setImgLoaded(true)
  }, [imgSrc])

  useEffect(() => {
    if (imgSrc) {
      imgRef.current.onload = onImgLoad
      imgRef.current.src = imgSrc
    }
  }, [imgSrc, onImgLoad])

  const startDraw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return
    drawingRef.current = true
    draw(e)
  }

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')!
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    // Draw on a separate mask overlay — here we use white for erase
    ctx.globalCompositeOperation = mode === 'erase' ? 'destination-out' : 'destination-in'
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(x, y, brushSize, 0, Math.PI * 2)
    ctx.fill()
  }

  const stopDraw = () => {
    drawingRef.current = false
  }

  const exportMask = () => {
    if (!canvasRef.current) return
    canvasRef.current.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob)
        sessionStorage.setItem('face-ahead-mask-png', url)
        navigate('/run?feature=object-removal')
      }
    }, 'image/png')
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    const url = URL.createObjectURL(f)
    setImgSrc(url)
    sessionStorage.setItem('face-ahead-mask-src', url)
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-line/30">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <Link to="/"><h1 className="text-3xl tracking-wide">FACE <span className="text-brand">AHEAD</span></h1></Link>
          <Link to="/run" className="text-sm text-muted hover:text-ink">Back to Run</Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <h2 className="text-2xl font-bold mb-6">Mask Editor</h2>
        <p className="text-sm text-muted mb-4">
          Paint <span className="text-bad font-medium">white</span> to erase, <span className="text-muted font-medium">black</span> to keep.
          The mask must match your source photo dimensions.
        </p>

        {!imgSrc ? (
          <Card className="p-8 text-center">
            <input type="file" accept="image/*" onChange={handleFileUpload} />
          </Card>
        ) : (
          <>
            <div className="mb-4 flex gap-2">
              <Button variant={mode === 'erase' ? 'secondary' : 'ghost'} onClick={() => setMode('erase')}>🧹 Erase</Button>
              <Button variant={mode === 'keep' ? 'secondary' : 'ghost'} onClick={() => setMode('keep')}>✓ Keep</Button>
              <input
                type="range" min={10} max={200} value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                className="w-32"
              />
              <span className="text-sm text-muted">{brushSize}px</span>
              <Button variant="ghost" onClick={() => {
                if (canvasRef.current) {
                  const ctx = canvasRef.current.getContext('2d')!
                  ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
                  ctx.fillStyle = '#000000'
                  ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height)
                  ctx.globalCompositeOperation = 'source-over'
                  if (imgRef.current.complete) ctx.drawImage(imgRef.current, 0, 0)
                }
              }}>Reset mask</Button>
            </div>

            <Card className="p-2">
              <canvas
                ref={canvasRef}
                width={512}
                height={512}
                className="w-full border border-line/30 rounded"
                onMouseDown={startDraw}
                onMouseMove={draw}
                onMouseUp={stopDraw}
                onMouseLeave={stopDraw}
              />
            </Card>

            <div className="mt-4 flex gap-3">
              <Button variant="secondary" onClick={() => navigate('/run')}>Cancel</Button>
              <Button onClick={exportMask} disabled={!imgLoaded}>Use mask</Button>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
