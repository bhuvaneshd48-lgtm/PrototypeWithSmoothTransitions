import { ServiceError } from './errors.ts'
import type { Part } from './request.ts'

const MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-flash-latest', 'gemini-2.0-flash', 'gemini-2.0-flash-lite']
type ProviderResponse = {
  promptFeedback?: { blockReason?: string }
  candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>
}

/** One total deadline across all fallbacks; model metadata belongs to this request. */
export async function generate(
  key: string,
  parts: Part[],
  system: string,
  options: { fetch?: typeof fetch; signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<{ data: unknown; model: string }> {
  if (!key.trim()) throw new ServiceError(503, 'not_connected', 'GEMINI_API_KEY is not set on the server.')
  const controller = new AbortController()
  const cancel = () => controller.abort()
  options.signal?.addEventListener('abort', cancel, { once: true })
  if (options.signal?.aborted) cancel()
  const timer = setTimeout(cancel, options.timeoutMs ?? 90_000)
  let best: ServiceError | null = null
  try {
    for (const model of MODELS) {
      if (controller.signal.aborted) throw new ServiceError(504, 'timeout', 'Gemini took too long to respond.')
      let response: Response
      try {
        response = await (options.fetch ?? fetch)(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: 'user', parts }],
            generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
          }),
          signal: controller.signal,
        })
      } catch {
        if (controller.signal.aborted) throw new ServiceError(504, 'timeout', 'Gemini took too long to respond.')
        best = new ServiceError(502, 'network', 'Could not reach Gemini. Please retry.')
        continue
      }
      if (!response.ok) {
        // Do not log/return upstream bodies: they can contain submitted content.
        await response.body?.cancel()
        const status = response.status
        if (status === 401 || status === 403) throw new ServiceError(502, 'server', 'Gemini rejected the server credentials. Check Supabase secrets.')
        if (status === 400) throw new ServiceError(400, 'server', 'Gemini could not process this input. Try a shorter range or different files.')
        const error = status === 429
          ? new ServiceError(429, 'rate_limit', 'Gemini quota reached. Wait a few minutes and retry.')
          : new ServiceError(503, 'server', 'Gemini is temporarily unavailable. Please retry.')
        if (status !== 404 || !best) best = error
        if (status === 404 || status === 429 || status >= 500) continue
        throw error
      }
      const json = await response.json().catch(() => null) as ProviderResponse | null
      if (controller.signal.aborted) throw new ServiceError(504, 'timeout', 'Gemini took too long to respond.')
      const candidate = json?.candidates?.[0]
      if (json?.promptFeedback?.blockReason || candidate?.finishReason === 'SAFETY') throw new ServiceError(422, 'safety', 'Gemini declined to process this content.')
      if (!candidate || candidate.finishReason !== 'STOP' || !Array.isArray(candidate.content?.parts)) throw new ServiceError(502, 'invalid_response', 'Gemini returned an incomplete response.')
      const text = candidate.content.parts.filter((part) => part && !part.thought && typeof part.text === 'string').map((part) => part.text).join('').replace(/^```(?:json)?\s*|\s*```$/g, '')
      try {
        const data: unknown = JSON.parse(text)
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error()
        return { data, model }
      } catch {
        throw new ServiceError(502, 'invalid_response', 'Gemini returned malformed JSON.')
      }
    }
    throw best ?? new ServiceError(503, 'server', 'Gemini is temporarily unavailable.')
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', cancel)
  }
}
