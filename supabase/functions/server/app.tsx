// Unread API: routes, validation, rate limiting and Gemini calls. index.tsx only boots this app.
import { Hono, type Context } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";

export const app = new Hono();
const PREFIX = "/make-server-82138c68";
const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-flash-latest", "gemini-2.0-flash", "gemini-2.0-flash-lite"];
const MAX_CHARS = 400_000;
const MAX_MESSAGES = 20_000;
const MAX_FILE_B64 = 15_000_000; // ~11 MB decoded per file
type GeminiResult = { data: unknown; model: string } | { error: [number, string, string] };
const RATE = { windowMs: 10 * 60 * 1000, max: 30 };

app.use("*", logger(console.log));
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "apikey"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

const fail = (c: Context, status: number, code: string, message: string) => c.json({ error: { code, message } }, status);

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// Supabase's gateway already rejects requests without a valid project key/JWT before they reach here.
// Signed-in users are limited per account; everyone else (public key) per client IP.
async function userId(c: Context): Promise<string> {
  const token = c.req.header("Authorization")?.split(" ")[1];
  if (token) {
    const { data } = await supabase.auth.getUser(token).catch(() => ({ data: { user: null } }));
    if (data.user) return data.user.id;
  }
  const ip = c.req.header("x-forwarded-for")?.split(",")[0].trim() || c.req.header("cf-connecting-ip") || "unknown";
  return `ip:${ip}`;
}

async function rateLimited(uid: string): Promise<boolean> {
  const key = `rate:${uid}`;
  const now = Date.now();
  try {
    const stored = await kv.get(key);
    const hits = (Array.isArray(stored) ? (stored as number[]) : []).filter((t) => now - t < RATE.windowMs);
    if (hits.length >= RATE.max) return true;
    hits.push(now);
    await kv.set(key, hits);
  } catch (e) {
    // Fail open: a storage hiccup should not block every AI request.
    console.log("Rate limit storage error", e);
  }
  return false;
}

const LANGUAGE_RE = /^[\p{L} ()-]{2,40}$/u;
function languageRule(lang: unknown): string {
  const l = typeof lang === "string" && LANGUAGE_RE.test(lang) ? lang : "English";
  return `Write every human-readable output string (brief, text, reasons, labels, answers) in ${l}. Keep message IDs, enum values, names, and JSON keys exactly as specified, untranslated.`;
}

type Msg = { id: string; sender: string | null; timestamp: string | null; text: string };
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : null);
function sanitizeMessages(raw: unknown): Msg[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_MESSAGES).flatMap((m, i) => {
    const text = str(m?.text, 20_000);
    if (!text) return [];
    return [{ id: str(m?.id, 32) || `m${i + 1}`, sender: str(m?.sender, 120), timestamp: str(m?.timestamp, 64), text }];
  });
}
const transcript = (ms: Msg[]) => ms.map((m) => `[${m.id}] ${m.timestamp ?? "?"} | ${m.sender ?? "Unknown"}: ${m.text}`).join("\n");

const ANALYZE_PROMPT = `You help a returning group-chat member catch up. Use ONLY the messages provided; never invent facts.
Every item must cite the message IDs (like "m12") that support it in citationIds.
Urgency: low | medium | high | critical. Any level above low needs a short urgencyReason grounded in the messages (deadlines, blockers, direct requests).
Return JSON: {
 "brief": string (2-4 sentences),
 "highlights": [{text, citationIds, confidence, urgency, urgencyReason}],
 "decisions": [same],
 "actionItems": [{text, citationIds, confidence, urgency, urgencyReason, owner, dueAt, status: "open"|"done"|"unclear"}],
 "mentions": [same as highlights; people being asked for things, deadlines],
 "topicEvents": [{label, text, timestamp, citationIds, confidence, urgency, urgencyReason}],
 "messageUrgencies": [{messageId, urgency: "medium"|"high"|"critical", reason, confidence}]
}
confidence is "high"|"medium"|"low". Use null for unknown owner/dueAt/timestamp/urgencyReason.`;

const ASK_PROMPT = `Answer the user's question using ONLY the provided messages. Cite supporting message IDs.
If the answer is not in the messages, return status "not_found".
Return JSON: {"status": "answered"|"not_found", "answer": string, "citationIds": string[], "urgency": "low"|"medium"|"high"|"critical", "urgencyReason": string|null}`;

const EXTRACT_PROMPT = `Transcribe the chat messages visible in these screenshots/PDF, in chronological order. Do not summarize or invent.
Return JSON: {"messages": [{"sender": string|null, "timestamp": string|null, "text": string}], "warnings": string[]}
Add a warning for anything cut off or unreadable. Keep message text in its original language.`;

async function callModel(model: string, key: string, parts: unknown[], system: string): Promise<{ data: unknown } | { error: [number, string, string]; retryNext?: boolean }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90_000);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
      }),
      signal: ctrl.signal,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const msg: string = json?.error?.message ?? `HTTP ${res.status}`;
      const reason: string = json?.error?.status ?? "";
      console.log("Gemini error", model, res.status, JSON.stringify(json));
      if (/API key not valid|API_KEY_INVALID/i.test(msg) || reason === "PERMISSION_DENIED" || res.status === 403)
        return { error: [502, "server", `Gemini rejected the API key: ${msg}. Check GEMINI_API_KEY in Supabase secrets.`] };
      if (res.status === 400 && /token|too large|exceeds/i.test(msg)) return { error: [413, "too_large", "This conversation is too large for one request."] };
      // Model unavailable, overloaded, or quota for this model exhausted: try the next model.
      const retryNext = res.status === 404 || res.status === 429 || res.status >= 500;
      if (res.status === 429) return { error: [429, "rate_limit", `Gemini quota/rate limit: ${msg}`], retryNext };
      if (res.status === 503) return { error: [503, "server", `Gemini is overloaded right now (high demand). Wait a minute and press Retry. (${model}, 503)`], retryNext };
      return { error: [502, "server", `Gemini error (${model}, ${res.status}): ${msg}`], retryNext };
    }
    const cand = json?.candidates?.[0];
    if (!cand || cand.finishReason === "SAFETY" || json?.promptFeedback?.blockReason) return { error: [422, "safety", "Gemini declined to process this content."] };
    const text = (cand.content?.parts ?? []).map((p: any) => p.text ?? "").join("").replace(/^```(?:json)?\s*|\s*```$/g, "");
    try {
      return { data: JSON.parse(text) };
    } catch {
      return { error: [502, "invalid_response", "Gemini returned malformed JSON."] };
    }
  } catch (e) {
    if (ctrl.signal.aborted) return { error: [504, "timeout", "Gemini took too long to respond."] };
    console.log("Gemini fetch failure", e);
    return { error: [502, "network", `Could not reach Gemini: ${e}`], retryNext: true };
  } finally {
    clearTimeout(timer);
  }
}

async function gemini(parts: unknown[], system: string): Promise<GeminiResult> {
  const key = Deno.env.get("GEMINI_API_KEY")?.trim();
  if (!key) return { error: [503, "not_connected", "GEMINI_API_KEY is not set on the server."] };
  // Keep the most informative failure: a 404 "model not found" should never hide a real quota/overload error.
  let best: { error: [number, string, string] } | null = null;
  const errors: string[] = [];
  for (const model of MODELS) {
    let r = await callModel(model, key, parts, system);
    // Overloaded (503): back off and retry the same model twice before moving on.
    for (const wait of [2000, 5000]) {
      if (!("error" in r && r.error[2].includes(", 503)"))) break;
      await new Promise((res) => setTimeout(res, wait));
      r = await callModel(model, key, parts, system);
    }
    if ("data" in r) return { data: r.data, model };
    errors.push(`${model}: ${r.error[2]}`);
    if (!best || (best.error[2].includes(", 404)") && !r.error[2].includes(", 404)"))) best = { error: r.error };
    if (!r.retryNext) return { error: r.error };
  }
  console.log("All Gemini models failed", errors);
  return best!;
}

app.get(`${PREFIX}/health`, (c) => c.json({ status: "ok", gemini: !!Deno.env.get("GEMINI_API_KEY") }));

app.post(`${PREFIX}/:action`, async (c) => {
  const action = c.req.param("action");
  if (!["analyze", "ask", "extract"].includes(action)) return fail(c, 404, "server", "Unknown action");
  const uid = await userId(c);
  if (await rateLimited(uid)) return fail(c, 429, "rate_limit", "Request limit reached. Wait a few minutes.");

  const body = await c.req.json().catch(() => null);
  if (!body) return fail(c, 400, "server", "Invalid JSON body.");
  const lang = languageRule(body.language);

  let result;
  if (action === "extract") {
    const files = Array.isArray(body.files) ? body.files.slice(0, 10) : [];
    const ok = files.every(
      (f: any) => typeof f?.data === "string" && f.data.length <= MAX_FILE_B64 && /^(image\/(png|jpe?g|webp|heic|heif)|application\/pdf)$/.test(f?.mimeType ?? ""),
    );
    if (!files.length || !ok) return fail(c, 400, "server", "No valid files supplied.");
    result = await gemini([...files.map((f: any) => ({ inlineData: { mimeType: f.mimeType, data: f.data } })), { text: "Transcribe these." }], EXTRACT_PROMPT);
  } else {
    const messages = sanitizeMessages(body.messages);
    if (!messages.length) return fail(c, 400, "server", "No messages supplied.");
    const t = transcript(messages);
    if (t.length > MAX_CHARS) return fail(c, 413, "too_large", "This conversation is too large for one request.");
    if (action === "analyze") {
      result = await gemini([{ text: `Messages:\n${t}` }], `${ANALYZE_PROMPT}\n${lang}`);
      if ("data" in result) return c.json({ data: { analysis: result.data, model: result.model } });
    } else {
      const q = typeof body.question === "string" ? body.question.slice(0, 1000) : "";
      if (!q) return fail(c, 400, "server", "Question is empty.");
      const prev = typeof body.previousQuestion === "string" ? `\nPrevious question (context only): ${body.previousQuestion.slice(0, 500)}` : "";
      result = await gemini([{ text: `Messages:\n${t}${prev}\n\nQuestion: ${q}` }], `${ASK_PROMPT}\n${lang}`);
    }
  }
  if ("error" in result) {
    const [status, code, message] = result.error;
    return fail(c, status, code, message);
  }
  return c.json({ data: result.data });
});

