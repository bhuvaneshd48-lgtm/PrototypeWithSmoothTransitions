import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// utils/supabase/info.tsx is generated when a Supabase project is connected.
const infoModules = import.meta.glob<{ projectId: string; publicAnonKey: string }>('/utils/supabase/info.tsx', { eager: true })
const info = Object.values(infoModules)[0] ?? null

/** Route prefix of the generated Supabase Edge Function server. */
const FUNCTION_ROUTE = 'make-server-82138c68'

export const LANGUAGES = ['English', 'Hindi', 'Bengali', 'Tamil', 'Telugu', 'Marathi', 'Gujarati', 'Kannada', 'Malayalam', 'Punjabi', 'Odia', 'Urdu', 'Assamese', 'Spanish', 'French', 'German', 'Portuguese', 'Italian', 'Russian', 'Arabic', 'Chinese (Simplified)', 'Japanese', 'Korean', 'Indonesian', 'Turkish', 'Vietnamese', 'Thai', 'Swahili'] as const

const LANG_KEY = 'unread-language'
export function getLanguage(): string {
  const l = localStorage.getItem(LANG_KEY)
  return l && (LANGUAGES as readonly string[]).includes(l) ? l : 'English'
}
export function setLanguage(l: string) {
  localStorage.setItem(LANG_KEY, l)
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
  auth: 'Could not start a secure anonymous session. Anonymous sign-ins may be disabled in Supabase Auth settings.',
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

let client: SupabaseClient | null = null

async function accessToken(): Promise<string> {
  if (!info) throw new ApiError('not_connected', MESSAGES.not_connected)
  client ??= createClient(`https://${info.projectId}.supabase.co`, info.publicAnonKey, { auth: { persistSession: true, storageKey: 'unread-auth' } })
  const { data } = await client.auth.getSession()
  if (data.session?.access_token) return data.session.access_token
  const { data: signIn, error } = await client.auth.signInAnonymously().catch(() => ({ data: { session: null }, error: true }))
  // Anonymous sign-ins can be disabled in Supabase; fall back to the public key (server rate-limits by IP).
  if (error || !signIn.session) return info.publicAnonKey
  return signIn.session.access_token
}

type Action = 'analyze' | 'ask' | 'extract'

async function once<T>(action: Action, body: unknown, signal: AbortSignal): Promise<T> {
  const token = await accessToken()
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
    const known = code in MESSAGES ? code : 'server'
    throw new ApiError(known, json?.error?.message || MESSAGES[known])
  }
  if (!json || json.data === undefined) throw new ApiError('invalid_response', MESSAGES.invalid_response)
  return json.data
}

/** Calls the protected Gemini function with one retry for transient failures. */
export async function callGemini<T>(action: Action, body: unknown, signal: AbortSignal): Promise<T> {
  if (!backendConfigured) throw new ApiError('not_connected', MESSAGES.not_connected)
  try {
    return await once<T>(action, body, signal)
  } catch (e) {
    const transient = e instanceof ApiError && (e.code === 'network' || e.code === 'server' || e.code === 'timeout')
    if (!transient || signal.aborted) throw e
    await new Promise((r) => setTimeout(r, 900))
    return once<T>(action, body, signal)
  }
}
