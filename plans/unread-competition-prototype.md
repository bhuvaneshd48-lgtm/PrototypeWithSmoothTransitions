# Unread — Competition Prototype Implementation Plan

## 1. Goal and success criteria

Build **Unread**, a polished React micro-app for students and project teams who return to an overwhelming group conversation and need to know what they missed. The prototype must use only user-supplied, real conversation data; call Gemini for every AI-powered operation; make every visible control functional; and remain usable on desktop and mobile.

A successful submission will let a judge:

1. Paste a real conversation or upload a real `.txt`/`.json` export.
2. Inspect what was parsed before anything leaves the browser.
3. Optionally redact sensitive values locally.
4. Explicitly send the prepared text for Gemini analysis.
5. Receive a concise catch-up brief, priorities, decisions, action items, deadlines, and mentions with citations to original messages.
6. Ask any question about the imported conversation and receive a grounded answer with citations or an honest “not found in this conversation” response.
7. Change filters, summary depth, motion-safe preferences, and conversation selection without encountering decorative or dead controls.
8. Refresh and recover prior conversations from that browser without storing raw chats in Supabase.

The current repository is an empty React 19 + Vite 8 + Tailwind CSS v4 shell, so this is a new single-page application rather than a modification of an existing product. The supplied deck’s priorities—functional deployment, code quality, security, testing, accessibility, problem alignment, and clear Gemini disclosure—will guide implementation.

## 2. Scope boundaries

### Included

- Real chat paste and file import.
- WhatsApp-like plain-text parsing plus a documented generic JSON importer.
- Device-only conversation and analysis persistence using IndexedDB.
- Local, user-reviewable privacy masking before cloud analysis.
- Secure Gemini calls through a Supabase Edge Function.
- Structured catch-up analysis and conversation-grounded Q&A.
- Citation navigation from every AI claim back to source messages.
- Responsive, accessible, motion-rich UI inspired by the reference site’s smooth pacing and transitions.
- Empty, loading, success, partial, and error states.
- Focused automated tests and submission documentation.

### Excluded from this prototype

- Fake/sample conversations, fabricated metrics, testimonials, or precomputed AI output.
- Direct WhatsApp, Discord, Slack, or Teams account integrations; these require provider credentials, approval, and webhook infrastructure.
- General-purpose questions unrelated to the imported conversation.
- Cloud synchronization of raw chats, user accounts with profiles, collaboration, or sharing.
- Editing the pitch deck; that can be prepared after the working prototype.
- Claims that chat data never leaves the device. The app will accurately disclose that only the user-approved prepared text is sent to Gemini through Supabase.

## 3. Prerequisite setup

Before backend implementation:

1. Connect a Supabase project from the Figma Make settings flow.
2. Add the Gemini API key as a Supabase secret named `GEMINI_API_KEY`; never put it in Vite environment variables, source code, Git, logs, or chat.
3. Enable anonymous Supabase authentication so each browser gets a short-lived user identity without collecting profile information.
4. Add an `ALLOWED_ORIGINS` server secret containing the Make preview and final deployed origins; development localhost may be allowed only in development.
5. Optionally add `GEMINI_MODEL`; otherwise use `gemini-2.5-flash` as the documented default.
6. After backend changes, redeploy the Supabase Edge Function from Make settings as required by the generated Supabase integration.

If Supabase is not connected when implementation begins, stop before building AI behavior and request the connection rather than inserting a mock response. Figma Make should not be used to collect highly sensitive or regulated personal data; this limitation will also appear in the privacy copy.

## 4. Product flow and information architecture

Implement the app as one responsive workspace with explicit view states rather than adding routing that the product does not need.

### A. Welcome/import state

- Compact `Unread` wordmark, privacy status, and settings control.
- Hero copy: **“Turn the unread into a clear next move.”**
- Two real input paths:
  - a large paste area with live character/message estimates;
  - drag-and-drop/file picker accepting `.txt`, `.json`, and `.csv` only if CSV parsing is implemented and tested; otherwise omit CSV from the UI.
- “How your data is handled” disclosure next to the Analyze flow, not hidden in a footer.
- Recent device-only conversations appear only after the user has imported them. The untouched app contains no seeded cards or example numbers.
- Analyze remains disabled until valid non-empty input has parsed successfully.

### B. Import review and privacy step

- Show parsed message count, detected participant names, time range when timestamps exist, and any malformed/skipped rows. Every count must be derived from the imported file.
- Render a virtualized or bounded preview for large conversations.
- Privacy Mask finds email addresses, phone numbers, URLs, and user-entered custom terms locally. Present per-category toggles and a before/after preview.
- Preserve a local placeholder map so the browser can display original source messages after Gemini returns citations; never send that map to Supabase.
- Require an explicit confirmation: “Send this prepared text to Gemini.”
- Allow the user to return and correct input without losing it.

### C. Catch-up workspace

Use a three-part layout that collapses cleanly on smaller screens:

1. **Conversation rail** — imported conversations, rename, delete, and new import. The rail contains only local records.
2. **Catch-up path** — an ordered sequence of evidence-backed sections:
   - Pulse: one-paragraph summary and a derived unread/message count.
   - Do first: urgent items ordered by urgency and due date.
   - Decisions: what was agreed, who participated when known, and citations.
   - Action items: owner, due date, status, and citations; unknown values display “Not stated,” never invented values.
   - Mentions and deadlines: items relevant to the selected participant and dated commitments.
   - Topic timeline: compact chronological clusters that let the user understand how the discussion changed.
3. **Source drawer** — opens from any citation and scrolls/highlights the exact original message. It must also be keyboard-operable.

A “Catch-up depth” control offers **30 sec**, **2 min**, and **Deep read** views. It does not trigger new AI calls: the single structured analysis contains enough detail for the UI to reveal progressively, making the interaction instant and cost-efficient.

A lens/filter bar contains only implemented filters: `For me`, `Urgent`, `Decisions`, `Tasks`, and `All`. “For me” is enabled after the user chooses their identity from detected participants; if participant detection is unavailable, the UI explains why and leaves the filter disabled.

### D. Ask Unread

- A persistent but unobtrusive question composer opens as a bottom sheet on mobile and a side panel on desktop.
- Questions send the selected conversation’s prepared text, normalized source IDs, prior question only when needed, and the new question to the same protected backend.
- Answers include citation chips that open the source drawer.
- If Gemini cannot support an answer from the supplied conversation, return a visible “I couldn’t find that in this conversation” result with suggested grounded questions derived from available analysis categories, not fabricated conversation content.
- Include cancel/retry actions and prevent duplicate submissions while a request is active.

## 5. Distinctive features

Prioritize a small set of features that are both unique and fully functional:

1. **Catch-up Path** — a paced card sequence that turns analysis into a narrative from summary to next action instead of showing a generic dashboard.
2. **Evidence Thread** — every summary item, decision, task, and answer carries source-message IDs; selecting one performs a smooth shared-element-like transition into the highlighted source.
3. **Privacy Mask** — local, reviewable redaction before any cloud request, with no redaction mapping sent to the server.
4. **Time-budget reading** — one AI analysis powers 30-second, 2-minute, and deep-read levels without extra API cost or waiting.
5. **Momentum view** — a topic timeline showing where urgency, decisions, and tasks emerged across the actual conversation. This is generated from Gemini’s structured event output and never from fake chart data.

Do not add speculative features, nonfunctional navigation, “coming soon” buttons, fake notifications, or decorative analytics.

## 6. Visual and motion direction

Use the reference `oryzo.ai` for interaction principles rather than literal styling or assets. Its relevant qualities are oversized editorial type, warm high-contrast color fields, playful object/card movement, scroll-linked staging, and deliberate transitions. Avoid duplicating its WebGL/3D coaster scene because it adds performance and delivery risk without helping the problem statement.

### Visual system

- Editorial, high-contrast interface: warm parchment background, near-black text/surfaces, electric chartreuse signal color, and a restrained coral accent for urgent items.
- Oversized condensed display treatment for key counts/headlines paired with a highly legible sans serif for conversation content. Use public Google fonts wired through CSS import or the project’s established font setup.
- Rounded but not generic cards, strong border rhythm, dense source-message typography, and generous whitespace around high-priority information.
- Use an installed icon library consistently; do not use emoji as UI icons.
- No photography is needed because this is a productivity workspace rather than a storytelling/marketing surface.

### Motion system

- Add `motion` for React and centralize duration/easing tokens.
- Entry transition: the import panel compresses into a conversation rail while the first analysis card expands into place; this should feel continuous rather than like a page reload.
- Catch-up cards enter as a staggered stack with restrained spring motion; changing reading depth smoothly reveals/reorders content.
- Citation chips animate a thin signal line toward the source drawer, then highlight the referenced message.
- Loading uses real pipeline labels—`Preparing messages`, `Finding decisions`, `Linking evidence`—without fake percentages.
- Micro-interactions cover drag-over, button press, filter selection, drawer opening, deletion confirmation, and error recovery.
- Respect `prefers-reduced-motion`: replace transforms and staggered sequences with short opacity changes or immediate state changes. Never make content access depend on animation or scroll position.

## 7. Data model and local persistence

Define strict TypeScript types and version the persisted format:

```ts
type ChatMessage = {
  id: string;
  sourceIndex: number;
  sender: string | null;
  timestamp: string | null;
  text: string;
};

type ConversationRecord = {
  id: string;
  schemaVersion: 1;
  title: string;
  importedAt: string;
  sourceType: "paste" | "txt" | "json";
  messages: ChatMessage[];
  analysis: AnalysisResult | null;
};

type EvidenceItem = {
  text: string;
  citationIds: string[];
  confidence: "high" | "medium" | "low";
};

type AnalysisResult = {
  brief: string;
  highlights: EvidenceItem[];
  decisions: EvidenceItem[];
  actionItems: Array<EvidenceItem & {
    owner: string | null;
    dueAt: string | null;
    status: "open" | "done" | "unclear";
    urgency: "critical" | "high" | "normal";
  }>;
  mentions: EvidenceItem[];
  topicEvents: Array<EvidenceItem & { label: string; timestamp: string | null }>;
};
```

Use IndexedDB through a small repository module, not scattered component calls. Persist only imports and successful analyses. Keep redaction maps and in-progress questions in memory. Include delete-one and clear-all controls with confirmation. If IndexedDB is unavailable, keep the current session usable in memory and explain that history will not persist.

## 8. Parsing and real-data rules

- Normalize line endings, strip byte-order marks, and reject empty/binary/oversized files with actionable messages.
- Parse common WhatsApp patterns such as `DD/MM/YYYY, HH:MM - Sender: text` and bracketed timestamp variants, including multiline continuation messages.
- Generic `.txt` fallback treats non-empty paragraph blocks as messages with unknown sender rather than inventing metadata.
- Generic `.json` accepts an array or a top-level `messages` array and maps documented aliases (`text`/`content`/`body`, `sender`/`author`/`name`, `timestamp`/`date`/`time`). Reject JSON without recoverable message text.
- Generate deterministic source IDs from order, not from AI output.
- Cap file size and message count at documented values selected during implementation based on Gemini context limits; the UI must explain truncation and let users choose a range rather than silently dropping content.
- Never insert demo records into production storage. Unit tests may use clearly isolated synthetic fixtures under test files only; they must never ship as app content.

## 9. Gemini and Supabase architecture

### Client

- Add `@supabase/supabase-js` and initialize it only from the generated public project ID/anon-key helper after connection.
- Create/reuse an anonymous auth session and send its access token with each function request.
- Send only normalized, optionally redacted messages required for the selected conversation. Do not send local titles, redaction maps, or other conversation histories.
- Use `AbortController`, one retry for transient network/5xx responses, and clear error categories for auth, rate limit, invalid response, and connectivity failures.

### Supabase Edge Function

Implement two explicit actions on the generated server route:

- `analyze`: validates message shape and limits, builds the analysis prompt, calls Gemini, validates structured JSON, and returns `AnalysisResult`.
- `ask`: validates a question plus cited conversation context, instructs Gemini to answer only from that context, validates citations, and returns a grounded answer or `not_found`.

Server requirements:

- Read `GEMINI_API_KEY` only from Supabase secrets.
- Verify the Supabase JWT and reject unauthenticated calls.
- Validate origin against `ALLOWED_ORIGINS` and configure narrow CORS headers.
- Enforce request byte/message/question limits before calling Gemini.
- Apply a small per-anonymous-user request quota using the provided Supabase KV/store pattern; store only user ID, count, and expiry, never chat content.
- Use Gemini structured output/JSON schema with low temperature for extraction tasks.
- Explicitly prohibit invented owners, dates, decisions, or citations in prompts.
- Validate every returned citation against IDs present in the request and discard/flag invalid entries.
- Return stable machine-readable errors and never log raw messages, questions, keys, or Gemini payloads.
- Add timeouts and map Gemini safety/rate-limit errors to useful client messages.

Every user-facing AI feature—analysis, prioritization, timeline extraction, and Q&A—must come from Gemini. Deterministic file parsing, filtering, redaction, storage, and rendering remain local utilities and are not presented as AI.

## 10. Code organization

Keep `src/App.tsx` as the view-state orchestrator and extract coherent modules rather than creating one large file:

- `src/components/` — import panel, privacy review, workspace shell, catch-up sections, source drawer, Ask Unread panel, settings, and accessible dialog primitives.
- `src/lib/parsers/` — text/WhatsApp and JSON parsers plus normalization.
- `src/lib/privacy.ts` — deterministic redaction detection/application.
- `src/lib/storage.ts` — IndexedDB repository and schema version handling.
- `src/lib/api.ts` — authenticated Supabase function client and error mapping.
- `src/types.ts` — shared client models and runtime validation helpers.
- `src/index.css` — Tailwind import first, font import/setup, design tokens, global focus styles, and reduced-motion fallbacks.
- Supabase generated server entry — narrow routes, Gemini client, prompts, validation, and quota logic; do not modify autogenerated KV/helper files.

Avoid a new global state library; React state plus focused hooks/context is sufficient for this single workspace. Add only dependencies that directly support the chosen implementation (`motion`, Supabase client, an icon library, and focused test tooling).

## 11. Accessibility and resilience

- Use semantic landmarks, headings, lists, forms, and buttons.
- Ensure full keyboard access to import, filters, card navigation, citations, drawer/dialog close, and Ask Unread.
- Provide visible focus rings and meet WCAG AA contrast for normal text and controls.
- Use an `aria-live` region for import validation and analysis status without announcing decorative animation.
- Trap focus in modal/drawer states, restore focus to the triggering citation, and support Escape.
- Do not encode urgency by color alone; pair it with text and iconography.
- Confirm destructive deletion and show recovery guidance for network/API failures.
- Preserve parsed input if analysis fails so the user can retry without reimporting.
- Show a safe, actionable unsupported-file state and never silently accept malformed data.

## 12. Verification strategy

Add Vitest and React Testing Library only if needed for the following focused checks:

### Unit tests

- WhatsApp timestamp/sender parsing, multiline messages, generic text fallback, JSON aliases, malformed input, and deterministic source IDs.
- Privacy-mask detection, custom terms, placeholder stability, and ensuring the private placeholder map is omitted from API payloads.
- Analysis runtime validation, especially invalid or nonexistent citation IDs.
- Reading-depth and lens filters so displayed subsets remain deterministic.
- IndexedDB repository behavior using a test-safe adapter or fake IndexedDB.

### Component/integration tests

- Analyze is disabled before valid input and enabled after valid parsing/consent.
- Import review shows derived values only.
- A validated API response renders cards and citation controls correctly.
- Unsupported answers render `not_found` rather than generic AI prose.
- Keyboard citation flow opens the source and restores focus.
- Failed requests preserve imported content and expose retry.

### Manual acceptance checks

- Paste a real short conversation and import real `.txt` and `.json` files.
- Confirm no network request occurs before consent.
- Inspect the request to verify redacted text is sent and the placeholder map is not.
- Exercise analysis, all filters, all reading depths, citations, Q&A, rename/delete, clear history, retry, cancel, responsive layouts, and reduced motion.
- Test narrow mobile, tablet, and desktop layouts in the existing Make preview.
- Confirm no empty links, placeholder buttons, fake records, console errors, key leakage, or raw-message server logs.
- Run the repository-prescribed formatter and then `pnpm build`; run the added test command if test tooling is introduced. Do not start another development server because Make already supervises it.

## 13. Submission documentation

Create a concise `README.md` because the supplied evaluation explicitly requires clear setup/usage documentation. Include:

- One-paragraph problem/solution description.
- Feature list and supported import formats.
- Local-data/privacy architecture and the exact disclosure that approved content is sent to Gemini.
- Supabase connection, anonymous-auth, `GEMINI_API_KEY`, `ALLOWED_ORIGINS`, function deployment, local install, test, and build steps.
- A clear Gen AI disclosure: **Google Gemini is used in the Supabase Edge Function for conversation summarization, priority/decision/action extraction, topic events, and grounded Q&A.**
- Security notes and current prototype limitations.
- Deployment checklist covering the public GitHub repository, working deployed URL, and post-deploy functional smoke test.

Also add `.env.example` only for public client configuration if the generated Make integration requires it; never include a Gemini key value. Ensure secret and local database files are excluded from Git.

## 14. Implementation order

1. Connect Supabase and create the server-side Gemini secret.
2. Install only required dependencies and establish shared types/runtime validators.
3. Build and test import parsers, privacy masking, and IndexedDB persistence.
4. Implement the authenticated Supabase/Gemini endpoint with structured responses, citation validation, quotas, and safe errors.
5. Build the complete unstyled interaction flow against the real endpoint so every action works before visual polish.
6. Apply the Unread visual system and responsive layout.
7. Add the coordinated transition system and reduced-motion behavior.
8. Add focused tests, README/setup disclosure, and empty/error/accessibility states.
9. Format, test, build, and perform the manual real-data acceptance pass.
10. Redeploy the Supabase function and final app, then verify the exact submitted URL in a clean browser session.

## 15. Final deliverables

- Functional responsive Unread prototype in the existing repository.
- Secure Supabase Edge Function backed by Gemini.
- Device-only real conversation storage with local privacy masking.
- Tested real-data import, analysis, citation, filtering, and grounded Q&A flows.
- Smooth reference-inspired transitions with reduced-motion support.
- Submission-ready README and configuration guidance.
- No fake production data, exposed API key, dead controls, or unsupported AI claims.
