/**
 * Camera capture — minimal getUserMedia wrapper.
 * Returns a Blob and cleans up the stream.
 */

export async function getVideoStream(facing: 'user' | 'environment' = 'user'): Promise<MediaStream> {
  return (navigator.mediaDevices as any).getUserMedia?.({
    video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
  }) || Promise.reject(new Error('Camera not available'))
}

export function captureFrame(video: HTMLVideoElement, maxWidth = 1080): Promise<Blob> {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const ratio = Math.min(1, maxWidth / video.videoWidth)
  canvas.width = video.videoWidth * ratio
  canvas.height = video.videoHeight * ratio
  ctx.save()
  ctx.scale(-1, 1)
  ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height)
  ctx.restore()
  return new Promise((res) => (canvas as any).convertToBlob({ type: 'image/jpeg', quality: 0.9 }).then((b: Blob) => res(b)))
}

export function stopStream(stream: MediaStream) {
  for (const track of stream.getTracks()) track.stop()
}

export function dataURLToBlob(dataurl: string): Blob {
  const parts = dataurl.split(',')
  const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg'
  const bstr = atob(parts[1])
  let n = bstr.length
  const u8 = new Uint8ClampedArray(n)
  while (n--) u8[n] = bstr.charCodeAt(n)
  return new Blob([u8], { type: mime })
}
