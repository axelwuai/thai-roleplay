"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";

import type { ChatMessage, VocabularyApiResponse, VocabularyExplanation } from "@/lib/types";
import { AI_KEY_STORAGE_KEY } from "@/lib/utils";

interface MessageBubbleProps {
  message: ChatMessage;
  showThaiScript: boolean;
  deleteDisabled?: boolean;
  onDelete?: () => void;
}

interface SpeakerButtonProps {
  isActive: boolean;
  onClick: () => void;
  label?: string;
}

type ThaiSegment = {
  text: string;
  isWord: boolean;
};

function SpeakerButton({
  isActive,
  onClick,
  label = "播放泰语语音",
}: SpeakerButtonProps) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      aria-label={label}
      title={label}
      className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition ${
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

function segmentThaiText(text: string): ThaiSegment[] {
  if (!text.trim()) {
    return [];
  }

  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter("th", { granularity: "word" });

    return Array.from(segmenter.segment(text)).map((segment) => ({
      text: segment.segment,
      isWord: Boolean(segment.isWordLike) && containsThaiCharacters(segment.segment),
    }));
  }

  return text
    .split(/(\s+|[.,!?，。！？、:;()[\]{}"'“”]+)/u)
    .filter(Boolean)
    .map((part) => ({
      text: part,
      isWord: containsThaiCharacters(part),
    }));
}

export function MessageBubble({
  message,
  showThaiScript,
  deleteDisabled = false,
  onDelete,
}: MessageBubbleProps) {
  const [copyLabel, setCopyLabel] = useState("复制");
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);
  const [speechError, setSpeechError] = useState("");
  const [selectedVocabulary, setSelectedVocabulary] = useState<VocabularyExplanation | null>(null);
  const [selectedVocabularyKey, setSelectedVocabularyKey] = useState<string | null>(null);
  const [selectedVocabularyTerm, setSelectedVocabularyTerm] = useState("");
  const [selectedVocabularySentence, setSelectedVocabularySentence] = useState("");
  const [isVocabularyLoading, setIsVocabularyLoading] = useState(false);
  const [vocabularyError, setVocabularyError] = useState("");
  const [vocabularyCache, setVocabularyCache] = useState<Record<string, VocabularyExplanation>>({});
  const voiceLoadPromiseRef = useRef<Promise<SpeechSynthesisVoice[]> | null>(null);

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
      setSpeechError("当前浏览器不支持语音播放。");
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
      setSpeakingKey((currentKey) => (currentKey === key ? null : currentKey));
    };

    utterance.onerror = () => {
      setSpeakingKey((currentKey) => (currentKey === key ? null : currentKey));
      setSpeechError("这台设备暂时无法播放泰语语音，请检查浏览器语音权限或系统语音。");
    };

    setSpeakingKey(key);

    window.setTimeout(() => {
      synth.speak(utterance);

      window.setTimeout(() => {
        if (!synth.speaking && !synth.pending) {
          setSpeakingKey((currentKey) => (currentKey === key ? null : currentKey));
          setSpeechError("没有找到可用的泰语语音，请先在系统里安装 Thai 语音。");
          return;
        }

        synth.resume();
      }, 120);
    }, 0);
  };

  const openVocabulary = async ({
    term,
    sentence,
    cacheKey,
  }: {
    term: string;
    sentence: string;
    cacheKey: string;
  }) => {
    setSelectedVocabularyKey(cacheKey);
    setSelectedVocabularyTerm(term);
    setSelectedVocabularySentence(sentence);
    setVocabularyError("");

    const cachedExplanation = vocabularyCache[cacheKey];

    if (cachedExplanation) {
      setSelectedVocabulary(cachedExplanation);
      setIsVocabularyLoading(false);
      return;
    }

    setSelectedVocabulary(null);
    setIsVocabularyLoading(true);

    try {
      const localApiKey =
        typeof window !== "undefined"
          ? window.localStorage.getItem(AI_KEY_STORAGE_KEY)?.trim() ?? ""
          : "";

      const response = await fetch("/api/vocab", {
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
          term,
          sentence,
        }),
      });

      const data = (await response.json()) as VocabularyApiResponse | { error?: string };

      if (!response.ok || !("explanation" in data)) {
        throw new Error("error" in data ? data.error : "暂时无法解析这个词。");
      }

      setVocabularyCache((currentCache) => ({
        ...currentCache,
        [cacheKey]: data.explanation,
      }));
      setSelectedVocabulary(data.explanation);
    } catch (error) {
      setVocabularyError(error instanceof Error ? error.message : "暂时无法解析这个词。");
    } finally {
      setIsVocabularyLoading(false);
    }
  };

  const renderInteractiveThaiText = ({
    text,
    sentence,
    cachePrefix,
    className,
  }: {
    text: string;
    sentence: string;
    cachePrefix: string;
    className: string;
  }) => {
    const segments = segmentThaiText(text);

    if (segments.length === 0) {
      return <p className={className}>{text}</p>;
    }

    return (
      <p className={className}>
        {segments.map((segment, index) => {
          if (!segment.isWord) {
            return (
              <span key={`${cachePrefix}-segment-${index}`} className="whitespace-pre-wrap">
                {segment.text}
              </span>
            );
          }

          const cacheKey = `${cachePrefix}:${segment.text}`;
          const isActive = selectedVocabularyKey === cacheKey;

          return (
            <button
              key={`${cachePrefix}-segment-${index}`}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void openVocabulary({
                  term: segment.text,
                  sentence,
                  cacheKey,
                });
              }}
              className={`inline rounded-md px-1 py-0.5 transition ${
                isActive
                  ? "bg-[var(--brand-soft)] text-[var(--brand)]"
                  : "hover:bg-[var(--accent-soft)]"
              }`}
            >
              {segment.text}
            </button>
          );
        })}
      </p>
    );
  };

  if (message.role === "user") {
    const userMessageHasThai = containsThaiCharacters(message.content);

    return (
      <>
        <div className="flex justify-end">
          <article className="max-w-[85%] rounded-[20px] rounded-br-md border border-[rgba(31,122,104,0.16)] bg-[var(--brand-soft)] px-4 py-3 text-sm leading-7 text-[var(--text)] sm:max-w-[72%]">
            {onDelete ? (
              <div className="mb-2 flex justify-end">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete();
                  }}
                  disabled={deleteDisabled}
                  title="删除这句和后面的 AI 回复"
                  className="rounded-full border border-[rgba(31,122,104,0.12)] bg-white/72 px-3 py-1 text-[11px] font-medium text-[var(--text-soft)] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  删除这轮
                </button>
              </div>
            ) : null}
            <div className="flex items-start gap-2">
              <p className="flex-1 whitespace-pre-wrap">{message.content}</p>
              {userMessageHasThai ? (
                <SpeakerButton
                  isActive={speakingKey === `${message.id}-user-thai`}
                  onClick={() => playThai(message.content, `${message.id}-user-thai`)}
                  label="播放你输入的这句泰语"
                />
              ) : null}
            </div>
            {message.learnerTranslation ? (
              <div className="mt-3 rounded-[16px] bg-white/70 px-3 py-3 text-left text-[var(--text)]">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-medium tracking-[0.14em] text-[var(--brand)]">
                    {userMessageHasThai ? "你的这句泰语" : "你可以这样说"}
                  </p>
                  <SpeakerButton
                    isActive={speakingKey === `${message.id}-learner-translation`}
                    onClick={() =>
                      playThai(
                        message.learnerTranslation?.thai ?? "",
                        `${message.id}-learner-translation`,
                      )
                    }
                    label="播放这句中文对应的泰语"
                  />
                </div>
                {showThaiScript
                  ? renderInteractiveThaiText({
                      text: message.learnerTranslation.thai,
                      sentence: message.learnerTranslation.thai,
                      cachePrefix: `${message.id}-learner-translation`,
                      className: "thai-text mt-2 text-base font-semibold leading-7",
                    })
                  : null}
                <p className="mt-2 text-sm leading-6 text-[var(--text-soft)]">
                  {message.learnerTranslation.romanization}
                </p>
                <p className="mt-2 text-sm leading-6 text-[var(--text)]">
                  {message.learnerTranslation.chinese}
                </p>
              </div>
            ) : null}
          </article>
        </div>

        {selectedVocabularyKey
          ? createPortal(
              <div
                className="fixed inset-0 z-[130] bg-[rgba(31,42,44,0.36)] px-4 py-6 sm:flex sm:items-center sm:justify-center"
                onClick={() => {
                  setSelectedVocabularyKey(null);
                  setSelectedVocabulary(null);
                  setVocabularyError("");
                }}
              >
                <div
                  className="glass-card mx-auto w-full max-w-lg rounded-[28px] px-5 py-5 sm:px-6"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-medium tracking-[0.16em] text-[var(--brand)] uppercase">
                        Vocabulary
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <h3 className="thai-text text-2xl font-semibold text-[var(--text)]">
                          {selectedVocabulary?.term ?? selectedVocabularyTerm}
                        </h3>
                        <SpeakerButton
                          isActive={speakingKey === "vocab-term"}
                          onClick={() =>
                            playThai(
                              selectedVocabulary?.term ?? selectedVocabularyTerm,
                              "vocab-term",
                            )
                          }
                          label="播放这个词"
                        />
                      </div>
                      {selectedVocabulary?.romanization ? (
                        <p className="mt-1 text-sm text-[var(--text-soft)]">
                          {selectedVocabulary.romanization}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedVocabularyKey(null);
                        setSelectedVocabulary(null);
                        setVocabularyError("");
                      }}
                      className="rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-sm text-[var(--text-soft)]"
                    >
                      关闭
                    </button>
                  </div>

                  {isVocabularyLoading ? (
                    <p className="mt-5 text-sm leading-7 text-[var(--text-soft)]">
                      正在解析这个词的意思和用法...
                    </p>
                  ) : vocabularyError ? (
                    <p className="mt-5 text-sm leading-7 text-[#a54d2c]">{vocabularyError}</p>
                  ) : selectedVocabulary ? (
                    <div className="mt-5 space-y-4">
                      <section className="rounded-[18px] bg-[rgba(255,249,242,0.74)] px-4 py-3">
                        <p className="text-xs font-medium tracking-[0.16em] text-[var(--brand)]">
                          词义
                        </p>
                        <p className="mt-1 text-sm leading-7 text-[var(--text)]">
                          {selectedVocabulary.chineseMeaning}
                        </p>
                      </section>

                      <section className="rounded-[18px] bg-[rgba(217,240,233,0.34)] px-4 py-3">
                        <p className="text-xs font-medium tracking-[0.16em] text-[var(--brand)]">
                          用法
                        </p>
                        <p className="mt-1 text-sm leading-7 text-[var(--text)]">
                          {selectedVocabulary.usage}
                        </p>
                      </section>

                      <section className="rounded-[18px] border border-[rgba(31,122,104,0.12)] bg-white/86 px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs font-medium tracking-[0.16em] text-[var(--brand)]">
                            例句
                          </p>
                          <SpeakerButton
                            isActive={speakingKey === "vocab-example"}
                            onClick={() =>
                              playThai(selectedVocabulary.exampleThai, "vocab-example")
                            }
                            label="播放例句"
                          />
                        </div>
                        <p className="thai-text mt-2 text-base font-semibold text-[var(--text)]">
                          {selectedVocabulary.exampleThai}
                        </p>
                        <p className="mt-2 text-sm text-[var(--text-soft)]">
                          {selectedVocabulary.exampleRomanization}
                        </p>
                        <p className="mt-2 text-sm leading-7 text-[var(--text)]">
                          {selectedVocabulary.exampleChinese}
                        </p>
                      </section>

                      {selectedVocabularySentence ? (
                        <section className="rounded-[18px] bg-[var(--accent-soft)] px-4 py-3">
                          <p className="text-xs font-medium tracking-[0.16em] text-[#ab6231]">
                            当前句子
                          </p>
                          <p className="thai-text mt-1 text-sm leading-7 text-[#8a4e28]">
                            {selectedVocabularySentence}
                          </p>
                        </section>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>,
              document.body,
            )
          : null}
      </>
    );
  }

  const structured = message.structuredContent;

  return (
    <>
      <div className="flex justify-start">
        <article className="max-w-[88%] rounded-[20px] rounded-bl-md border border-[var(--line)] bg-white px-4 py-4 sm:max-w-[78%]">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-full bg-[rgba(217,240,233,0.7)] px-2.5 py-1 text-[11px] font-medium text-[var(--brand)]">
              AI 回复
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={async (event) => {
                  event.stopPropagation();

                  try {
                    await navigator.clipboard.writeText(message.content);
                    setCopyLabel("已复制");
                  } catch {
                    setCopyLabel("复制失败");
                  }

                  window.setTimeout(() => setCopyLabel("复制"), 1200);
                }}
                className="rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--text-soft)] transition hover:bg-[var(--accent-soft)]"
              >
                {copyLabel}
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <section className="rounded-[18px] bg-[rgba(217,240,233,0.18)] px-4 py-4">
              {showThaiScript ? (
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    {renderInteractiveThaiText({
                      text: structured?.thai ?? "",
                      sentence: structured?.thai ?? "",
                      cachePrefix: `${message.id}-thai`,
                      className: "thai-text text-base font-semibold text-[var(--text)] sm:text-lg",
                    })}
                    <p className="mt-2 text-xs text-[var(--text-soft)]">点泰文单词可查看释义</p>
                  </div>
                  <SpeakerButton
                    isActive={speakingKey === `${message.id}-thai`}
                    onClick={() => playThai(structured?.thai ?? "", `${message.id}-thai`)}
                  />
                </div>
              ) : (
                <p className="text-xs text-[var(--text-soft)]">已切换为仅拼音模式</p>
              )}

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <section className="space-y-1">
                  <p className="text-[11px] font-medium tracking-[0.14em] text-[var(--brand)]">拼读</p>
                  <p className="text-sm font-medium tracking-[0.01em] text-[var(--text)] sm:text-base">
                    {structured?.romanization}
                  </p>
                </section>

                <section className="space-y-1">
                  <p className="text-[11px] font-medium tracking-[0.14em] text-[var(--brand)]">意思</p>
                  <p className="text-sm leading-7 text-[var(--text)] sm:text-base">
                    {structured?.chinese}
                  </p>
                </section>
              </div>
            </section>

            {structured?.coachingNote ? (
              <section className="rounded-[18px] bg-[var(--accent-soft)] px-4 py-3">
                <p className="text-xs font-medium tracking-[0.16em] text-[#ab6231]">教练提示</p>
                <p className="mt-1 text-sm leading-7 text-[#8a4e28]">{structured.coachingNote}</p>
              </section>
            ) : null}

            {structured?.suggestedReply ? (
              <section className="rounded-[18px] border border-[rgba(31,122,104,0.12)] bg-[rgba(217,240,233,0.48)] px-4 py-4">
                <p className="text-xs font-medium tracking-[0.16em] text-[var(--brand)]">你可以回</p>
                <div className="mt-3 space-y-3">
                  {showThaiScript ? (
                    <div className="space-y-1">
                      <div className="flex items-start gap-2">
                        <div className="flex-1">
                          {renderInteractiveThaiText({
                            text: structured.suggestedReply.thai,
                            sentence: structured.suggestedReply.thai,
                            cachePrefix: `${message.id}-suggested-thai`,
                            className: "thai-text text-base font-semibold text-[var(--text)]",
                          })}
                        </div>
                        <SpeakerButton
                          isActive={speakingKey === `${message.id}-suggested-thai`}
                          onClick={() =>
                            playThai(
                              structured.suggestedReply?.thai ?? "",
                              `${message.id}-suggested-thai`,
                            )
                          }
                        />
                      </div>
                    </div>
                  ) : null}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <p className="text-[11px] font-medium tracking-[0.14em] text-[var(--brand)]">拼读</p>
                      <p className="text-sm font-medium text-[var(--text)]">
                        {structured.suggestedReply.romanization}
                      </p>
                    </div>

                    <div className="space-y-1">
                      <p className="text-[11px] font-medium tracking-[0.14em] text-[var(--brand)]">意思</p>
                      <p className="text-sm leading-7 text-[var(--text)]">
                        {structured.suggestedReply.chinese}
                      </p>
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            {structured?.repeatPrompt ? (
              <p className="text-sm leading-7 text-[var(--text-soft)]">{structured.repeatPrompt}</p>
            ) : null}

            {speechError ? (
              <p className="text-sm leading-7 text-[#a54d2c]">{speechError}</p>
            ) : null}
          </div>
        </article>
      </div>

      {selectedVocabularyKey
        ? createPortal(
            <div
              className="fixed inset-0 z-[130] bg-[rgba(31,42,44,0.36)] px-4 py-6 sm:flex sm:items-center sm:justify-center"
              onClick={() => {
                setSelectedVocabularyKey(null);
                setSelectedVocabulary(null);
                setVocabularyError("");
              }}
            >
              <div
                className="glass-card mx-auto w-full max-w-lg rounded-[28px] px-5 py-5 sm:px-6"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-medium tracking-[0.16em] text-[var(--brand)] uppercase">
                      Vocabulary
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <h3 className="thai-text text-2xl font-semibold text-[var(--text)]">
                        {selectedVocabulary?.term ?? selectedVocabularyTerm}
                      </h3>
                      <SpeakerButton
                        isActive={speakingKey === "vocab-term"}
                        onClick={() =>
                          playThai(selectedVocabulary?.term ?? selectedVocabularyTerm, "vocab-term")
                        }
                        label="播放这个词"
                      />
                    </div>
                    {selectedVocabulary?.romanization ? (
                      <p className="mt-1 text-sm text-[var(--text-soft)]">
                        {selectedVocabulary.romanization}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedVocabularyKey(null);
                      setSelectedVocabulary(null);
                      setVocabularyError("");
                    }}
                    className="rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-sm text-[var(--text-soft)]"
                  >
                    关闭
                  </button>
                </div>

                {isVocabularyLoading ? (
                  <p className="mt-5 text-sm leading-7 text-[var(--text-soft)]">
                    正在解析这个词的意思和用法...
                  </p>
                ) : vocabularyError ? (
                  <p className="mt-5 text-sm leading-7 text-[#a54d2c]">{vocabularyError}</p>
                ) : selectedVocabulary ? (
                  <div className="mt-5 space-y-4">
                    <section className="rounded-[18px] bg-[rgba(255,249,242,0.74)] px-4 py-3">
                      <p className="text-xs font-medium tracking-[0.16em] text-[var(--brand)]">
                        词义
                      </p>
                      <p className="mt-1 text-sm leading-7 text-[var(--text)]">
                        {selectedVocabulary.chineseMeaning}
                      </p>
                    </section>

                    <section className="rounded-[18px] bg-[rgba(217,240,233,0.34)] px-4 py-3">
                      <p className="text-xs font-medium tracking-[0.16em] text-[var(--brand)]">
                        用法
                      </p>
                      <p className="mt-1 text-sm leading-7 text-[var(--text)]">
                        {selectedVocabulary.usage}
                      </p>
                    </section>

                    <section className="rounded-[18px] border border-[rgba(31,122,104,0.12)] bg-white/86 px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-medium tracking-[0.16em] text-[var(--brand)]">
                          例句
                        </p>
                        <SpeakerButton
                          isActive={speakingKey === "vocab-example"}
                          onClick={() => playThai(selectedVocabulary.exampleThai, "vocab-example")}
                          label="播放例句"
                        />
                      </div>
                      <p className="thai-text mt-2 text-base font-semibold text-[var(--text)]">
                        {selectedVocabulary.exampleThai}
                      </p>
                      <p className="mt-2 text-sm text-[var(--text-soft)]">
                        {selectedVocabulary.exampleRomanization}
                      </p>
                      <p className="mt-2 text-sm leading-7 text-[var(--text)]">
                        {selectedVocabulary.exampleChinese}
                      </p>
                    </section>

                    {selectedVocabularySentence ? (
                      <section className="rounded-[18px] bg-[var(--accent-soft)] px-4 py-3">
                        <p className="text-xs font-medium tracking-[0.16em] text-[#ab6231]">
                          当前句子
                        </p>
                        <p className="thai-text mt-1 text-sm leading-7 text-[#8a4e28]">
                          {selectedVocabularySentence}
                        </p>
                      </section>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
