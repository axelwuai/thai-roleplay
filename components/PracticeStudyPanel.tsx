"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";

import type {
  ListeningReviewMaterial,
  PracticeMaterialsApiResponse,
  PracticeMode,
  PracticeStudyCardMemory,
  ScenarioSession,
  SpeakingReviewMaterial,
  VocabularyNotesMaterial,
} from "@/lib/types";
import { AI_KEY_STORAGE_KEY } from "@/lib/utils";

type StudyMode = Exclude<PracticeMode, "conversation">;
type StudyMaterial = VocabularyNotesMaterial | ListeningReviewMaterial | SpeakingReviewMaterial;

type StudyCard = {
  id: string;
  chip: string;
  title: string;
  subtitle: string;
  promptTitle: string;
  promptBody: string;
  answerTitle: string;
  answerBody: string;
  detailLabel: string;
  detailBody: string;
  detailRomanization?: string;
  detailTranslation?: string;
  exampleTitle?: string;
  exampleThai?: string;
  exampleRomanization?: string;
  exampleChinese?: string;
  audioText?: string;
  audioLabel?: string;
};

type VocabularyChoice = {
  id: string;
  text: string;
  isCorrect: boolean;
};

interface PracticeStudyPanelProps {
  mode: StudyMode;
  scenario: string;
  session: ScenarioSession | null;
}

const MODE_META: Record<
  StudyMode,
  {
    badge: string;
    title: string;
    description: string;
    emptyHint: string;
    statLabel: string;
  }
> = {
  vocabulary: {
    badge: "Vocabulary Notes",
    title: "词汇笔记",
    description: "把场景对话拆成几张词汇卡，专门练关键词、场景义和用法。",
    emptyHint: "先在“场景对话”里聊上几轮，再回来生成词汇卡片。",
    statLabel: "词汇卡",
  },
  listening: {
    badge: "Listening Review",
    title: "听力复习",
    description: "把刚才的对话做成听力卡片，先听、再猜、再核对答案。",
    emptyHint: "先在“场景对话”里积累一些真实对话，再回来练听力卡片。",
    statLabel: "听力卡",
  },
  speaking: {
    badge: "Speaking Review",
    title: "口语复习",
    description: "把场景里的关键表达变成口语卡片，一次只练一句最值得开口的表达。",
    emptyHint: "先在“场景对话”里聊上几轮，再回来生成口语卡片。",
    statLabel: "口语卡",
  },
};

function SpeakerButton({
  isActive,
  onClick,
  label,
}: {
  isActive: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition ${
        isActive
          ? "border-[rgba(31,122,104,0.35)] bg-[var(--brand-soft)] text-[var(--brand)]"
          : "border-[var(--line)] bg-white text-[var(--text-soft)] hover:bg-[var(--accent-soft)]"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M5 10v4h3l4 4V6l-4 4H5Z" />
        <path d="M16 9.5a4 4 0 0 1 0 5" />
        <path d="M18.5 7a7.5 7.5 0 0 1 0 10" />
      </svg>
    </button>
  );
}

function containsThaiCharacters(text: string) {
  return /[\u0E00-\u0E7F]/u.test(text);
}

function hashText(text: string) {
  let hash = 0;

  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function compactThaiText(text: string) {
  return text.replace(/[\s.,!?，。！？、:;"'“”‘’()\-]/gu, "").trim();
}

function matchesThaiSnippet(fullText: string, snippet: string) {
  const normalizedFullText = compactThaiText(fullText);
  const normalizedSnippet = compactThaiText(snippet);

  if (!normalizedFullText || !normalizedSnippet) {
    return false;
  }

  return (
    normalizedFullText.includes(normalizedSnippet) || normalizedSnippet.includes(normalizedFullText)
  );
}

function resolveVocabularySourceDetails(
  note: VocabularyNotesMaterial["notes"][number],
  session: ScenarioSession | null,
) {
  const fallback = {
    sourceRomanization: note.sourceRomanization?.trim() ?? "",
    sourceChinese: note.sourceChinese?.trim() ?? "",
  };

  if (fallback.sourceRomanization && fallback.sourceChinese) {
    return fallback;
  }

  if (!session) {
    return fallback;
  }

  for (const message of session.messages) {
    if (message.role === "assistant" && message.structuredContent) {
      if (matchesThaiSnippet(message.structuredContent.thai, note.sourceExcerpt)) {
        return {
          sourceRomanization: fallback.sourceRomanization || message.structuredContent.romanization,
          sourceChinese: fallback.sourceChinese || message.structuredContent.chinese,
        };
      }
    }

    if (message.learnerTranslation?.thai) {
      if (matchesThaiSnippet(message.learnerTranslation.thai, note.sourceExcerpt)) {
        return {
          sourceRomanization: fallback.sourceRomanization || message.learnerTranslation.romanization,
          sourceChinese: fallback.sourceChinese || message.learnerTranslation.chinese,
        };
      }
    }
  }

  return fallback;
}

function buildCards(
  mode: StudyMode,
  material: StudyMaterial,
  session: ScenarioSession | null,
): StudyCard[] {
  if (mode === "vocabulary") {
    return (material as VocabularyNotesMaterial).notes.map((note, index) => ({
      ...resolveVocabularySourceDetails(note, session),
      id: `vocabulary-${index}`,
      chip: "词汇",
      title: note.term,
      subtitle: `${note.romanization} · ${note.chineseMeaning}`,
      promptTitle: "先回想这个词",
      promptBody: "先不看答案，试着说出它在这个场景里的意思，以及你会怎么用它。",
      answerTitle: note.chineseMeaning,
      answerBody: note.usageNote,
      detailLabel: "来自对话",
      detailBody: note.sourceExcerpt,
      exampleTitle: "例句",
      exampleThai: note.exampleThai,
      exampleRomanization: note.exampleRomanization,
      exampleChinese: note.exampleChinese,
      audioText: note.term,
      audioLabel: "播放这个词",
    }));
  }

  if (mode === "listening") {
    return (material as ListeningReviewMaterial).items.map((item, index) => ({
      id: `listening-${index}`,
      chip: "听力",
      title: item.focus,
      subtitle: item.question,
      promptTitle: "先听，再回答",
      promptBody: "先点播放，尽量不看答案，判断这句泰语在说什么、你需要听懂哪个重点。",
      answerTitle: item.answer,
      answerBody: `${item.thai}\n${item.romanization}`,
      detailLabel: "听力提示",
      detailBody: item.explanation,
      audioText: item.thai,
      audioLabel: "播放这句听力练习",
    }));
  }

  return (material as SpeakingReviewMaterial).drills.map((drill, index) => ({
    id: `speaking-${index}`,
    chip: "口语",
    title: drill.situation,
    subtitle: drill.cue,
    promptTitle: "先自己开口",
    promptBody: "先根据中文提示自己试着说，再翻卡核对更自然的泰语表达。",
    answerTitle: drill.targetThai,
    answerBody: drill.romanization,
    detailLabel: "教练提醒",
    detailBody: drill.coachingTip,
    audioText: drill.targetThai,
    audioLabel: "播放这句口语表达",
  }));
}

function buildSessionMaterialsKey(scenario: string, session: ScenarioSession | null) {
  if (!session) {
    return `${scenario}::empty`;
  }

  return JSON.stringify({
    scenario,
    messages: session.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      structuredContent: message.structuredContent,
      learnerTranslation: message.learnerTranslation,
    })),
  });
}

function buildVocabularyChoices(cards: StudyCard[], activeCard: StudyCard | null) {
  if (!activeCard) {
    return [];
  }

  const distractors = cards
    .filter((card) => card.id !== activeCard.id)
    .map((card) => card.answerTitle.trim())
    .filter((text, index, array) => text && array.indexOf(text) === index)
    .sort((left, right) => hashText(`${activeCard.id}:${left}`) - hashText(`${activeCard.id}:${right}`))
    .slice(0, 3);

  const choices: VocabularyChoice[] = [
    {
      id: `${activeCard.id}-correct`,
      text: activeCard.answerTitle,
      isCorrect: true,
    },
    ...distractors.map((text, index) => ({
      id: `${activeCard.id}-option-${index}`,
      text,
      isCorrect: false,
    })),
  ];

  return choices.sort(
    (left, right) => hashText(`${activeCard.id}:${left.text}:choice`) - hashText(`${activeCard.id}:${right.text}:choice`),
  );
}

export function PracticeStudyPanel({ mode, scenario, session }: PracticeStudyPanelProps) {
  const [materials, setMaterials] = useState<Partial<Record<StudyMode, StudyMaterial>>>({});
  const [cardMemories, setCardMemories] = useState<
    Partial<Record<StudyMode, Record<string, PracticeStudyCardMemory>>>
  >({});
  const [loadingMode, setLoadingMode] = useState<StudyMode | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [speechError, setSpeechError] = useState("");
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const [isAnswerVisible, setIsAnswerVisible] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [isReviewModeOpen, setIsReviewModeOpen] = useState(false);
  const [favoriteCardIds, setFavoriteCardIds] = useState<string[]>([]);
  const [selectedVocabularyChoiceId, setSelectedVocabularyChoiceId] = useState<string | null>(null);
  const voiceLoadPromiseRef = useRef<Promise<SpeechSynthesisVoice[]> | null>(null);
  const reviewSeenCardIdsRef = useRef<Set<string>>(new Set());
  const activeFocusRef = useRef<{
    cardId: string;
    mode: StudyMode;
    startedAt: number;
  } | null>(null);

  const currentMaterial = materials[mode];
  const hasEnoughConversation = Boolean(
    session &&
      session.messages.length >= 2 &&
      session.messages.some((message) => message.role === "user"),
  );
  const sessionMaterialsKey = useMemo(
    () => buildSessionMaterialsKey(scenario, session),
    [scenario, session],
  );

  const cards = useMemo(
    () => (currentMaterial ? buildCards(mode, currentMaterial, session) : []),
    [currentMaterial, mode, session],
  );
  const currentCardMemories = cardMemories[mode] ?? {};
  const favoriteCardIdSet = useMemo(() => {
    const ids = new Set(favoriteCardIds);

    Object.values(currentCardMemories).forEach((memory) => {
      if (memory.isFavorite) {
        ids.add(memory.cardId);
      }
    });

    return ids;
  }, [currentCardMemories, favoriteCardIds]);

  const reviewCards = useMemo(() => {
    const rankedCards = cards
      .map((card, index) => ({
        card,
        index,
        score: currentCardMemories[card.id]?.finalScore ?? 0,
        isFavorite: favoriteCardIdSet.has(card.id),
      }))
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        if (left.isFavorite !== right.isFavorite) {
          return left.isFavorite ? -1 : 1;
        }

        return left.index - right.index;
      })
      .map((item) => item.card);

    if (mode !== "vocabulary" || favoriteCardIdSet.size === 0) {
      return rankedCards;
    }

    const weightedFavorites = rankedCards.filter((card) => favoriteCardIdSet.has(card.id));

    return [...rankedCards, ...weightedFavorites];
  }, [cards, currentCardMemories, favoriteCardIdSet, mode]);

  const visibleCards = isReviewModeOpen ? reviewCards : cards;
  const activeCard = visibleCards[activeCardIndex] ?? null;
  const vocabularyChoices = useMemo(
    () => (mode === "vocabulary" && isReviewModeOpen ? buildVocabularyChoices(cards, activeCard) : []),
    [activeCard, cards, isReviewModeOpen, mode],
  );
  const selectedVocabularyChoice =
    vocabularyChoices.find((choice) => choice.id === selectedVocabularyChoiceId) ?? null;
  const progressLabel =
    visibleCards.length > 0 ? `${activeCardIndex + 1} / ${visibleCards.length}` : "0 / 0";

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    setMaterials({});
    setLoadingMode(null);
    setErrorMessage("");
    setSpeechError("");
    setSpeakingKey(null);
    setActiveCardIndex(0);
    setIsAnswerVisible(false);
    setIsReviewModeOpen(false);
    setFavoriteCardIds([]);
    setCardMemories({});
    setSelectedVocabularyChoiceId(null);
    reviewSeenCardIdsRef.current = new Set();
    activeFocusRef.current = null;
  }, [sessionMaterialsKey]);

  useEffect(() => {
    setActiveCardIndex(0);
    setIsAnswerVisible(false);
    setSpeechError("");
    setSpeakingKey(null);
    setIsReviewModeOpen(false);
    setSelectedVocabularyChoiceId(null);
    reviewSeenCardIdsRef.current = new Set();
  }, [mode]);

  useEffect(() => {
    if (visibleCards.length === 0) {
      setActiveCardIndex(0);
      return;
    }

    setActiveCardIndex((currentIndex) => Math.min(currentIndex, visibleCards.length - 1));
  }, [visibleCards.length]);

  useEffect(() => {
    setSelectedVocabularyChoiceId(null);
  }, [activeCardIndex, isReviewModeOpen, mode]);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const loadVoices = async (synth: SpeechSynthesis) => {
    const existingVoices = synth.getVoices();

    if (existingVoices.length > 0) {
      return existingVoices;
    }

    if (voiceLoadPromiseRef.current) {
      return voiceLoadPromiseRef.current;
    }

    voiceLoadPromiseRef.current = new Promise<SpeechSynthesisVoice[]>((resolve) => {
      const cleanup = () => {
        synth.removeEventListener("voiceschanged", handleVoicesChanged);
        window.clearTimeout(timeoutId);
        voiceLoadPromiseRef.current = null;
      };

      const handleVoicesChanged = () => {
        cleanup();
        resolve(synth.getVoices());
      };

      const timeoutId = window.setTimeout(() => {
        cleanup();
        resolve(synth.getVoices());
      }, 1500);

      synth.addEventListener("voiceschanged", handleVoicesChanged);
    });

    return voiceLoadPromiseRef.current;
  };

  const playThai = async (text: string, key: string) => {
    if (!text.trim() || typeof window === "undefined" || !("speechSynthesis" in window)) {
      setSpeechError("当前浏览器暂时不能播放泰语语音。");
      return;
    }

    const synth = window.speechSynthesis;

    if (speakingKey === key && synth.speaking) {
      synth.cancel();
      setSpeakingKey(null);
      setSpeechError("");
      return;
    }

    setSpeechError("");
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const voices = await loadVoices(synth);
    const thaiVoice = voices.find((voice) => voice.lang.toLowerCase().startsWith("th"));

    utterance.lang = "th-TH";
    utterance.rate = 0.92;
    utterance.pitch = 1;

    if (thaiVoice) {
      utterance.voice = thaiVoice;
    }

    utterance.onstart = () => {
      setSpeakingKey(key);
    };

    utterance.onend = () => {
      setSpeakingKey((current) => (current === key ? null : current));
    };

    utterance.onerror = () => {
      setSpeakingKey((current) => (current === key ? null : current));
      setSpeechError("这台设备暂时无法播放泰语语音。");
    };

    setSpeakingKey(key);
    window.setTimeout(() => {
      synth.speak(utterance);
    }, 0);
  };

  const mergeCardMemory = (targetMode: StudyMode, memory: PracticeStudyCardMemory | null | undefined) => {
    if (!memory) {
      return;
    }

    setCardMemories((current) => ({
      ...current,
      [targetMode]: {
        ...(current[targetMode] ?? {}),
        [memory.cardId]: memory,
      },
    }));
  };

  const replaceCardMemories = (
    targetMode: StudyMode,
    nextMemories: PracticeStudyCardMemory[] | undefined,
  ) => {
    setCardMemories((current) => ({
      ...current,
      [targetMode]: Object.fromEntries(
        (nextMemories ?? []).map((memory) => [memory.cardId, memory]),
      ),
    }));
  };

  const trackCardEvent = async (
    targetMode: StudyMode,
    cardId: string,
    event: "open" | "audio_play" | "answer_reveal" | "review_view" | "focus" | "favorite",
    options?: {
      focusMs?: number;
      revisit?: boolean;
      isFavorite?: boolean;
    },
  ) => {
    if (!session) {
      return;
    }

    try {
      const response = await fetch("/api/practice-materials", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          scenario,
          mode: targetMode,
          messages: session.messages,
          cardId,
          event,
          focusMs: options?.focusMs,
          revisit: options?.revisit,
          isFavorite: options?.isFavorite,
        }),
      });

      if (!response.ok) {
        return;
      }

      const data = (await response.json().catch(() => ({}))) as {
        memory?: PracticeStudyCardMemory;
      };

      mergeCardMemory(targetMode, data.memory);
    } catch (error) {
      console.error("[PracticeStudyPanel] failed to track study card event", error);
    }
  };

  const flushActiveFocus = () => {
    const currentFocus = activeFocusRef.current;

    if (!currentFocus) {
      return;
    }

    activeFocusRef.current = null;

    const elapsedMs = Date.now() - currentFocus.startedAt;

    if (elapsedMs < 1500) {
      return;
    }

    void trackCardEvent(currentFocus.mode, currentFocus.cardId, "focus", {
      focusMs: elapsedMs,
    });
  };

  const loadMaterial = async (targetMode: StudyMode, force = false) => {
    if (!session || !hasEnoughConversation) {
      return;
    }

    if (!force && materials[targetMode]) {
      return;
    }

    setLoadingMode(targetMode);
    setErrorMessage("");

    try {
      const localApiKey =
        typeof window !== "undefined"
          ? window.localStorage.getItem(AI_KEY_STORAGE_KEY)?.trim() ?? ""
          : "";

      const response = await fetch("/api/practice-materials", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(localApiKey
            ? {
                "x-ai-api-key": localApiKey,
              }
            : {}),
        },
        body: JSON.stringify({
          scenario,
          mode: targetMode,
          messages: session.messages,
          force,
        }),
      });

      const data = (await response.json()) as PracticeMaterialsApiResponse | { error?: string };

      if (!response.ok || !("material" in data)) {
        throw new Error("error" in data ? data.error : "暂时无法生成复习内容。");
      }

      setMaterials((current) => ({
        ...current,
        [targetMode]: data.material as StudyMaterial,
      }));
      replaceCardMemories(
        targetMode,
        "cardMemories" in data && Array.isArray(data.cardMemories) ? data.cardMemories : [],
      );
      setActiveCardIndex(0);
      setIsAnswerVisible(false);

      if (targetMode === "vocabulary") {
        setFavoriteCardIds(
          "favoriteCardIds" in data && Array.isArray(data.favoriteCardIds)
            ? data.favoriteCardIds
            : [],
        );
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "暂时无法生成复习内容。");
    } finally {
      setLoadingMode((current) => (current === targetMode ? null : current));
    }
  };

  useEffect(() => {
    if (!hasEnoughConversation || currentMaterial || loadingMode === mode) {
      return;
    }

    void loadMaterial(mode);
  }, [currentMaterial, hasEnoughConversation, loadingMode, mode]);

  useEffect(() => {
    flushActiveFocus();

    if (!activeCard) {
      return;
    }

    activeFocusRef.current = {
      cardId: activeCard.id,
      mode,
      startedAt: Date.now(),
    };

    return () => {
      flushActiveFocus();
    };
  }, [activeCard?.id, isReviewModeOpen, mode]);

  useEffect(() => {
    if (!isReviewModeOpen || !activeCard) {
      return;
    }

    const revisit = reviewSeenCardIdsRef.current.has(activeCard.id);
    reviewSeenCardIdsRef.current.add(activeCard.id);
    void trackCardEvent(mode, activeCard.id, "review_view", { revisit });
  }, [activeCard, isReviewModeOpen, mode]);

  const jumpToCard = (index: number, source: "sidebar" | "review" = "review") => {
    flushActiveFocus();
    setActiveCardIndex(index);
    setIsAnswerVisible(false);
    setSelectedVocabularyChoiceId(null);
    setSpeechError("");
    setSpeakingKey(null);

    if (source === "sidebar" && cards[index]) {
      void trackCardEvent(mode, cards[index].id, "open");
    }
  };

  const toggleFavoriteCard = (cardId: string) => {
    if (!session || mode !== "vocabulary") {
      return;
    }

    setFavoriteCardIds((currentIds) => {
      const nextFavoriteCardIds = currentIds.includes(cardId)
        ? currentIds.filter((id) => id !== cardId)
        : [...currentIds, cardId];
      const isFavorite = nextFavoriteCardIds.includes(cardId);

      void trackCardEvent("vocabulary", cardId, "favorite", {
        isFavorite,
      });

      void (async () => {
        try {
          const localApiKey =
            typeof window !== "undefined"
              ? window.localStorage.getItem(AI_KEY_STORAGE_KEY)?.trim() ?? ""
              : "";

          const response = await fetch("/api/practice-materials", {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              ...(localApiKey
                ? {
                    "x-ai-api-key": localApiKey,
                  }
                : {}),
            },
            body: JSON.stringify({
              scenario,
              mode: "vocabulary",
              messages: session.messages,
              favoriteCardIds: nextFavoriteCardIds,
            }),
          });

          if (!response.ok) {
            const data = (await response.json().catch(() => ({}))) as { error?: string };
            throw new Error(data.error ?? "暂时无法保存重点词。");
          }
        } catch (error) {
          console.error("[PracticeStudyPanel] failed to persist favorite study cards", error);
        }
      })();

      return nextFavoriteCardIds;
    });
  };

  const renderReviewCard = (isFullscreen = false) => {
    if (!activeCard) {
      return null;
    }

    const isFavorite = favoriteCardIds.includes(activeCard.id);
    const isVocabularyPreview = mode === "vocabulary" && !isFullscreen;
    const isVocabularyQuiz = mode === "vocabulary" && isFullscreen;

    return (
      <div className="flex h-full flex-col gap-4">
        <div
          className={`flex flex-wrap items-center justify-between gap-3 rounded-[22px] px-4 py-3 shadow-[0_10px_24px_rgba(79,92,90,0.04)] ${
            isFullscreen ? "bg-white/82" : "bg-white/86"
          }`}
        >
          <div>
            <p className="text-[11px] font-medium tracking-[0.16em] text-[var(--brand)] uppercase">
              {isFullscreen ? "Review Mode" : "Card Practice"}
            </p>
            <p className="mt-1 text-sm text-[var(--text-soft)]">当前卡片：{progressLabel}</p>
          </div>
          <div className="flex flex-wrap gap-2">
                  {isFullscreen ? (
                    <button
                      type="button"
                      onClick={() => setIsReviewModeOpen(false)}
                      className="rounded-full border border-[var(--line)] bg-white px-4 py-2 text-sm font-medium text-[var(--text-soft)] transition hover:bg-[var(--accent-soft)]"
                    >
                      退出复习
                    </button>
                  ) : null}
            <button
              type="button"
              onClick={() => jumpToCard(Math.max(activeCardIndex - 1, 0))}
              disabled={activeCardIndex === 0}
              className="rounded-full border border-[var(--line)] bg-white px-4 py-2 text-sm font-medium text-[var(--text-soft)] transition hover:bg-[var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              上一张
            </button>
            <button
              type="button"
              onClick={() => jumpToCard(Math.min(activeCardIndex + 1, visibleCards.length - 1))}
              disabled={activeCardIndex >= visibleCards.length - 1}
              className="rounded-full border border-[var(--line)] bg-white px-4 py-2 text-sm font-medium text-[var(--text-soft)] transition hover:bg-[var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              下一张
            </button>
          </div>
        </div>

        <article
          className={`glass-card flex flex-1 flex-col rounded-[30px] border border-[rgba(31,122,104,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(252,248,242,0.98)_100%)] ${
            isFullscreen ? "px-6 py-6 sm:px-8 sm:py-8" : "px-5 py-5 sm:px-6 sm:py-6"
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <span className="inline-flex rounded-full bg-[var(--brand-soft)] px-3 py-1 text-[11px] font-medium tracking-[0.14em] text-[var(--brand)]">
                {activeCard.chip}
              </span>
              <div className="mt-3 flex items-start gap-2">
                <h3
                  className={`font-semibold text-[var(--text)] ${
                    isFullscreen ? "text-3xl sm:text-4xl" : "text-2xl"
                  }`}
                >
                  {activeCard.title}
                </h3>
                {mode === "vocabulary" && activeCard.audioText ? (
                    <SpeakerButton
                      isActive={speakingKey === activeCard.id}
                      onClick={() => {
                        void trackCardEvent(mode, activeCard.id, "audio_play");
                        void playThai(activeCard.audioText ?? "", activeCard.id);
                      }}
                    label={activeCard.audioLabel ?? "播放卡片音频"}
                  />
                ) : null}
              </div>
              {!isFullscreen ? (
                <p className="mt-2 text-sm leading-7 text-[var(--text-soft)]">{activeCard.subtitle}</p>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              {mode === "vocabulary" && !isFullscreen ? (
                <button
                  type="button"
                  onClick={() => toggleFavoriteCard(activeCard.id)}
                  aria-label={isFavorite ? "取消重点学习" : "标记重点学习"}
                  title={isFavorite ? "取消重点学习" : "标记重点学习"}
                  className={`inline-flex h-10 min-w-10 items-center justify-center rounded-full border px-3 text-lg transition ${
                    isFavorite
                      ? "border-[rgba(220,97,124,0.28)] bg-[rgba(255,238,243,0.94)] text-[#d85a7c]"
                      : "border-[var(--line)] bg-white text-[var(--text-soft)] hover:bg-[rgba(255,238,243,0.72)]"
                  }`}
                >
                  💗
                </button>
              ) : null}

              {activeCard.audioText && mode !== "vocabulary" ? (
                <SpeakerButton
                  isActive={speakingKey === activeCard.id}
                  onClick={() => playThai(activeCard.audioText ?? "", activeCard.id)}
                  label={activeCard.audioLabel ?? "播放卡片音频"}
                />
              ) : null}
            </div>
          </div>

          {isVocabularyPreview ? (
            <div className="mt-6 space-y-4">
              <section className="rounded-[24px] bg-[rgba(217,240,233,0.22)] px-5 py-5">
                <p className="text-xs font-medium tracking-[0.16em] text-[var(--brand)]">词汇解析</p>
                <p className="mt-3 text-xl font-semibold leading-8 text-[var(--text)]">
                  {activeCard.answerTitle}
                </p>
                <p className="mt-3 text-sm leading-8 text-[var(--text-soft)]">
                  {activeCard.answerBody}
                </p>
              </section>

              <section className="rounded-[20px] bg-white/72 px-4 py-4">
                <p className="text-xs font-medium tracking-[0.16em] text-[var(--brand)]">
                  {activeCard.detailLabel}
                </p>
                <div className="mt-2 flex items-start gap-2">
                  <p className="thai-text flex-1 whitespace-pre-wrap text-base font-semibold leading-8 text-[var(--text)]">
                    {activeCard.detailBody}
                  </p>
                  {containsThaiCharacters(activeCard.detailBody) ? (
                    <SpeakerButton
                      isActive={speakingKey === `${activeCard.id}-detail`}
                      onClick={() => {
                        void trackCardEvent(mode, activeCard.id, "audio_play");
                        void playThai(activeCard.detailBody, `${activeCard.id}-detail`);
                      }}
                      label="播放来自对话的泰语片段"
                    />
                  ) : null}
                </div>
                {activeCard.detailRomanization ? (
                  <p className="mt-2 text-sm leading-7 text-[#8a4e28]">
                    {activeCard.detailRomanization}
                  </p>
                ) : null}
                {activeCard.detailTranslation ? (
                  <p className="mt-2 text-sm leading-7 text-[var(--text-soft)]">
                    {activeCard.detailTranslation}
                  </p>
                ) : null}
              </section>

              {activeCard.exampleThai ? (
                <section className="rounded-[20px] bg-[var(--accent-soft)] px-4 py-4">
                  <p className="text-xs font-medium tracking-[0.16em] text-[#ab6231]">
                    {activeCard.exampleTitle}
                  </p>
                  <div className="mt-2 flex items-start gap-2">
                    <p className="thai-text flex-1 text-lg font-semibold leading-8 text-[var(--text)]">
                      {activeCard.exampleThai}
                    </p>
                    <SpeakerButton
                      isActive={speakingKey === `${activeCard.id}-example`}
                      onClick={() => {
                        void trackCardEvent(mode, activeCard.id, "audio_play");
                        void playThai(activeCard.exampleThai ?? "", `${activeCard.id}-example`);
                      }}
                      label="播放例句泰语"
                    />
                  </div>
                  <p className="mt-2 text-sm leading-7 text-[#8a4e28]">
                    {activeCard.exampleRomanization}
                  </p>
                  <p className="mt-2 text-sm leading-7 text-[#8a4e28]">
                    {activeCard.exampleChinese}
                  </p>
                </section>
              ) : null}

              {isFavorite ? (
                <p className="text-sm leading-7 text-[#d85a7c]">
                  已标记重点学习。开始复习后，这个词会更频繁出现。
                </p>
              ) : null}
            </div>
          ) : (
            <div
              className={`mt-6 grid flex-1 gap-4 ${
                isFullscreen ? "lg:grid-cols-1" : "lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]"
              }`}
            >
              <section
                className={`rounded-[24px] px-5 py-5 ${
                  isFullscreen
                    ? "bg-[linear-gradient(135deg,rgba(217,240,233,0.42)_0%,rgba(255,249,242,0.72)_100%)]"
                    : "bg-[rgba(217,240,233,0.22)]"
                }`}
              >
                <p className="text-xs font-medium tracking-[0.16em] text-[var(--brand)]">练习目标</p>
                {isVocabularyQuiz ? (
                  <div className="mt-3">
                    <p className="text-2xl font-semibold leading-8 text-[var(--text)]">
                      这个词在当前场景里，最接近哪个中文意思？
                    </p>
                    <div className="mt-5 space-y-3">
                      {vocabularyChoices.map((choice, index) => {
                        const isSelected = selectedVocabularyChoiceId === choice.id;
                        const hasAnswered = Boolean(selectedVocabularyChoice);
                        const showCorrect = hasAnswered && choice.isCorrect;
                        const showWrong = hasAnswered && isSelected && !choice.isCorrect;

                        return (
                          <button
                            key={choice.id}
                            type="button"
                            onClick={() => {
                              if (selectedVocabularyChoice) {
                                return;
                              }

                              setSelectedVocabularyChoiceId(choice.id);
                              setIsAnswerVisible(true);
                              void trackCardEvent(mode, activeCard.id, "answer_reveal");
                            }}
                            disabled={hasAnswered}
                            className={`w-full rounded-[20px] border px-4 py-4 text-left transition ${
                              showCorrect
                                ? "border-[rgba(31,122,104,0.26)] bg-[rgba(217,240,233,0.7)]"
                                : showWrong
                                  ? "border-[rgba(220,104,72,0.28)] bg-[rgba(255,241,235,0.96)]"
                                  : isSelected
                                    ? "border-[rgba(31,122,104,0.16)] bg-white"
                                    : "border-[var(--line)] bg-white/88 hover:-translate-y-0.5 hover:bg-white"
                            } disabled:cursor-default`}
                          >
                            <div className="flex items-start gap-3">
                              <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[rgba(31,122,104,0.08)] text-sm font-semibold text-[var(--brand)]">
                                {String.fromCharCode(65 + index)}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="text-base font-medium leading-7 text-[var(--text)]">
                                  {choice.text}
                                </p>
                                {showCorrect ? (
                                  <p className="mt-1 text-sm leading-6 text-[var(--brand)]">
                                    正确答案
                                  </p>
                                ) : null}
                                {showWrong ? (
                                  <p className="mt-1 text-sm leading-6 text-[#a54d2c]">
                                    你选的是这个，但正确答案不是它
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    {selectedVocabularyChoice ? (
                      <div
                        className={`mt-4 rounded-[20px] px-4 py-4 ${
                          selectedVocabularyChoice.isCorrect
                            ? "bg-[rgba(217,240,233,0.72)] text-[var(--brand)]"
                            : "bg-[rgba(255,241,235,0.96)] text-[#a54d2c]"
                        }`}
                      >
                        <p className="text-base font-semibold leading-7">
                          {selectedVocabularyChoice.isCorrect ? "答对了" : "答错了"}
                        </p>
                        <p className="mt-1 text-sm leading-7">
                          正确答案：{activeCard.answerTitle}
                        </p>
                      </div>
                    ) : (
                      <p className="mt-4 text-sm leading-7 text-[var(--text-soft)]">
                        请选择一个中文意思，系统会立即判断并告诉你正确答案。
                      </p>
                    )}
                  </div>
                ) : (
                  <>
                    <p
                      className={`mt-3 font-semibold leading-8 text-[var(--text)] ${
                        isFullscreen ? "text-2xl" : "text-lg"
                      }`}
                    >
                      {activeCard.promptTitle}
                    </p>
                    <p
                      className={`mt-3 text-[var(--text-soft)] ${
                        isFullscreen ? "text-base leading-8" : "text-sm leading-8"
                      }`}
                    >
                      {activeCard.promptBody}
                    </p>
                  </>
                )}
              </section>

              <section
                className={`rounded-[24px] border px-5 py-5 transition ${
                  isAnswerVisible
                    ? "border-[rgba(31,122,104,0.16)] bg-white"
                    : "border-dashed border-[rgba(31,122,104,0.16)] bg-[rgba(255,255,255,0.72)]"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-medium tracking-[0.16em] text-[var(--brand)]">
                    {isVocabularyQuiz
                      ? selectedVocabularyChoice
                        ? "答题结果"
                        : "等待作答"
                      : isAnswerVisible
                        ? "翻到答案面"
                        : "先自己想一想"}
                  </p>
                  {!isVocabularyQuiz ? (
                    <button
                      type="button"
                      onClick={() =>
                        setIsAnswerVisible((current) => {
                          const nextValue = !current;

                          if (nextValue) {
                            void trackCardEvent(mode, activeCard.id, "answer_reveal");
                          }

                          return nextValue;
                        })
                      }
                      className="rounded-full border border-[var(--line)] bg-white px-4 py-2 text-sm font-medium text-[var(--text-soft)] transition hover:bg-[var(--accent-soft)]"
                    >
                      {isAnswerVisible ? "收起答案" : "显示答案"}
                    </button>
                  ) : null}
                </div>

                {isAnswerVisible ? (
                  <div className="mt-5 space-y-4">
                    <div className="rounded-[20px] bg-[var(--accent-soft)] px-4 py-4">
                      <p className="text-xs font-medium tracking-[0.16em] text-[#ab6231]">标准答案</p>
                      <p
                        className={`thai-text mt-2 whitespace-pre-wrap font-semibold leading-8 text-[var(--text)] ${
                          isFullscreen ? "text-2xl" : "text-lg"
                        }`}
                      >
                        {activeCard.answerTitle}
                      </p>
                      <p
                        className={`mt-2 whitespace-pre-wrap text-[#8a4e28] ${
                          isFullscreen ? "text-base leading-8" : "text-sm leading-7"
                        }`}
                      >
                        {activeCard.answerBody}
                      </p>
                    </div>

                    <div className="rounded-[20px] bg-[rgba(217,240,233,0.32)] px-4 py-4">
                      <p className="text-xs font-medium tracking-[0.16em] text-[var(--brand)]">
                        {activeCard.detailLabel}
                      </p>
                      <p
                        className={`mt-2 whitespace-pre-wrap text-[var(--text)] ${
                          isFullscreen ? "text-base leading-8" : "text-sm leading-7"
                        }`}
                      >
                        {activeCard.detailBody}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div
                    className={`mt-5 flex items-center justify-center rounded-[20px] bg-[linear-gradient(135deg,rgba(255,249,242,0.92)_0%,rgba(217,240,233,0.38)_100%)] px-6 text-center ${
                      isFullscreen ? "min-h-[360px]" : "h-[260px]"
                    }`}
                  >
                    <div>
                      <p
                        className={`font-semibold text-[var(--text)] ${
                          isFullscreen ? "text-xl" : "text-base"
                        }`}
                      >
                        {isVocabularyQuiz ? "先选择一个答案" : "先自己尝试，再翻卡核对"}
                      </p>
                      {!isFullscreen ? (
                        <p className="mt-3 text-sm leading-7 text-[var(--text-soft)]">
                          这样更容易真正记住这个词、听力点或口语表达。
                        </p>
                      ) : isVocabularyQuiz ? (
                        <p className="mt-3 text-sm leading-7 text-[var(--text-soft)]">
                          选完后系统会立即判断对错，并展示正确答案和解析。
                        </p>
                      ) : null}
                    </div>
                  </div>
                )}
              </section>
            </div>
          )}

          {speechError ? <p className="mt-4 text-sm leading-7 text-[#a54d2c]">{speechError}</p> : null}
        </article>
      </div>
    );
  };

  return (
    <>
      <section className="glass-card overflow-hidden rounded-[var(--radius-xl)]">
        <div className="border-b border-[var(--line)] bg-white/55 px-4 py-4 sm:px-5">
          <p className="text-[11px] font-medium tracking-[0.16em] text-[var(--brand)] uppercase">
            {MODE_META[mode].badge}
          </p>
          <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text)]">{MODE_META[mode].title}</h2>
              <p className="mt-1 text-sm leading-7 text-[var(--text-soft)]">
                {MODE_META[mode].description}
              </p>
              {cards.length > 0 ? (
                <p className="mt-1 text-xs leading-6 text-[var(--text-soft)]">
                  开始复习后，会优先排列你更常回看、重听、翻答案或标重点的内容。
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => {
                flushActiveFocus();
                reviewSeenCardIdsRef.current = new Set();
                setActiveCardIndex(0);
                setIsAnswerVisible(false);
                setIsReviewModeOpen(true);
              }}
              disabled={!activeCard || loadingMode === mode}
              className="rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white transition hover:-translate-y-0.5 hover:bg-[#166755] disabled:cursor-not-allowed disabled:opacity-60"
            >
              开始复习
            </button>
          </div>
        </div>

        <div className="grid min-h-[620px] bg-[rgba(244,240,234,0.72)] lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="border-b border-[var(--line)] bg-[rgba(255,252,247,0.78)] p-4 lg:border-b-0 lg:border-r">
            <div className="space-y-4">
              <section className="rounded-[22px] bg-white/88 px-4 py-4 shadow-[0_10px_24px_rgba(79,92,90,0.04)]">
                <p className="text-xs font-medium tracking-[0.16em] text-[var(--brand)]">练习概览</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-[18px] bg-[var(--brand-soft)] px-3 py-3">
                    <p className="text-[11px] tracking-[0.14em] text-[var(--brand)] uppercase">
                      {MODE_META[mode].statLabel}
                    </p>
                    <p className="mt-1 text-xl font-semibold text-[var(--text)]">{cards.length}</p>
                  </div>
                  <div className="rounded-[18px] bg-[var(--accent-soft)] px-3 py-3">
                    <p className="text-[11px] tracking-[0.14em] text-[#ab6231] uppercase">当前</p>
                    <p className="mt-1 text-xl font-semibold text-[var(--text)]">
                      {isReviewModeOpen ? progressLabel : cards.length > 0 ? `${activeCardIndex + 1} / ${cards.length}` : "0 / 0"}
                    </p>
                  </div>
                </div>
                {currentMaterial ? (
                  <p className="mt-3 text-sm leading-7 text-[var(--text-soft)]">
                    {"summary" in currentMaterial ? currentMaterial.summary : ""}
                  </p>
                ) : null}
              </section>

              {errorMessage ? (
                <div className="rounded-[20px] border border-[rgba(220,104,72,0.2)] bg-[rgba(255,241,235,0.94)] px-4 py-4 text-sm leading-7 text-[#a54d2c]">
                  {errorMessage}
                </div>
              ) : null}

              {!session ? (
                <div className="rounded-[20px] border border-dashed border-[var(--line)] bg-white/72 px-4 py-6 text-sm leading-7 text-[var(--text-soft)]">
                  正在读取这个场景的对话内容...
                </div>
              ) : !hasEnoughConversation ? (
                <div className="rounded-[20px] border border-dashed border-[var(--line)] bg-white/72 px-4 py-6 text-sm leading-7 text-[var(--text-soft)]">
                  {MODE_META[mode].emptyHint}
                </div>
              ) : loadingMode === mode && !currentMaterial ? (
                <div className="rounded-[20px] border border-[rgba(31,122,104,0.12)] bg-white/82 px-4 py-6 text-sm leading-7 text-[var(--text-soft)]">
                  正在根据这段场景对话生成卡片...
                </div>
              ) : (
                <div className="space-y-2">
                  {cards.map((card, index) => {
                    const isActive = !isReviewModeOpen && index === activeCardIndex;
                    const isFavorite = favoriteCardIds.includes(card.id);

                    return (
                      <button
                        key={card.id}
                        type="button"
                        onClick={() => jumpToCard(index, "sidebar")}
                        className={`w-full rounded-[22px] border px-4 py-4 text-left transition ${
                          isActive
                            ? "border-[rgba(31,122,104,0.2)] bg-[var(--brand-soft)] shadow-[0_12px_24px_rgba(79,92,90,0.08)]"
                            : "border-[var(--line)] bg-white/88 hover:-translate-y-0.5 hover:bg-white"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="rounded-full bg-white/82 px-2.5 py-1 text-[11px] font-medium text-[var(--brand)]">
                            {card.chip}
                          </span>
                          <div className="flex items-center gap-2">
                            {mode === "vocabulary" && isFavorite ? (
                              <span className="text-sm text-[#d85a7c]">💗</span>
                            ) : null}
                            <span className="text-xs text-[var(--text-soft)]">
                              {index + 1}/{cards.length}
                            </span>
                          </div>
                        </div>
                        <p className="mt-3 line-clamp-2 text-sm font-semibold leading-6 text-[var(--text)]">
                          {card.title}
                        </p>
                        <p className="mt-1 line-clamp-2 text-sm leading-6 text-[var(--text-soft)]">
                          {card.subtitle}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>

          <div className="p-4 sm:p-5">
            {activeCard ? (
              renderReviewCard()
            ) : (
              <div className="flex h-full min-h-[420px] items-center justify-center rounded-[24px] border border-dashed border-[var(--line)] bg-white/72 px-6 text-center text-sm leading-7 text-[var(--text-soft)]">
                这部分会在有足够对话内容后自动生成练习卡片。
              </div>
            )}
          </div>
        </div>
      </section>

      {isReviewModeOpen && isMounted && activeCard
        ? createPortal(
            <div className="fixed inset-0 z-[120] bg-[rgba(31,42,44,0.6)] p-3 sm:p-4">
              <div className="mx-auto flex h-full w-full max-w-5xl flex-col rounded-[34px] border border-[rgba(255,255,255,0.18)] bg-[rgba(245,240,232,0.97)] p-3 shadow-[0_24px_80px_rgba(16,24,24,0.28)] backdrop-blur sm:p-4">
                {renderReviewCard(true)}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
