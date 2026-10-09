export const VISION_LIMITS = { maxImages: 10, maxPdfs: 1, maxBytes: 15 * 1024 * 1024, maxEdge: 2000 }

export type VisionPart = { mimeType: string; data: string; name: string; bytes: number }

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

async function downscale(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const longest = Math.max(bitmap.width, bitmap.height)
  if (longest <= VISION_LIMITS.maxEdge) {
    bitmap.close()
    return file
  }
  const scale = VISION_LIMITS.maxEdge / longest
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), 'image/jpeg', 0.88))
}

export async function prepareVisionParts(files: File[]): Promise<VisionPart[]> {
  const parts: VisionPart[] = []
  for (const f of files) {
    const blob = f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf') ? f : await downscale(f)
    const mimeType = blob === f ? f.type || 'application/pdf' : 'image/jpeg'
    parts.push({ mimeType, data: toBase64(await blob.arrayBuffer()), name: f.name, bytes: blob.size })
  }
  const total = parts.reduce((s, p) => s + p.bytes, 0)
  if (total > VISION_LIMITS.maxBytes) throw new Error('These files are larger than 15 MB combined. Remove some and try again.')
  return parts
}

export function checkVisionSelection(files: File[]): string | null {
  const pdfs = files.filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
  const images = files.length - pdfs.length
  if (pdfs.length > 1 || (pdfs.length && images)) return 'Import one PDF at a time, or up to 10 screenshots.'
  if (images > VISION_LIMITS.maxImages) return 'Import up to 10 screenshots at a time.'
  return null
}
