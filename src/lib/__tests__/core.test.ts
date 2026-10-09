// Synthetic fixtures for tests only — never shipped as app content.
import { describe, expect, it } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { chooseZipChatEntry, parseGenericText, parseJson, parseText, parseWhatsApp, parseZip, ImportError } from '../parsers'
import { maskMessages, toPayload, unmask } from '../privacy'
import { validateAnalysis, validateAnswer, validateExtract } from '../validate'
import { maxLevel, resolveItemUrgency } from '../urgency'
import { applyDepth, applyLens, buildItems } from '../catchup'
import type { ChatMessage } from '@/types'

const WA_ANDROID = `12/03/2024, 14:05 - Messages and calls are end-to-end encrypted.
12/03/2024, 14:05 - Alex: Report draft due Friday
can someone review section 2?
13/03/2024, 09:10 - Sam: I'll take section 2`

describe('parsers', () => {
  it('parses WhatsApp Android lines, multiline messages and skips system notices', () => {
    const r = parseWhatsApp(WA_ANDROID)!
    expect(r.messages).toHaveLength(2)
    expect(r.skipped).toBe(1)
    expect(r.messages[0]).toMatchObject({ id: 'm1', sender: 'Alex', timestamp: '2024-03-12T14:05' })
    expect(r.messages[0].text).toContain('section 2?')
  })

  it('parses iOS bracketed lines with 12h time and detects month-first files', () => {
    const r = parseText('[3/25/24, 2:05:10 PM] Jo: hello\n[3/26/24, 9:00:00 AM] Kim: hi')
    expect(r.format).toBe('whatsapp')
    expect(r.messages[0].timestamp).toBe('2024-03-25T14:05')
    expect(r.messages[1].timestamp).toBe('2024-03-26T09:00')
  })

  it('falls back to "Name: text" lines, then paragraphs with unknown sender', () => {
    expect(parseGenericText('Ana: one\nBen: two\nAna: three').messages.map((m) => m.sender)).toEqual(['Ana', 'Ben', 'Ana'])
    const p = parseGenericText('first block\n\nsecond block')
    expect(p.messages).toHaveLength(2)
    expect(p.messages.every((m) => m.sender === null)).toBe(true)
  })

  it('maps JSON aliases and rejects JSON without message text', () => {
    const r = parseJson(JSON.stringify({ messages: [{ author: 'A', content: 'x', date: '2024-01-01' }, { body: 'y', from: { name: 'B' } }, { foo: 1 }] }))
    expect(r.messages.map((m) => [m.id, m.sender, m.text])).toEqual([
      ['m1', 'A', 'x'],
      ['m2', 'B', 'y'],
    ])
    expect(r.skipped).toBe(1)
    expect(() => parseJson('[{"foo":1}]')).toThrow(ImportError)
    expect(() => parseJson('{bad')).toThrow(ImportError)
  })

  it('selects the chat entry from a WhatsApp zip and ignores media', async () => {
    expect(chooseZipChatEntry(['IMG-1.jpg', 'notes.txt', '_chat.txt'])).toBe('_chat.txt')
    expect(chooseZipChatEntry(['a/WhatsApp Chat with Team.txt', 'b.txt'])).toBe('a/WhatsApp Chat with Team.txt')
    const zip = zipSync({ '_chat.txt': strToU8(WA_ANDROID), 'IMG-1.jpg': new Uint8Array([1, 2, 3]) })
    const r = await parseZip(zip)
    expect(r.messages).toHaveLength(2)
    expect(r.notes.join(' ')).toMatch(/1 media file/)
    await expect(parseZip(zipSync({ 'a.jpg': new Uint8Array([1]) }))).rejects.toThrow(/No chat text/)
  })
})

const msgs: ChatMessage[] = [
  { id: 'm1', sourceIndex: 0, sender: 'Alex', timestamp: null, text: 'Mail me at alex@uni.edu or call +44 7700 900123, Priya knows' },
  { id: 'm2', sourceIndex: 1, sender: 'Priya', timestamp: null, text: 'Same email alex@uni.edu, see https://x.io/doc' },
]

describe('privacy mask', () => {
  it('masks categories with stable placeholders and restores locally', () => {
    const { prepared, map, counts } = maskMessages(msgs, { email: true, phone: true, url: true, customTerms: ['Priya'] })
    expect(prepared[0].text).toBe('Mail me at [EMAIL_1] or call [PHONE_1], [TERM_1] knows')
    expect(prepared[1].text).toContain('[EMAIL_1]')
    expect(prepared[1].sender).toBe('[TERM_1]')
    expect(counts).toMatchObject({ EMAIL: 1, PHONE: 1, URL: 1, TERM: 1 })
    expect(unmask('Ask [TERM_1]', map)).toBe('Ask Priya')
  })

  it('payload contains only id/sender/timestamp/text and no placeholder map', () => {
    const { prepared } = maskMessages(msgs, { email: true, phone: false, url: false, customTerms: [] })
    const json = JSON.stringify(toPayload(prepared))
    expect(Object.keys(toPayload(prepared)[0]).sort()).toEqual(['id', 'sender', 'text', 'timestamp'])
    expect(json).not.toContain('alex@uni.edu')
  })
})

describe('analysis validation and urgency', () => {
  const raw = {
    brief: 'Draft due Friday.',
    highlights: [
      { text: 'Review needed', citationIds: ['m1', 'm99'], confidence: 'high' },
      { text: 'Fabricated', citationIds: ['m42'] },
      { text: 'Elevated without reason', citationIds: ['m2'], urgency: 'critical' },
    ],
    decisions: [],
    actionItems: [{ text: 'Review section 2', citationIds: ['m2'], owner: null, dueAt: null, status: 'weird', urgency: 'medium', urgencyReason: 'Friday deadline' }],
    mentions: [],
    topicEvents: [],
    messageUrgencies: [
      { messageId: 'm1', urgency: 'high', reason: 'Due Friday', confidence: 'high' },
      { messageId: 'm77', urgency: 'critical', reason: 'x' },
      { messageId: 'm2', urgency: 'low', reason: 'x' },
    ],
  }

  it('drops invalid citations, urgency entries and uncited claims', () => {
    const a = validateAnalysis(raw, msgs)
    expect(a.messageUrgencies).toEqual([{ messageId: 'm1', urgency: 'high', reason: 'Due Friday', confidence: 'high' }])
    expect(a.highlights.map((h) => h.text)).toEqual(['Review needed', 'Elevated without reason'])
    expect(a.highlights[0].citationIds).toEqual(['m1'])
    expect(a.highlights[0].urgency).toBe('high') // inherited from cited message
    expect(a.highlights[1].urgency).toBe('low') // critical without reason is not trusted
    expect(a.actionItems[0]).toMatchObject({ urgency: 'medium', status: 'unclear', owner: null })
    expect(a.validationIssues).toBeGreaterThan(0)
  })

  it('resolves urgency: validated level wins, otherwise highest citation, default low', () => {
    const map = new Map([['m1', { messageId: 'm1', urgency: 'critical' as const, reason: 'r', confidence: 'high' as const }]])
    expect(resolveItemUrgency('low', ['m1'], map)).toBe('low')
    expect(resolveItemUrgency(undefined, ['m1', 'm2'], map)).toBe('critical')
    expect(resolveItemUrgency('bogus', ['m2'], map)).toBe('low')
    expect(maxLevel([])).toBe('low')
  })

  it('treats answers without valid citations as not found', () => {
    expect(validateAnswer({ status: 'answered', answer: 'Friday', citationIds: ['m9'] }, msgs, 'when?', null).status).toBe('not_found')
    const ok = validateAnswer({ status: 'answered', answer: 'Friday', citationIds: ['m1'], urgency: 'high', urgencyReason: 'deadline' }, msgs, 'when?', null)
    expect(ok).toMatchObject({ status: 'answered', urgency: 'high', citationIds: ['m1'] })
  })

  it('validates vision extraction output', () => {
    expect(validateExtract({ messages: [{ sender: null, timestamp: null, text: 'hi' }, { text: '' }], warnings: ['blurry'] })).toEqual({ rows: [{ sender: null, timestamp: null, text: 'hi' }], warnings: ['blurry'] })
    expect(() => validateExtract({ messages: [] })).toThrow()
  })

  it('depth and lens filters are deterministic', () => {
    const a = validateAnalysis({ ...raw, decisions: [{ text: 'Use slides', citationIds: ['m1'] }], topicEvents: [{ label: 'Kickoff', text: 't', citationIds: ['m1'] }] }, msgs)
    const items = buildItems(a)
    expect(applyDepth(items, 'deep')).toHaveLength(items.length)
    expect(applyDepth(items, 'standard').some((i) => i.section === 'timeline')).toBe(false)
    expect(applyLens(items, 'decisions', null, new Map()).map((i) => i.item.text)).toEqual(['Use slides'])
    expect(applyLens(items, 'urgent', null, new Map()).every((i) => i.item.urgency === 'high' || i.item.urgency === 'critical')).toBe(true)
    expect(applyLens(items, 'me', null, new Map())).toEqual([])
    const byId = new Map(msgs.map((m) => [m.id, m]))
    expect(applyLens(items, 'me', 'Priya', byId).length).toBeGreaterThan(0)
  })
})
