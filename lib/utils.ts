import type {
  AssistantStructuredMessage,
  ChatMessage,
  PracticeStats,
  ScenarioSession,
  ScenarioSessionSummary,
  SuggestedReply,
} from "@/lib/types";

const HELP_TRIGGER_PATTERN =
  /(不会|help|不知道|怎么说|不知道怎么说|不知道怎么表达|不会说|提示一下|给我提示)/i;
const REPEAT_TRIGGER_PATTERN = /(再说一遍|重复一下|repeat|再来一次)/i;

export const OPENAI_KEY_STORAGE_KEY = "thai-roleplay-openai-key";
export const AI_KEY_STORAGE_KEY = "thai-roleplay-ai-key";
export const SCENARIO_STORAGE_PREFIX = "thai-roleplay-session:";
export const PRACTICE_CLIENT_ID_STORAGE_KEY = "thai-roleplay-client-id";
export const PRACTICE_DB_MIGRATION_PREFIX = "thai-roleplay-db-migrated:";

export function isHelpTrigger(input: string) {
  return HELP_TRIGGER_PATTERN.test(input.trim());
}

export function isRepeatTrigger(input: string) {
  return REPEAT_TRIGGER_PATTERN.test(input.trim());
}

export function containsChinese(input: string) {
  return /[\u3400-\u9fff]/.test(input);
}

export function containsThai(input: string) {
  return /[\u0E00-\u0E7F]/.test(input);
}

export function getScenarioStorageKey(scenario: string) {
  return `${SCENARIO_STORAGE_PREFIX}${encodeURIComponent(scenario.trim())}`;
}

export function createScenarioSession(scenario: string): ScenarioSession {
  return {
    scenario,
    messages: [],
    showThaiScript: true,
    updatedAt: new Date().toISOString(),
  };
}

export function getOrCreatePracticeClientId(storage: Storage) {
  const existingClientId = storage.getItem(PRACTICE_CLIENT_ID_STORAGE_KEY)?.trim();

  if (existingClientId) {
    return existingClientId;
  }

  const nextClientId = crypto.randomUUID();
  storage.setItem(PRACTICE_CLIENT_ID_STORAGE_KEY, nextClientId);

  return nextClientId;
}

export function getPracticeDbMigrationKey(clientId: string) {
  return `${PRACTICE_DB_MIGRATION_PREFIX}${clientId}`;
}

export function createUserMessage(content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: "user",
    content,
    createdAt: new Date().toISOString(),
  };
}

export function formatAssistantContent(message: AssistantStructuredMessage) {
  const lines = [
    `Thai: ${message.thai}`,
    `Romanization: ${message.romanization}`,
    `Chinese: ${message.chinese}`,
  ];

  if (message.coachingNote) {
    lines.push(`Coaching note: ${message.coachingNote}`);
  }

  if (message.suggestedReply) {
    lines.push("Suggested answer:");
    lines.push(`Thai: ${message.suggestedReply.thai}`);
    lines.push(`Romanization: ${message.suggestedReply.romanization}`);
    lines.push(`Chinese: ${message.suggestedReply.chinese}`);
  }

  if (message.learnerTranslation) {
    lines.push("Learner translation:");
    lines.push(`Thai: ${message.learnerTranslation.thai}`);
    lines.push(`Romanization: ${message.learnerTranslation.romanization}`);
    lines.push(`Chinese: ${message.learnerTranslation.chinese}`);
  }

  if (message.repeatPrompt) {
    lines.push(message.repeatPrompt);
  }

  return lines.join("\n");
}

export function createAssistantMessage(
  structuredContent: AssistantStructuredMessage,
): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    content: formatAssistantContent(structuredContent),
    createdAt: new Date().toISOString(),
    structuredContent,
  };
}

export function attachLearnerTranslation(
  messages: ChatMessage[],
  learnerTranslation: SuggestedReply | null,
) {
  if (!learnerTranslation) {
    return messages;
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role !== "user") {
      continue;
    }

    const nextMessages = [...messages];
    nextMessages[index] = {
      ...nextMessages[index],
      learnerTranslation,
    };
    return nextMessages;
  }

  return messages;
}

export function parseScenarioSession(rawValue: string | null) {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as ScenarioSession;

    if (
      typeof parsed.scenario !== "string" ||
      !Array.isArray(parsed.messages) ||
      typeof parsed.showThaiScript !== "boolean"
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function sortScenarioSessionsByUpdatedAt<T extends { updatedAt: string }>(sessions: T[]) {
  return [...sessions].sort((left, right) => {
    const leftTime = new Date(left.updatedAt).getTime();
    const rightTime = new Date(right.updatedAt).getTime();

    return rightTime - leftTime;
  });
}

export function listStoredScenarioSessions(storage: Storage) {
  const sessions: ScenarioSession[] = [];

  for (let index = 0; index < storage.length; index += 1) {
    const storageKey = storage.key(index);

    if (!storageKey?.startsWith(SCENARIO_STORAGE_PREFIX)) {
      continue;
    }

    const parsedSession = parseScenarioSession(storage.getItem(storageKey));

    if (parsedSession) {
      sessions.push(parsedSession);
    }
  }

  return sortScenarioSessionsByUpdatedAt(sessions);
}

export function summarizeScenarioSession(session: ScenarioSession): ScenarioSessionSummary {
  return {
    scenario: session.scenario,
    messageCount: session.messages.length,
    updatedAt: session.updatedAt,
  };
}

export function summarizePracticeStats(sessions: ScenarioSessionSummary[]): PracticeStats {
  let totalMessages = 0;
  let latestUpdatedAt: string | null = null;
  let latestTimestamp = Number.NEGATIVE_INFINITY;
  const activeDayKeys = new Set<string>();

  for (const session of sessions) {
    totalMessages += session.messageCount;

    const timestamp = new Date(session.updatedAt).getTime();

    if (!Number.isNaN(timestamp)) {
      const date = new Date(timestamp);
      activeDayKeys.add(
        `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
          date.getDate(),
        ).padStart(2, "0")}`,
      );

      if (timestamp > latestTimestamp) {
        latestTimestamp = timestamp;
        latestUpdatedAt = session.updatedAt;
      }
    }
  }

  return {
    totalScenarios: sessions.length,
    totalMessages,
    activeDays: activeDayKeys.size,
    latestUpdatedAt,
  };
}
