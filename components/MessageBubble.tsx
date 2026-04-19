"use client";

import { useEffect, useState } from "react";

import type { ChatMessage } from "@/lib/types";

interface MessageBubbleProps {
  message: ChatMessage;
  showThaiScript: boolean;
}

interface SpeakerButtonProps {
  isActive: boolean;
  onClick: () => void;
  label?: string;
}

function SpeakerButton({
  isActive,
  onClick,
  label = "播放泰语语音",
}: SpeakerButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
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

export function MessageBubble({ message, showThaiScript }: MessageBubbleProps) {
  const [copyLabel, setCopyLabel] = useState("复制");
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const playThai = (text: string, key: string) => {
    if (!text.trim() || typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }

    const synth = window.speechSynthesis;

    if (speakingKey === key && synth.speaking) {
      synth.cancel();
      setSpeakingKey(null);
      return;
    }

    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const thaiVoice = synth.getVoices().find((voice) => voice.lang.toLowerCase().startsWith("th"));

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
    };

    setSpeakingKey(key);
    synth.speak(utterance);
  };

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <article className="max-w-[85%] rounded-[20px] rounded-br-md border border-[rgba(31,122,104,0.16)] bg-[var(--brand-soft)] px-4 py-3 text-sm leading-7 text-[var(--text)] sm:max-w-[72%]">
          <p>{message.content}</p>
          {message.learnerTranslation ? (
            <div className="mt-3 rounded-[16px] bg-white/70 px-3 py-3 text-left text-[var(--text)]">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-medium tracking-[0.14em] text-[var(--brand)]">你可以这样说</p>
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
              {showThaiScript ? (
                <p className="thai-text mt-2 text-base font-semibold leading-7">
                  {message.learnerTranslation.thai}
                </p>
              ) : null}
              <p className="mt-2 text-sm leading-6 text-[var(--text-soft)]">
                {message.learnerTranslation.romanization}
              </p>
            </div>
          ) : null}
        </article>
      </div>
    );
  }

  const structured = message.structuredContent;

  return (
    <div className="flex justify-start">
      <article className="max-w-[88%] rounded-[20px] rounded-bl-md border border-[var(--line)] bg-white px-4 py-4 sm:max-w-[78%]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-full bg-[rgba(217,240,233,0.7)] px-2.5 py-1 text-[11px] font-medium text-[var(--brand)]">
            AI 角色扮演
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={async () => {
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
          {showThaiScript ? (
            <section className="space-y-1">
              <p className="text-xs font-medium tracking-[0.16em] text-[var(--brand)]">泰文</p>
              <div className="flex items-start gap-2">
                <p className="thai-text flex-1 text-base font-semibold text-[var(--text)] sm:text-lg">
                  {structured?.thai}
                </p>
                <SpeakerButton
                  isActive={speakingKey === `${message.id}-thai`}
                  onClick={() => playThai(structured?.thai ?? "", `${message.id}-thai`)}
                />
              </div>
            </section>
          ) : null}

          <section className="space-y-1">
            <p className="text-xs font-medium tracking-[0.16em] text-[var(--brand)]">拼读</p>
            <p className="text-sm font-medium tracking-[0.01em] text-[var(--text)] sm:text-base">
              {structured?.romanization}
            </p>
          </section>

          <section className="space-y-1">
            <p className="text-xs font-medium tracking-[0.16em] text-[var(--brand)]">中文</p>
            <div className="flex items-start gap-2">
              <p className="flex-1 text-sm leading-7 text-[var(--text)] sm:text-base">{structured?.chinese}</p>
              <SpeakerButton
                isActive={speakingKey === `${message.id}-thai`}
                onClick={() => playThai(structured?.thai ?? "", `${message.id}-thai`)}
                label="播放这句中文对应的泰语"
              />
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
              <p className="text-xs font-medium tracking-[0.16em] text-[var(--brand)]">建议回答</p>
              <div className="mt-3 space-y-3">
                {showThaiScript ? (
                  <div className="space-y-1">
                    <p className="text-xs text-[var(--text-soft)]">泰文</p>
                    <div className="flex items-start gap-2">
                      <p className="thai-text flex-1 text-base font-semibold text-[var(--text)]">
                        {structured.suggestedReply.thai}
                      </p>
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

                <div className="space-y-1">
                  <p className="text-xs text-[var(--text-soft)]">拼读</p>
                  <p className="text-sm font-medium text-[var(--text)]">
                    {structured.suggestedReply.romanization}
                  </p>
                </div>

                <div className="space-y-1">
                  <p className="text-xs text-[var(--text-soft)]">中文</p>
                  <div className="flex items-start gap-2">
                    <p className="flex-1 text-sm leading-7 text-[var(--text)]">
                      {structured.suggestedReply.chinese}
                    </p>
                    <SpeakerButton
                      isActive={speakingKey === `${message.id}-suggested-thai`}
                      onClick={() =>
                        playThai(
                          structured.suggestedReply?.thai ?? "",
                          `${message.id}-suggested-thai`,
                        )
                      }
                      label="播放这句中文对应的泰语"
                    />
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {structured?.repeatPrompt ? (
            <p className="text-sm leading-7 text-[var(--text-soft)]">{structured.repeatPrompt}</p>
          ) : null}
        </div>
      </article>
    </div>
  );
}
