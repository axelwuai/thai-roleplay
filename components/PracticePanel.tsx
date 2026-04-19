"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { ChatWindow } from "@/components/ChatWindow";
import { QuickActions } from "@/components/QuickActions";
import type {
  AssistantStructuredMessage,
  ChatApiResponse,
  ChatMessage,
  ScenarioSession,
} from "@/lib/types";
import {
  AI_KEY_STORAGE_KEY,
  attachLearnerTranslation,
  createAssistantMessage,
  createScenarioSession,
  createUserMessage,
} from "@/lib/utils";

interface PracticePanelProps {
  clientId: string;
  scenario: string;
  isSettingsOpen: boolean;
  onSessionChange?: (session: ScenarioSession) => void;
}

export function PracticePanel({
  clientId,
  scenario,
  isSettingsOpen,
  onSessionChange,
}: PracticePanelProps) {
  const [session, setSession] = useState<ScenarioSession>(() => createScenarioSession(scenario));
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [apiKey, setApiKey] = useState("");
  const startedScenarioRef = useRef<string | null>(null);

  const requestAssistantTurn = async ({
    userMessage,
    historyForApi,
    nextHistory,
  }: {
    userMessage: string;
    historyForApi: ChatMessage[];
    nextHistory: ChatMessage[];
  }) => {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey.trim()
            ? {
                "x-ai-api-key": apiKey.trim(),
              }
            : {}),
        },
        body: JSON.stringify({
          scenario,
          history: historyForApi.slice(-12).map((message) => ({
            role: message.role,
            content: message.content,
          })),
          userMessage,
        }),
      });

      const data = (await response.json()) as ChatApiResponse | { error?: string };
      const errorText = "error" in data ? data.error : undefined;

      if (!response.ok || !("message" in data)) {
        throw new Error(errorText ?? "AI coach request failed.");
      }

      const assistantMessage = createAssistantMessage(data.message as AssistantStructuredMessage);
      const historyWithTranslation = attachLearnerTranslation(
        nextHistory,
        (data.message as AssistantStructuredMessage).learnerTranslation,
      );

      setSession((currentSession) => ({
        ...currentSession,
        messages: [...historyWithTranslation, assistantMessage],
        updatedAt: new Date().toISOString(),
      }));
    } catch (error) {
      if (nextHistory.length === 0) {
        startedScenarioRef.current = null;
      }

      const fallbackMessage =
        error instanceof Error ? error.message : "暂时无法连接 AI，请稍后再试。";
      setErrorMessage(fallbackMessage);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined" || !clientId) {
      return;
    }

    setIsHydrated(false);
    startedScenarioRef.current = null;
    const storedApiKey = window.localStorage.getItem(AI_KEY_STORAGE_KEY) ?? "";
    setApiKey(storedApiKey);
    setInput("");
    setErrorMessage("");
    let cancelled = false;

    const loadSession = async () => {
      try {
        const response = await fetch(`/api/sessions?scenario=${encodeURIComponent(scenario)}`, {
          headers: {
            "x-client-id": clientId,
          },
          cache: "no-store",
        });

        const data = (await response.json()) as {
          session?: ScenarioSession | null;
        };

        if (cancelled) {
          return;
        }

        setSession(
          data.session && data.session.scenario === scenario
            ? data.session
            : createScenarioSession(scenario),
        );
      } catch (error) {
        console.error("[PracticePanel] failed to load session", error);

        if (!cancelled) {
          setSession(createScenarioSession(scenario));
        }
      } finally {
        if (!cancelled) {
          setIsHydrated(true);
        }
      }
    };

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, [clientId, scenario]);

  useEffect(() => {
    if (!isHydrated || session.scenario !== scenario) {
      return;
    }

    onSessionChange?.(session);
  }, [isHydrated, onSessionChange, scenario, session]);

  useEffect(() => {
    if (!isHydrated || !clientId || session.scenario !== scenario || session.messages.length === 0) {
      return;
    }

    void fetch("/api/sessions", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-client-id": clientId,
      },
      body: JSON.stringify({
        session,
      }),
    }).catch((error) => {
      console.error("[PracticePanel] failed to save session", error);
    });
  }, [clientId, isHydrated, scenario, session]);

  useEffect(() => {
    if (!isHydrated || typeof window === "undefined") {
      return;
    }

    if (apiKey.trim()) {
      window.localStorage.setItem(AI_KEY_STORAGE_KEY, apiKey.trim());
      return;
    }

    window.localStorage.removeItem(AI_KEY_STORAGE_KEY);
  }, [apiKey, isHydrated]);

  useEffect(() => {
    if (!isHydrated || session.messages.length > 0 || isLoading) {
      return;
    }

    if (startedScenarioRef.current === scenario) {
      return;
    }

    startedScenarioRef.current = scenario;

    const startConversation = async () => {
      await requestAssistantTurn({
        userMessage: "",
        historyForApi: [],
        nextHistory: [],
      });
    };

    void startConversation();
  }, [apiKey, isHydrated, isLoading, scenario, session.messages.length]);

  const sendUserMessage = async (rawMessage: string) => {
    const userMessage = rawMessage.trim();

    if (!userMessage || isLoading) {
      return;
    }

    const userEntry = createUserMessage(userMessage);
    const nextHistory = [...session.messages, userEntry];

    setSession((currentSession) => ({
      ...currentSession,
      messages: nextHistory,
      updatedAt: new Date().toISOString(),
    }));
    setInput("");

    await requestAssistantTurn({
      userMessage,
      historyForApi: session.messages,
      nextHistory,
    });
  };

  const toggleThaiScript = () => {
    setSession((currentSession) => ({
      ...currentSession,
      showThaiScript: !currentSession.showThaiScript,
      updatedAt: new Date().toISOString(),
    }));
  };

  return (
    <section className="glass-card flex flex-col overflow-visible rounded-[var(--radius-xl)] xl:min-h-0 xl:overflow-hidden">
      <div className="border-b border-[var(--line)] bg-white/55 px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-[11px] font-medium tracking-[0.16em] text-[var(--brand)] uppercase">
              Scenario
            </p>
            <h2 className="truncate text-lg font-semibold text-[var(--text)] sm:text-xl">{scenario}</h2>
            <p className="text-sm text-[var(--text-soft)]">
              上方看状态，中间看对话，下方固定发送和求助。
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="rounded-full border border-[var(--line)] bg-white/85 px-3 py-1.5 text-xs font-medium text-[var(--text-soft)]">
              {session.showThaiScript ? "泰文已显示" : "仅拼音模式"}
            </div>
            <Link
              href="/"
              className="inline-flex items-center rounded-full border border-[var(--line)] bg-white/90 px-4 py-2 text-sm font-medium text-[var(--text-soft)] transition hover:-translate-y-0.5 hover:bg-white"
            >
              换个场景
            </Link>
          </div>
        </div>

        {isSettingsOpen ? (
          <div className="mt-4 space-y-3 rounded-[18px] border border-[rgba(31,122,104,0.08)] bg-[rgba(255,249,242,0.7)] px-4 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-[var(--text)]">模型设置</p>
              <span className="truncate rounded-full bg-[var(--brand-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--brand)]">
                {apiKey.trim() ? "已切换本地 Key" : "默认服务器配置"}
              </span>
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-medium text-[var(--text)]">百炼 Qwen API Key</p>
                <p className="text-xs text-[var(--text-soft)]">
                  仅保存在当前浏览器，用于这个本地 MVP
                </p>
              </div>
              <input
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="可选：粘贴你的百炼 API key 覆盖服务器默认配置"
                className="w-full rounded-[18px] border border-[var(--line)] bg-white px-4 py-3 text-sm text-[var(--text)] outline-none transition focus:border-[rgba(31,122,104,0.4)] focus:ring-4 focus:ring-[rgba(31,122,104,0.08)]"
              />
            </div>
            <p className="text-sm leading-6 text-[var(--text-soft)]">
              {apiKey.trim()
                ? "已检测到本地百炼 API key。现在会优先使用这把 key。"
                : "如果你想临时切换账号，可以在这里贴入 key；留空则继续使用服务器默认配置。"}
            </p>
          </div>
        ) : null}
      </div>

      <ChatWindow
        messages={session.messages}
        isLoading={isLoading}
        showThaiScript={session.showThaiScript}
      />

      <div className="border-t border-[var(--line)] bg-white/92 px-4 py-4 shadow-[0_-12px_30px_rgba(79,92,90,0.06)] backdrop-blur sm:px-6">
        {errorMessage ? (
          <div className="mb-3 rounded-[18px] border border-[rgba(220,104,72,0.2)] bg-[rgba(255,241,235,0.9)] px-4 py-3 text-sm text-[#a54d2c]">
            {errorMessage}
          </div>
        ) : null}

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="rounded-full bg-[var(--brand-soft)] px-3 py-1 text-xs font-medium text-[var(--brand)]">
            快捷求助
          </div>
          <QuickActions
            disabled={!isHydrated || isLoading}
            onAction={(value) => {
              void sendUserMessage(value);
            }}
          />
          <button
            type="button"
            onClick={toggleThaiScript}
            disabled={!isHydrated || isLoading}
            className="ml-auto rounded-full border border-[rgba(31,122,104,0.18)] bg-white px-4 py-2 text-sm font-medium text-[var(--brand)] transition hover:-translate-y-0.5 hover:bg-[var(--brand-soft)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {session.showThaiScript ? "只看拼音" : "显示泰文"}
          </button>
        </div>

        <form
          className="rounded-[26px] border border-[var(--line)] bg-white px-3 py-3 shadow-[0_12px_30px_rgba(79,92,90,0.05)]"
          onSubmit={(event) => {
            event.preventDefault();
            void sendUserMessage(input);
          }}
        >
          <label className="sr-only" htmlFor="practice-input">
            你的回复
          </label>
          <div className="flex items-center gap-3">
            <input
              id="practice-input"
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="直接输入你想说的话"
              disabled={isLoading}
              className="h-12 flex-1 rounded-[18px] border border-[var(--line)] bg-[rgba(255,249,242,0.36)] px-4 text-base text-[var(--text)] outline-none transition focus:border-[rgba(31,122,104,0.4)] focus:ring-4 focus:ring-[rgba(31,122,104,0.08)] disabled:cursor-not-allowed disabled:opacity-70"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="inline-flex h-12 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] px-5 text-sm font-medium text-white transition hover:-translate-y-0.5 hover:bg-[#166755] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isLoading ? "AI 正在回复..." : "发送"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
