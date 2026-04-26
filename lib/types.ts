export interface SuggestedReply {
  thai: string;
  romanization: string;
  chinese: string;
}

export interface AssistantStructuredMessage {
  thai: string;
  romanization: string;
  chinese: string;
  coachingNote: string;
  suggestedReply: SuggestedReply | null;
  learnerTranslation: SuggestedReply | null;
  repeatPrompt: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  structuredContent?: AssistantStructuredMessage;
  learnerTranslation?: SuggestedReply | null;
}

export interface ScenarioSession {
  scenario: string;
  messages: ChatMessage[];
  showThaiScript: boolean;
  updatedAt: string;
}

export interface ScenarioSessionSummary {
  scenario: string;
  messageCount: number;
  updatedAt: string;
}

export interface PracticeStats {
  totalScenarios: number;
  totalMessages: number;
  activeDays: number;
  latestUpdatedAt: string | null;
}

export interface AuthUser {
  id: string;
  email: string;
  createdAt: string;
}

export interface AuthSessionUser extends AuthUser {
  sessionExpiresAt: string;
}

export interface ChatApiResponse {
  message: AssistantStructuredMessage;
}

export type AsrSpeechMode = "auto" | "zh" | "th";

export type AsrDetectedLanguage = "zh" | "th" | "mixed" | "unknown";

export interface AsrApiResponse {
  transcript: string;
  normalizedTranscript: string;
  detectedLanguage: AsrDetectedLanguage;
  speechMode: AsrSpeechMode;
}

export interface VocabularyExplanation {
  term: string;
  romanization: string;
  chineseMeaning: string;
  usage: string;
  exampleThai: string;
  exampleRomanization: string;
  exampleChinese: string;
}

export interface VocabularyApiResponse {
  explanation: VocabularyExplanation;
}

export type PracticeMode = "conversation" | "vocabulary" | "listening" | "speaking";

export interface VocabularyNoteItem {
  term: string;
  romanization: string;
  chineseMeaning: string;
  usageNote: string;
  sourceExcerpt: string;
  sourceRomanization?: string;
  sourceChinese?: string;
  exampleThai: string;
  exampleRomanization: string;
  exampleChinese: string;
}

export interface VocabularyNotesMaterial {
  title: string;
  summary: string;
  notes: VocabularyNoteItem[];
  reviewTips: string[];
}

export interface ListeningReviewItem {
  focus: string;
  thai: string;
  romanization: string;
  question: string;
  answer: string;
  explanation: string;
}

export interface ListeningReviewMaterial {
  title: string;
  summary: string;
  items: ListeningReviewItem[];
}

export interface SpeakingReviewDrill {
  situation: string;
  cue: string;
  targetThai: string;
  romanization: string;
  coachingTip: string;
}

export interface SpeakingReviewMaterial {
  title: string;
  summary: string;
  drills: SpeakingReviewDrill[];
}

export interface PracticeMaterialsApiResponse {
  mode: Exclude<PracticeMode, "conversation">;
  material: VocabularyNotesMaterial | ListeningReviewMaterial | SpeakingReviewMaterial;
  favoriteCardIds?: string[];
  cardMemories?: PracticeStudyCardMemory[];
}

export interface PracticeStudyCardMemory {
  cardId: string;
  isFavorite: boolean;
  openCount: number;
  audioPlayCount: number;
  answerRevealCount: number;
  reviewViewCount: number;
  revisitCount: number;
  totalFocusMs: number;
  lastInteractedAt: string | null;
  interestScore: number;
  difficultyScore: number;
  freshnessScore: number;
  finalScore: number;
}
