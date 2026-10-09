# prompt.md — AI-Assisted Development Log for **Unread**

> This file records how **Unread** was built with AI assistance during the vibe coding hackathon.
> It is kept honest: prompts are quoted verbatim where the exact text is available. Where only a summary of an earlier session exists, the entry is marked **(summarized, not verbatim)**. No API keys, passwords or secrets appear in this file.
>
> **Note on timing:** the hackathon brief asks for this file before coding begins. It was created *after* the MVP was built, so it documents the process retroactively and will be kept up to date from here on.

---

## 1. Project Overview

**Problem.** Students and project teams come back to group chats (WhatsApp and similar) with hundreds of unread messages. Deadlines, decisions and requests aimed at them get lost among memes and side conversations. Scrolling back is slow, and it's easy to miss what actually matters.

**Solution.** **Unread** is a catch-up web app. You import a real conversation, and Gemini returns a short brief, prioritized action items, decisions, mentions/deadlines and a timeline. Every claim is linked to the exact source messages. An ambient background shifts from calm green to amber to red based on the urgency of the item you're focused on.

**Target users.** Students, project teams, club or society members, and anyone returning to a busy group chat.

**Key features (implemented)**
- Import by paste, `.txt`, `.json`, WhatsApp `.zip` export, screenshots/PDF (Gemini Vision transcription), and the PWA "Share to Unread" target on Android.
- **Local privacy masking:** emails, phone numbers and custom terms are replaced with tokens (`[EMAIL_1]`, …) on the device before anything is sent to Gemini, then swapped back locally.
- **Citation-grounded AI:** summaries, urgency classification and Q&A cite message IDs. The client validates every citation and drops anything it can't verify.
- **Ambient urgency:** the background colour follows the urgency of the focused item (low → medium → high → critical).
- Lenses (All / For me / Urgent / Decisions / Tasks) and depth (30 sec / 2 min / Deep read).
- **Ask:** questions answered only from the conversation, with citations or an explicit "not found".
- **Multi-language output:** 28 languages, including Hindi, Bengali, Tamil, Telugu, Marathi, Gujarati, Kannada, Malayalam, Punjabi, Odia, Urdu and Assamese.
- **"Since I last read":** re-importing a chat analyses only the messages that are new since the previous import. Other ranges: whole chat, last 24 h, last 7 days, last 100 messages.
- **Copy / Share catch-up:** a clean text summary to paste back into the group.
- Device-only history (IndexedDB), dark mode by default with a light toggle, neon "game-style" glow and light sweeps, Lenis smooth scrolling, a 3D hero and a curtain transition between views.

---

## 2. Tech Stack & Architecture

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript 5.7, Vite 8 |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`), CSS custom properties for the theme and urgency tokens |
| Motion | `motion` (Framer Motion), `lenis` smooth scrolling |
| Icons | `lucide-react` |
| Archive parsing | `fflate` (WhatsApp `.zip`) |
| Storage | IndexedDB (device-only), `localStorage` for preferences and language |
| Backend | Supabase Edge Function (Deno + Hono) at `supabase/functions/server/index.tsx`, KV store for rate limiting |
| AI | Google Gemini API (`generateContent`, JSON output), fallback chain `gemini-2.5-flash` → `gemini-2.5-flash-lite` → `gemini-flash-latest` → `gemini-2.0-flash` → `gemini-2.0-flash-lite` |
| PWA | `public/manifest.webmanifest`, `public/sw.js` (share target) |
| Tests | Vitest (`src/lib/__tests__/core.test.ts`) |
| Built with | Figma Make (AI coding agent) |

**Data flow**
```
Import (paste / file / zip / share / screenshots)
   → parsers (src/lib/parsers) → Review screen (choose masking)
   → privacy mask on device (src/lib/privacy.ts)
   → Supabase Edge Function  /make-server-82138c68/{analyze|ask|extract}
        · per-user / per-IP rate limit (30 req / 10 min)
        · GEMINI_API_KEY held as a server secret, never sent to the browser
        · output language rule injected into the system instruction
   → Gemini (JSON) → client validation of citations (src/lib/validate.ts)
   → unmask locally → Workspace UI + IndexedDB history
```

**Key files:** `src/App.tsx`, `src/lib/api.ts`, `src/lib/privacy.ts`, `src/lib/validate.ts`, `src/lib/urgency.ts`, `src/lib/range.ts`, `src/lib/catchup.ts`, `src/lib/parsers/index.ts`, `src/lib/vision.ts`, `src/lib/storage.ts`, `src/components/*`, `src/components/landing/Landing.tsx`, `src/index.css`, `supabase/functions/server/index.tsx`.

---

## 3. AI Code Generation

AI tool for all entries: **Figma Make AI coding agent**.

### 3.1 Initial build *(summarized, not verbatim)*
- **Prompt:** the original brief described Unread as a catch-up tool for students and project teams. Requirements: use only real user data; use Gemini for summaries, urgency classification, citation-grounded Q&A and Vision import; keep the Gemini key in a Supabase Edge Function; support paste and file import (`.txt` / `.json` / WhatsApp `.zip`), PWA Share-to-Unread, local privacy masking, IndexedDB history and an ambient urgency background; take a cinematic, oryzo.ai-style visual direction with Lenis scrolling, a 3D chat-bubble hero and a curtain transition. Two WhatsApp screenshots and a pitch deck (`pitch_deck.pptx`) were attached as references.
- **Purpose:** build the MVP end to end.
- **Files:** essentially the whole `src/` tree and `public/` PWA files.
- **Outcome:** working frontend, parsers, masking, validation, UI and PWA. Unit tests were added in `src/lib/__tests__/core.test.ts`.

### 3.2 Supabase backend *(summarized, not verbatim)*
- **Prompt:** connect Supabase and create a secure Gemini backend.
- **Files:** `supabase/functions/server/index.tsx`; the `GEMINI_API_KEY` secret was created through the Make secret card.
- **Outcome:** an Edge Function with auth, per-user rate limiting and the `analyze` / `ask` / `extract` actions.

### 3.3 Remove fake data, dark mode, neon style, language picker *(summarized, not verbatim)*
- **Prompt (intent):** remove all fake or decorative data from the landing page (demo bubbles, the "247 unread" counter, the example "Maya" conversation); add dark mode as the default with a light/dark toggle; add a game-style look with glowing neon borders and light sweeps; add a multi-language output picker covering Indian and major world languages, sent with every Gemini request.
- **Files:** `src/components/landing/Landing.tsx`, `src/index.css`, `src/App.tsx`, `src/components/SettingsDialog.tsx`, `src/lib/api.ts`, `supabase/functions/server/index.tsx`.
- **Outcome:**
  - Hero bubbles became abstract skeletons with no invented names or text.
  - The counter was replaced with copy, and the privacy demo uses generic categories.
  - Theme tokens invert in `html.dark`, with dark urgency palettes.
  - Neon glow and sweep are applied in dark mode only and respect reduced motion.
  - 28 languages are offered, and the language is sent as `language` with each request.
- **Verification:** `tsc --noEmit` passed.

### 3.4 "Since I last read" + Copy catch-up
- **Prompt (verbatim):** the agent suggested next steps, and the user replied: "yep do those". This approved building the two features the agent recommended first: "Since I last read" and "Copy catch-up".
- **Files:** new `src/lib/range.ts`; `src/types.ts` (`readFrom`, `sinceLastId`); `src/App.tsx` (detects overlap with earlier imports, analyses only the selected range); `src/components/Workspace.tsx` ("Catch up on" picker, Copy and Share buttons).
- **Outcome:** re-imports default to new messages only. The copied text puts real names and numbers back locally (the user's own copy). Ask still covers the whole chat.
- **Verification:** `tsc --noEmit` passed. Not yet confirmed manually by the user.

---

## 4. Debugging

AI tool: **Figma Make AI coding agent**. Prompts are quoted verbatim (lightly trimmed).

| # | User prompt | Root cause found | Fix | Status |
|---|---|---|---|---|
| 1 | *(during setup)* backend URL issue | The client called `functions/v1/make-server/...`, but the function routes live under `make-server-82138c68` | `FUNCTION_ROUTE = 'make-server-82138c68'` in `src/lib/api.ts` | Fixed |
| 2 | "Could not start a secure anonymous session. Anonymous sign-ins may be disabled in Supabase Auth settings." | Anonymous sign-in is disabled in the Supabase project | The client falls back to the public anon key when anonymous sign-in fails; the server rate-limits those requests per IP | Fixed |
| 3 | "Fix these errors. … Multiple GoTrueClient instances detected in the same browser context." | Hot reload re-ran `api.ts` and created a new Supabase client each time | The client is cached on `globalThis` | Fixed |
| 4 | "It says … Sign in required … but there is no sign-in option" | The server compared the bearer token with `SUPABASE_ANON_KEY` and the values didn't match | Removed the hard sign-in requirement (the Supabase gateway already validates the key); rate limiting is per user or per IP | Fixed |
| 5 | "once I enter the import part and import something, I can't go back to the main page" | The landing page rendered only when there were zero conversations, and the logo wasn't a link | The logo is now a Home button, and the landing page always renders on the home view | Fixed |
| 6 | "Gemini request failed." | A generic error hid Google's real message | The server now returns Gemini's actual error text and tries a list of fallback models | Fixed (diagnostic) |
| 7 | "Gemini error (gemini-1.5-flash, 404): models/gemini-1.5-flash is not found…" | A retired model was in the fallback list, and the last error overwrote more useful earlier ones | Updated the model list; the server reports the most informative error instead of a 404 | Fixed |
| 8 | "Gemini rejected the API key: Your project has been denied access…" | A Google account/project restriction, not a code issue | The user created a key in a new Google project and saved it through the secret card | Resolved by the user |
| 9 | "Gemini error (gemini-flash-latest, 503): This model is currently experiencing high demand…" | Temporary Gemini overload | Backoff retries (2 s, 5 s) per model before falling back, and a plain-language overload message | Fixed. User reported: "It's working." |

**Recurring issue:** `supabase/functions/server/index.tsx` was repeatedly reset to the Make starter template between turns. The agent restored it from git history each time before deploying. Anyone working on the repo should check that this file holds the full Gemini server (about 190 lines) before deploying.

**Security incident (no secret recorded here):** a Google token was pasted into the chat once. The agent did not use it, advised revoking it, and secrets were from then on entered only through the Supabase secret card.

---

## 5. AI Features & Design

### Gemini integration (server-side prompts, `supabase/functions/server/index.tsx`)
- **Analyze:** "You help a returning group-chat member catch up. Use ONLY the messages provided; never invent facts. Every item must cite the message IDs … Any level above low needs a short urgencyReason grounded in the messages…" The prompt returns a strict JSON schema (brief, highlights, decisions, actionItems, mentions, topicEvents, messageUrgencies).
- **Ask:** "Answer the user's question using ONLY the provided messages. Cite supporting message IDs. If the answer is not in the messages, return status "not_found"."
- **Extract (Vision):** "Transcribe the chat messages visible in these screenshots/PDF, in chronological order. Do not summarize or invent." Message text is kept in its original language.
- **Language rule:** human-readable fields are written in the selected language. IDs, enum values, names and JSON keys are never translated.
- Requests use `responseMimeType: application/json` and `temperature: 0.2`.

### Trust and safety design
- The client validates citations (`src/lib/validate.ts`): unknown IDs are dropped and counted, and an answer without valid evidence becomes "not found".
- Masking happens on the device. The mask key never leaves the browser.
- History lives only on the device. The API key exists only as a server secret.

### UI/UX decisions
- Cinematic scroll story: the pile untangles into what matters, then the privacy mask, then ambient urgency.
- The urgency palette drives the whole room's colour, but urgency is always shown with labels too, never colour alone.
- Dark neon theme by default. Reduced motion, forced colours and focus-visible states are supported.

---

## 6. Testing & Improvements

All results below were actually run or reported in this project.

| Check | Command or method | Result |
|---|---|---|
| Type check | `tsc --noEmit -p .` | Passed after each change set |
| Unit tests | `pnpm test` (Vitest, `src/lib/__tests__/core.test.ts`) | 12 / 12 passed |
| Production build | `pnpm build` | Succeeded, with a warning that the main chunk is larger than 500 kB |
| Secret scan | grep for Gemini/Google key patterns across the repo (excluding `node_modules` and `.git`) | No secrets found |
| End-to-end analysis | Manual, by the user, with a real WhatsApp chat | User: "It's working. It's really good and it's user-friendly also." |
| "Since I last read" / Copy catch-up | Manual | **Pending** user verification |

**Known improvement opportunities:** code-split the large bundle; show clearer loading stages ("Retrying, Gemini is busy…"); test the mobile layout; add a README.

---

## 7. Final Summary

- **AI tools used:** Figma Make AI coding agent (code generation, architecture, debugging, documentation); Google Gemini API (the product's runtime AI features).
- **Major AI contributions:** full MVP implementation; the secure Supabase and Gemini backend; privacy masking and citation validation; the design system and motion; nine debugging fixes or diagnoses (section 4); multi-language output; "Since I last read"; Copy/Share catch-up.
- **Completed features:** everything listed in section 1.
- **Status:** MVP complete and working end to end, according to the user. Final GitHub push performed by the user via Make Settings → GitHub. Manual check of the latest two features is still pending.

---

## Development Log (ongoing)

| Date | Interaction | Tool | Files | Outcome |
|---|---|---|---|---|
| Hackathon | Created `prompt.md` from the master prompt ("Now understand my project idea, prepare the development plan, and generate the initial prompt.md.") | Figma Make AI agent | `prompt.md` | Created retroactively; to be updated with each significant change |
| Hackathon | "ready to push": pre-push check (server file intact, `prompt.md` present) before the final GitHub push | Figma Make AI agent | `supabase/functions/server/index.tsx`, `prompt.md` | Server file verified/restored; user pushes via Make Settings → GitHub |
| Hackathon | "check all errors, increase efficiency, coding quality, and standards, check the backend architecture" | Figma Make AI agent | `supabase/functions/server/index.tsx`, `prompt.md` | Edge entrypoint had reset to health-only starter again; restored full server. Fixed shared `MODEL` race across concurrent requests (model now returned per request), added message sanitization and caps (count, length, file size, strict image/PDF MIME types), typed Hono contexts, rate limiter fails open on KV errors. Verified: `tsc --noEmit` clean, 12/12 vitest tests pass, `vite build` succeeds, server files transpile without syntax errors. Deployment not re-verified from this environment. |
| Hackathon | Repeat request: "check all errors, increase efficiency, coding quality, and standards, check the backend architecture" | Figma Make AI agent | `supabase/functions/server/index.tsx`, `supabase/functions/server/app.tsx`, `prompt.md` | Edge entrypoint had reset to the 26-line health-only starter again (working copy only; committed version was intact). Restored it, then moved all routes/Gemini logic into `app.tsx` with `index.tsx` reduced to a 3-line bootstrap so a future reset of the entrypoint cannot delete the logic. Verified: `tsc --noEmit` clean, 12/12 vitest tests pass, `vite build` succeeds, server files transpile without syntax errors. Deployment not re-verified from this environment. |
