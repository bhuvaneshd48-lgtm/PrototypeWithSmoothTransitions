import { Hono } from 'npm:hono@4.13.13'
import { cors } from 'npm:hono@4.13.13/cors'
import { createClient } from 'npm:@supabase/supabase-js@2.117.3'
import { ServiceError } from './errors.ts'
import { readJson, validateRequest } from './request.ts'
import { buildPrompt } from './prompts.ts'
import { generate } from './gemini.ts'

const PREFIX = '/make-server-82138c68'
const app = new Hono()
const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

app.use('*', cors({
  origin: '*',
  allowHeaders: ['Content-Type', 'Authorization', 'apikey'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  maxAge: 600,
}))
app.use('*', async (c, next) => {
  c.header('Cache-Control', 'no-store')
  c.header('X-Content-Type-Options', 'nosniff')
  await next()
})
app.onError((error, c) => {
  if (error instanceof ServiceError) return c.json({ error: { code: error.code, message: error.message } }, error.status)
  // Never log message bodies, bearer tokens, provider errors, or secrets.
  console.error('Unread request failed', { type: error.name })
  return c.json({ error: { code: 'server', message: 'The server hit an unexpected error. Please retry.' } }, 503)
})
app.notFound((c) => c.json({ error: { code: 'server', message: 'Unknown endpoint.' } }, 404))
app.get(`${PREFIX}/health`, (c) => c.json({ status: 'ok', gemini: !!Deno.env.get('GEMINI_API_KEY')?.trim(), version: 'unread-api-v2' }))

app.post(`${PREFIX}/:action`, async (c) => {
  const action = c.req.param('action')
  if (action !== 'analyze' && action !== 'ask' && action !== 'extract') return c.notFound()
  const token = c.req.header('Authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1]
  if (!token) throw new ServiceError(401, 'auth', 'A valid authorization token is required.')
  // Verify real users ourselves. Only the configured public key gets the IP fallback.
  let identity: string
  if (token === Deno.env.get('SUPABASE_ANON_KEY')) {
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('cf-connecting-ip')
    if (!ip) throw new ServiceError(401, 'auth', 'Client identity could not be verified.')
    identity = `ip:${ip}`
  } else {
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data.user) throw new ServiceError(401, 'auth', 'A valid authorization token is required.')
    identity = `user:${data.user.id}`
  }
  const request = validateRequest(action, await readJson(c.req.raw))
  // Hash identities before persistence; database stores no chats or raw IPs.
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity))
  const subject = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  const { data: allowed, error } = await supabase.rpc('unread_consume_rate_limit', { p_subject: subject })
  if (error || typeof allowed !== 'boolean') throw new ServiceError(503, 'server', 'Request protection is unavailable. Please retry later.')
  if (!allowed) throw new ServiceError(429, 'rate_limit', 'Request limit reached. Wait a few minutes.')
  const { parts, system } = buildPrompt(request)
  const result = await generate(Deno.env.get('GEMINI_API_KEY') ?? '', parts, system, { signal: c.req.raw.signal })
  return c.json({ data: action === 'analyze' ? { analysis: result.data, model: result.model } : result.data })
})

export default app
