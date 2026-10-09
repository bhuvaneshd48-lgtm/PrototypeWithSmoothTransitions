import type { SupabaseClient } from '@supabase/supabase-js'
import { LANGUAGES, supportedLanguage } from '../../supabase/functions/_shared/languages'
export { LANGUAGES }

// utils/supabase/info.tsx is generated when a Supabase project is connected.
const infoModules = import.meta.glob<{ projectId: string; publicAnonKey: string }>('/utils/supabase/info.tsx', { eager: true })
const info = Object.values(infoModules)[0] ?? null

/** Route prefix of the generated Supabase Edge Function server. */
const FUNCTION_ROUTE = 'make-server-82138c68'

const LANG_KEY = 'unread-language'
let sessionLanguage: string | null = null
export function getLanguage(): string {
  if (sessionLanguage) return sessionLanguage
  try {
    const l = localStorage.getItem(LANG_KEY)
    return supportedLanguage(l)
  } catch {
    return 'English'
  }
}
export function setLanguage(l: string) {
  sessionLanguage = supportedLanguage(l)
  try {
    localStorage.setItem(LANG_KEY, sessionLanguage)
  } catch {
    // Storage may be disabled; language remains available in React state.
  }
}

export const backendConfigured = !!info?.projectId && !!info?.publicAnonKey

export type ApiErrorCode = 'not_connected' | 'auth' | 'rate_limit' | 'too_large' | 'safety' | 'invalid_response' | 'network' | 'timeout' | 'server' | 'aborted'

export class ApiError extends Error {
  constructor(
    public code: ApiErrorCode,
    message: string,
  ) {
    super(message)
  }
}

const MESSAGES: Record<ApiErrorCode, string> = {
  not_connected: 'The Gemini backend is not connected yet. Connect Supabase and add GEMINI_API_KEY to enable analysis.',
  auth: 'The server rejected the connection. Redeploy the Edge Function from Settings and try again.',
  rate_limit: 'You have reached the request limit for now. Wait a few minutes and try again.',
  too_large: 'This conversation is too large for one request. Choose a shorter range.',
  safety: 'Gemini declined to process this content. Try masking or removing sensitive parts.',
  invalid_response: 'Gemini returned a response that could not be verified against your messages. Try again.',
  network: 'Could not reach the server. Check your connection and retry.',
  timeout: 'Gemini took too long to respond. Try again or choose a shorter range.',
  server: 'The server hit an unexpected error. Your imported messages are safe; retry when ready.',
  aborted: 'Request cancelled.',
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message
  return MESSAGES.server
}

// Kept on globalThis so hot reloads reuse one auth client instead of creating duplicates.
const g = globalThis as { __unreadSupabase?: SupabaseClient }

async function accessToken(): Promise<string> {
  if (!info) throw new ApiError('not_connected', MESSAGES.not_connected)
  // Loaded on first AI request only; keeps ~200 kB out of the initial bundle.
  const { createClient } = await import('@supabase/supabase-js')
  g.__unreadSupabase ??= createClient(`https://${info.projectId}.supabase.co`, info.publicAnonKey, { auth: { persistSession: true, storageKey: 'unread-auth' } })
  const client = g.__unreadSupabase
  const { data } = await client.auth.getSession()
  if (data.session?.access_token) return data.session.access_token
  const { data: signIn, error } = await client.auth.signInAnonymously().catch(() => ({ data: { session: null }, error: true }))
  // Anonymous sign-ins can be disabled in Supabase; fall back to the public key (server rate-limits by IP).
  if (error || !signIn.session) return info.publicAnonKey
  return signIn.session.access_token
}

type Action = 'analyze' | 'ask' | 'extract'

async function once<T>(action: Action, body: unknown, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw new ApiError('aborted', MESSAGES.aborted)
  const token = await accessToken()
  if (signal.aborted) throw new ApiError('aborted', MESSAGES.aborted)
  let res: Response
  try {
    res = await fetch(`https://${info!.projectId}.supabase.co/functions/v1/${FUNCTION_ROUTE}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: info!.publicAnonKey },
      body: JSON.stringify({ ...(body as object), language: getLanguage() }),
      signal,
    })
  } catch (e) {
    if (signal.aborted) throw new ApiError('aborted', MESSAGES.aborted)
    throw new ApiError('network', MESSAGES.network)
  }
  const json = (await res.json().catch(() => null)) as { data?: T; error?: { code?: string; message?: string } } | null
  if (!res.ok) {
    const code = (json?.error?.code as ApiErrorCode) ?? (res.status === 401 ? 'auth' : res.status === 429 ? 'rate_limit' : res.status === 413 ? 'too_large' : 'server')
    const known = Object.prototype.hasOwnProperty.call(MESSAGES, code) ? code : 'server'
    throw new ApiError(known, known === 'auth' ? MESSAGES.auth : json?.error?.message || MESSAGES[known])
  }
  if (!json || json.data === undefined) throw new ApiError('invalid_response', MESSAGES.invalid_response)
  return json.data
}

/** Retries transport failures only; provider fallbacks belong to the server. */
export async function callGemini<T>(action: Action, body: unknown, signal: AbortSignal): Promise<T> {
  if (!backendConfigured) throw new ApiError('not_connected', MESSAGES.not_connected)
  try {
    return await once<T>(action, body, signal)
  } catch (e) {
    const transient = e instanceof ApiError && e.code === 'network'
    if (!transient || signal.aborted) throw e
    await new Promise<void>((resolve, reject) => {
      const cancel = () => {
        clearTimeout(timer)
        signal.removeEventListener('abort', cancel)
        reject(new ApiError('aborted', MESSAGES.aborted))
      }
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', cancel)
        resolve()
      }, 900)
      signal.addEventListener('abort', cancel, { once: true })
      if (signal.aborted) cancel()
    })
    return once<T>(action, body, signal)
  }
}
