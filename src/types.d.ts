// Type augmentations for browser APIs not in default TS DOM lib
declare global {
  interface HTMLCanvasElement {
    convertToBlob(options?: BlobPropertyBitInit): Promise<Blob | null>
  }
}
