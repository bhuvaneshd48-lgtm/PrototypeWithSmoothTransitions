// Deno HTTP integration tests with fake credentials and fully mocked transport.
Deno.env.set('SUPABASE_URL', 'https://example.test')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key')
Deno.env.set('SUPABASE_ANON_KEY', 'test-public-key')
Deno.env.set('GEMINI_API_KEY', 'test-provider-key')
const { default: app } = await import('../app.ts')
const prefix = '/make-server-82138c68'
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message)
}
function request(body: unknown, token = 'test-public-key') {
  return new Request(`https://example.test${prefix}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'x-forwarded-for': '192.0.2.1' },
    body: JSON.stringify(body),
  })
}
const body = { messages: [{ id: 'm1', sender: null, timestamp: null, text: 'Test fixture' }] }

Deno.test('HTTP health, unknown route, CORS, and missing authorization', async () => {
  const health = await app.request(`${prefix}/health`)
  assert(health.status === 200, 'health status')
  assert((await health.json()).version === 'unread-api-v2', 'bootstrap version')
  const unknown = await app.request(`${prefix}/missing`, { method: 'POST' })
  assert(unknown.status === 404, 'unknown route')
  await unknown.body?.cancel()
  const unauthorized = await app.request(`${prefix}/analyze`, { method: 'POST' })
  assert(unauthorized.status === 401, 'missing authorization')
  await unauthorized.body?.cancel()
  const preflight = await app.request(`${prefix}/analyze`, { method: 'OPTIONS', headers: { Origin: 'https://example.test', 'Access-Control-Request-Method': 'POST' } })
  assert(preflight.headers.get('Access-Control-Allow-Headers')?.toLowerCase().includes('apikey'), 'apikey preflight')
  await preflight.body?.cancel()
})

Deno.test('HTTP validates inputs before charging quota and fails closed on RPC failure', async () => {
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = () => { calls++; return Promise.resolve(Response.json({ message: 'private detail' }, { status: 500 })) }
  try {
    const invalid = await app.fetch(request({ messages: [null] }))
    assert(invalid.status === 400 && calls === 0, 'input rejected without provider/database traffic')
    await invalid.body?.cancel()
    const unavailable = await app.fetch(request(body))
    assert(unavailable.status === 503, 'rate protection fails closed')
    assert(!(await unavailable.text()).includes('private detail'), 'safe error')
  } finally { globalThis.fetch = original }
})

Deno.test('HTTP atomically consumes quota, wraps analysis, and does not call Gemini when denied', async () => {
  const original = globalThis.fetch
  let allowed = true
  let providerCalls = 0
  globalThis.fetch = (input, init) => {
    const url = String(input)
    if (url.includes('/rpc/unread_consume_rate_limit')) {
      const payload = JSON.parse(String(init?.body))
      assert(/^[a-f0-9]{64}$/.test(payload.p_subject), 'only hashed identity reaches RPC')
      return Promise.resolve(Response.json(allowed))
    }
    assert(url.includes('generativelanguage.googleapis.com'), 'unexpected transport')
    providerCalls++
    return Promise.resolve(Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"brief":"Test"}' }] } }] }))
  }
  try {
    const result = await app.fetch(request(body))
    assert(result.status === 200, 'analysis status')
    assert(result.headers.get('Cache-Control') === 'no-store', 'no AI response caching')
    const json = await result.json()
    assert(json.data.model === 'gemini-2.5-flash' && json.data.analysis.brief === 'Test', 'compatible response envelope')
    allowed = false
    const denied = await app.fetch(request(body))
    assert(denied.status === 429 && providerCalls === 1, 'quota checked before Gemini')
    await denied.body?.cancel()
  } finally { globalThis.fetch = original }
})
