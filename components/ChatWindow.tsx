"use client";

import { useEffect, useRef } from "react";

import { MessageBubble } from "@/components/MessageBubble";
import type { ChatMessage } from "@/lib/types";

interface ChatWindowProps {
  messages: ChatMessage[];
  isLoading: boolean;
  showThaiScript: boolean;
}

export function ChatWindow({ messages, isLoading, showThaiScript }: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages, isLoading]);

  return (
    <div className="h-[50vh] min-h-[340px] max-h-[620px] overflow-y-auto overscroll-contain bg-[rgba(244,240,234,0.72)] px-4 py-4 sm:h-[54vh] sm:px-6 xl:h-[58vh]">
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

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
