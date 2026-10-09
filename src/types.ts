export type UrgencyLevel = 'low' | 'medium' | 'high' | 'critical'
export type Confidence = 'high' | 'medium' | 'low'

export type ChatMessage = {
  id: string
  sourceIndex: number
  sender: string | null
  timestamp: string | null
  text: string
}

export type SourceType = 'paste' | 'txt' | 'json' | 'zip' | 'share' | 'image' | 'pdf'

export type PrivacySettings = {
  email: boolean
  phone: boolean
  url: boolean
  customTerms: string[]
}

export type EvidenceItem = {
  text: string
  citationIds: string[]
  confidence: Confidence
  urgency: UrgencyLevel
  urgencyReason: string | null
}

export type ActionItem = EvidenceItem & {
  owner: string | null
  dueAt: string | null
  status: 'open' | 'done' | 'unclear'
}

export type TopicEvent = EvidenceItem & { label: string; timestamp: string | null }

export type MessageUrgency = {
  messageId: string
  urgency: Exclude<UrgencyLevel, 'low'>
  reason: string
  confidence: Confidence
}

export type AnalysisResult = {
  brief: string
  highlights: EvidenceItem[]
  decisions: EvidenceItem[]
  actionItems: ActionItem[]
  mentions: EvidenceItem[]
  topicEvents: TopicEvent[]
  messageUrgencies: MessageUrgency[]
  /** Count of AI claims dropped or corrected during citation validation. */
  validationIssues: number
  model: string
  analyzedAt: string
}

export type ConversationRecord = {
  id: string
  schemaVersion: 1
  title: string
  importedAt: string
  sourceType: SourceType
  messages: ChatMessage[]
  privacy: PrivacySettings
  /** True when messages were transcribed by Gemini Vision from images/PDF. */
  transcribed: boolean
  me: string | null
  analysis: AnalysisResult | null
  /** First message id covered by the catch-up; null/undefined = whole chat. */
  readFrom?: string | null
  /** First message that was new compared with an earlier import of this chat. */
  sinceLastId?: string | null
}

export type AskAnswer = {
  id: string
  question: string
  status: 'answered' | 'not_found'
  answer: string
  citationIds: string[]
  urgency: UrgencyLevel
  urgencyReason: string | null
}

export type ParseResult = {
  messages: ChatMessage[]
  skipped: number
  format: 'whatsapp' | 'lines' | 'paragraphs' | 'json' | 'vision'
  notes: string[]
}
