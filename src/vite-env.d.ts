/// <reference types="vite/client" />
declare module '*.css'
declare module '*.png'
declare module '*.jpg'
declare module '*.svg'

declare global {
  interface HTMLCanvasElement {
    convertToBlob(options?: BlobPropertyBag): Promise<Blob | null>
  }
}
declare module '*.png'
declare module '*.jpg'
declare module '*.svg'
