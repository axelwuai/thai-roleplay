"use client";

import { useEffect, useRef } from "react";

import { MessageBubble } from "@/components/MessageBubble";
import { QuickActions } from "@/components/QuickActions";
import type { ChatMessage } from "@/lib/types";

interface ChatWindowProps {
  messages: ChatMessage[];
  isLoading: boolean;
  showThaiScript: boolean;
  contentPaddingBottomClassName?: string;
  quickActionsDisabled?: boolean;
  isFullscreen?: boolean;
  onQuickAction?: (value: string) => void;
  onOpenFocusMode?: () => void;
}

export function ChatWindow({
  messages,
  isLoading,
  showThaiScript,
  contentPaddingBottomClassName = "",
  quickActionsDisabled = false,
  isFullscreen = false,
  onQuickAction,
  onOpenFocusMode,
}: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages, isLoading]);

  return (
    <div
      role={onOpenFocusMode ? "button" : undefined}
      tabIndex={onOpenFocusMode ? 0 : undefined}
      onClick={onOpenFocusMode}
      onKeyDown={(event) => {
        if (!onOpenFocusMode) {
          return;
        }

        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenFocusMode();
        }
      }}
      className={`relative overflow-y-auto overscroll-contain bg-[rgba(244,240,234,0.72)] px-4 py-4 sm:px-6 ${contentPaddingBottomClassName} ${
        isFullscreen
          ? "h-full min-h-0 rounded-[24px]"
          : "min-h-0 flex-1 cursor-zoom-in transition hover:bg-[rgba(244,240,234,0.9)]"
      }`}
    >
      {onOpenFocusMode ? (
        <div className="pointer-events-none absolute right-4 top-4 z-10 inline-flex items-center gap-2 rounded-full border border-[rgba(31,122,104,0.16)] bg-white/88 px-3 py-1.5 text-xs font-medium text-[var(--brand)] shadow-[0_10px_24px_rgba(79,92,90,0.08)]">
          点击进入专注全屏
        </div>
      ) : null}

      <div className="mx-auto flex max-w-3xl flex-col gap-3">
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            showThaiScript={showThaiScript}
          />
        ))}

        {isLoading ? (
          <div className="max-w-[82%] rounded-[20px] rounded-bl-md border border-[var(--line)] bg-white px-4 py-3 text-sm text-[var(--text-soft)]">
            AI 正在组织下一句更自然的口语对话...
          </div>
        ) : null}

        {onQuickAction ? (
          <div
            className="self-center"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <section className="rounded-[18px] border border-[rgba(31,122,104,0.1)] bg-white/88 px-3 py-3 shadow-[0_10px_24px_rgba(79,92,90,0.04)]">
              <p className="mb-2 text-center text-xs text-[var(--text-soft)]">卡壳时可以直接点</p>
              <QuickActions compact disabled={quickActionsDisabled} onAction={onQuickAction} />
            </section>
          </div>
        ) : null}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
