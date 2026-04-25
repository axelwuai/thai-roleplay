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
