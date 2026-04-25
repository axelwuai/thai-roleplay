"use client";

import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

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

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

interface BrowserSpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onend: ((event: Event) => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onstart: ((event: Event) => void) | null;
  abort: () => void;
  start: () => void;
  stop: () => void;
}

interface BrowserSpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface BrowserSpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: {
    [index: number]: {
      isFinal: boolean;
      [alternativeIndex: number]: {
        transcript: string;
      };
    };
    length: number;
  };
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

interface PracticePanelProps {
  clientId: string;
  scenario: string;
  isSettingsOpen: boolean;
  onCloseSettings?: () => void;
  onSessionChange?: (session: ScenarioSession) => void;
}

const EXAMPLE_SCENARIOS = [
  "去餐厅点菜",
  "叫出租车去机场",
  "在医院描述症状",
  "和老师沟通作业",
  "买衣服试穿",
];

export function PracticePanel({
  clientId,
  scenario,
  isSettingsOpen,
  onCloseSettings,
  onSessionChange,
}: PracticePanelProps) {
  const [session, setSession] = useState<ScenarioSession>(() => createScenarioSession(scenario));
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [isSpeechSupported, setIsSpeechSupported] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [speechMessage, setSpeechMessage] = useState("");
  const [isFocusModeOpen, setIsFocusModeOpen] = useState(false);
  const [isScenarioSwitcherOpen, setIsScenarioSwitcherOpen] = useState(false);
  const [nextScenario, setNextScenario] = useState("");
  const startedScenarioRef = useRef<string | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const baseInputBeforeRecordingRef = useRef("");
  const router = useRouter();
  const [isScenarioPending, startScenarioTransition] = useTransition();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const RecognitionConstructor =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;

    if (!RecognitionConstructor) {
      return;
    }

    const recognition = new RecognitionConstructor();
    const preferredLanguage = navigator.languages?.find((language) =>
      language.toLowerCase().startsWith("zh") || language.toLowerCase().startsWith("th"),
    );

    recognition.lang = preferredLanguage ?? navigator.language ?? "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      setIsRecording(true);
      setSpeechMessage("正在听你说话...");
    };
    recognition.onend = () => {
      setIsRecording(false);
    };
    recognition.onerror = (event) => {
      setIsRecording(false);

      switch (event.error) {
        case "not-allowed":
        case "service-not-allowed":
          setSpeechMessage("麦克风权限被拒绝了，请先允许浏览器使用麦克风。");
          break;
        case "no-speech":
          setSpeechMessage("没有听到语音，再试一次就好。");
          break;
        case "audio-capture":
          setSpeechMessage("没有检测到麦克风，请检查设备或浏览器设置。");
          break;
        default:
          setSpeechMessage("语音输入暂时不可用，请稍后重试。");
          break;
      }
    };
    recognition.onresult = (event) => {
      let transcript = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        transcript += event.results[index]?.[0]?.transcript ?? "";
      }

      const mergedInput = [baseInputBeforeRecordingRef.current.trim(), transcript.trim()]
        .filter(Boolean)
        .join(baseInputBeforeRecordingRef.current.trim() ? " " : "");

      setInput(mergedInput);
      setSpeechMessage(transcript.trim() ? "语音已转成文字，可以直接发送。" : "正在听你说话...");
    };

    recognitionRef.current = recognition;
    setIsSpeechSupported(true);

    return () => {
      recognition.abort();
      recognitionRef.current = null;
    };
  }, []);

  useEffect(() => {
    setIsFocusModeOpen(false);
    setIsScenarioSwitcherOpen(false);
    setNextScenario("");
    setIsRecording(false);
    setSpeechMessage("");
  }, [scenario]);

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

    recognitionRef.current?.stop();
    setIsRecording(false);
    setSpeechMessage("");

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

  const openScenarioSwitcher = () => {
    setNextScenario("");
    setIsScenarioSwitcherOpen(true);
  };

  const switchScenario = (value: string) => {
    const targetScenario = value.trim();

    if (!targetScenario) {
      return;
    }

    startScenarioTransition(() => {
      setIsScenarioSwitcherOpen(false);
      router.push(`/practice?scenario=${encodeURIComponent(targetScenario)}`);
    });
  };

  const toggleVoiceInput = () => {
    const recognition = recognitionRef.current;

    if (!recognition || !isSpeechSupported) {
      setSpeechMessage("当前浏览器不支持语音输入，建议使用最新版 Chrome。");
      return;
    }

    if (isRecording) {
      recognition.stop();
      setSpeechMessage("已停止录音。");
      return;
    }

    baseInputBeforeRecordingRef.current = input;
    setSpeechMessage("");

    try {
      recognition.start();
    } catch {
      recognition.stop();
      window.setTimeout(() => {
        try {
          recognition.start();
        } catch {
          setIsRecording(false);
          setSpeechMessage("语音输入暂时不可用，请稍后重试。");
        }
      }, 120);
    }
  };

  const renderComposerSection = (isFullscreen = false) => (
    <div
      className={`border-t border-[var(--line)] bg-white/92 px-4 py-4 backdrop-blur sm:px-6 ${
        isFullscreen ? "rounded-[24px] shadow-[0_-12px_30px_rgba(79,92,90,0.04)]" : "shadow-[0_-12px_30px_rgba(79,92,90,0.06)]"
      }`}
    >
      {errorMessage ? (
        <div className="mb-3 rounded-[18px] border border-[rgba(220,104,72,0.2)] bg-[rgba(255,241,235,0.9)] px-4 py-3 text-sm text-[#a54d2c]">
          {errorMessage}
        </div>
      ) : null}

      {speechMessage ? (
        <div className="mb-3 rounded-[18px] border border-[rgba(31,122,104,0.12)] bg-[rgba(217,240,233,0.36)] px-4 py-3 text-sm text-[var(--brand)]">
          {speechMessage}
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
        <label className="sr-only" htmlFor={isFullscreen ? "practice-input-fullscreen" : "practice-input"}>
          你的回复
        </label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleVoiceInput}
            disabled={!isSpeechSupported || isLoading}
            aria-label={isRecording ? "停止语音输入" : "开始语音输入"}
            title={isSpeechSupported ? (isRecording ? "停止语音输入" : "开始语音输入") : "当前浏览器不支持语音输入"}
            className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border transition ${
              isRecording
                ? "border-[rgba(31,122,104,0.28)] bg-[var(--brand-soft)] text-[var(--brand)]"
                : "border-[var(--line)] bg-white text-[var(--text-soft)] hover:bg-[var(--accent-soft)]"
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 3a3 3 0 0 1 3 3v5a3 3 0 1 1-6 0V6a3 3 0 0 1 3-3Z" />
              <path d="M19 10a7 7 0 1 1-14 0" />
              <path d="M12 19v3" />
            </svg>
          </button>
          <input
            id={isFullscreen ? "practice-input-fullscreen" : "practice-input"}
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={isRecording ? "正在听你说话..." : "直接输入你想说的话，或点左侧麦克风"}
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
  );

  return (
    <>
      <section className="glass-card flex flex-col overflow-visible rounded-[var(--radius-xl)] xl:min-h-0 xl:overflow-hidden">
        <div className="border-b border-[var(--line)] bg-white/55 px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="text-[11px] font-medium tracking-[0.16em] text-[var(--brand)] uppercase">
                Scenario
              </p>
              <h2 className="truncate text-lg font-semibold text-[var(--text)] sm:text-xl">{scenario}</h2>
              <p className="text-sm text-[var(--text-soft)]">
                点击对话窗口可进入专注全屏，沉浸式练习当前场景。
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="rounded-full border border-[var(--line)] bg-white/85 px-3 py-1.5 text-xs font-medium text-[var(--text-soft)]">
                {session.showThaiScript ? "泰文已显示" : "仅拼音模式"}
              </div>
              <button
                type="button"
                onClick={openScenarioSwitcher}
                className="inline-flex items-center rounded-full border border-[var(--line)] bg-white/90 px-4 py-2 text-sm font-medium text-[var(--text-soft)] transition hover:-translate-y-0.5 hover:bg-white"
              >
                换个场景
              </button>
            </div>
          </div>
        </div>

        <ChatWindow
          messages={session.messages}
          isLoading={isLoading}
          showThaiScript={session.showThaiScript}
          onOpenFocusMode={() => setIsFocusModeOpen(true)}
        />

        {renderComposerSection()}
      </section>

      {isSettingsOpen && isMounted
        ? createPortal(
            <div className="fixed inset-0 z-[100] overflow-y-auto bg-[rgba(31,42,44,0.28)] px-4 py-6 sm:flex sm:items-center sm:justify-center sm:py-8">
              <div className="glass-card mx-auto w-full max-w-lg max-h-[calc(100dvh-48px)] overflow-y-auto rounded-[28px] px-5 py-5 sm:my-auto sm:px-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-medium tracking-[0.16em] text-[var(--brand)] uppercase">
                      Settings
                    </p>
                    <h2 className="mt-1 text-2xl font-semibold text-[var(--text)]">模型设置</h2>
                    <p className="mt-2 text-sm leading-7 text-[var(--text-soft)]">
                      这里的设置只影响当前浏览器，不会改动服务器默认配置。
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onCloseSettings}
                    className="rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-sm text-[var(--text-soft)]"
                  >
                    关闭
                  </button>
                </div>

                <div className="mt-5 space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-[var(--text)]">百炼 Qwen API Key</p>
                    <span className="truncate rounded-full bg-[var(--brand-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--brand)]">
                      {apiKey.trim() ? "已切换本地 Key" : "默认服务器配置"}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm font-medium text-[var(--text)]">本地覆盖 Key</p>
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
                      ? "已检测到本地百炼 API key。当前聊天会优先使用这把 key。"
                      : "如果你想临时切换账号，可以在这里贴入 key；留空则继续使用服务器默认配置。"}
                  </p>

                  <div className="rounded-[18px] border border-[rgba(31,122,104,0.08)] bg-[rgba(255,249,242,0.7)] px-4 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-[var(--text)]">文字显示</p>
                        <p className="mt-1 text-sm leading-6 text-[var(--text-soft)]">
                          可以随时切换显示泰文，或者只保留拼音和中文。
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={toggleThaiScript}
                        disabled={!isHydrated || isLoading}
                        className="rounded-full border border-[rgba(31,122,104,0.18)] bg-white px-4 py-2 text-sm font-medium text-[var(--brand)] transition hover:-translate-y-0.5 hover:bg-[var(--brand-soft)] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {session.showThaiScript ? "只看拼音" : "显示泰文"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {isScenarioSwitcherOpen && isMounted
        ? createPortal(
            <div className="fixed inset-0 z-[100] overflow-y-auto bg-[rgba(31,42,44,0.28)] px-4 py-6 sm:flex sm:items-center sm:justify-center sm:py-8">
              <div className="glass-card mx-auto w-full max-w-lg max-h-[calc(100dvh-48px)] overflow-y-auto rounded-[28px] px-5 py-5 sm:my-auto sm:px-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-medium tracking-[0.16em] text-[var(--brand)] uppercase">
                      Scenario
                    </p>
                    <h2 className="mt-1 text-2xl font-semibold text-[var(--text)]">切换场景</h2>
                    <p className="mt-2 text-sm leading-7 text-[var(--text-soft)]">
                      输入一个新场景，或者直接点下面的示例，马上切过去继续练。
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsScenarioSwitcherOpen(false)}
                    className="rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-sm text-[var(--text-soft)]"
                  >
                    关闭
                  </button>
                </div>

                <form
                  className="mt-5 space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    switchScenario(nextScenario);
                  }}
                >
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-[var(--text)]">场景名称</span>
                    <input
                      value={nextScenario}
                      onChange={(event) => setNextScenario(event.target.value)}
                      placeholder="去餐厅点菜 / 叫出租车 / 在医院描述症状"
                      className="w-full rounded-[22px] border border-[var(--line)] bg-white px-4 py-4 text-base text-[var(--text)] outline-none transition focus:border-[rgba(31,122,104,0.4)] focus:ring-4 focus:ring-[rgba(31,122,104,0.08)]"
                    />
                  </label>

                  <button
                    type="submit"
                    disabled={isScenarioPending || !nextScenario.trim()}
                    className="w-full rounded-[22px] bg-[var(--brand)] px-5 py-4 text-base font-medium text-white transition hover:-translate-y-0.5 hover:bg-[#166755] disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isScenarioPending ? "正在切换..." : "进入这个场景"}
                  </button>
                </form>

                <div className="mt-5 space-y-3">
                  <p className="text-sm font-medium text-[var(--text)]">试试这些示例</p>
                  <div className="flex flex-wrap gap-2">
                    {EXAMPLE_SCENARIOS.map((example) => (
                      <button
                        key={example}
                        type="button"
                        onClick={() => switchScenario(example)}
                        className="soft-chip rounded-full px-4 py-2 text-sm text-[var(--text-soft)] transition hover:-translate-y-0.5 hover:border-[rgba(31,122,104,0.25)] hover:text-[var(--brand)]"
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {isFocusModeOpen && isMounted
        ? createPortal(
            <div className="fixed inset-0 z-[110] bg-[rgba(31,42,44,0.56)] p-3 sm:p-4">
              <div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-3 rounded-[32px] border border-[rgba(255,255,255,0.18)] bg-[rgba(245,240,232,0.96)] p-3 shadow-[0_24px_80px_rgba(16,24,24,0.28)] backdrop-blur sm:p-4">
                <div className="flex flex-wrap items-start justify-between gap-3 rounded-[24px] bg-white/72 px-4 py-3">
                  <div className="min-w-0 space-y-1">
                    <p className="text-[11px] font-medium tracking-[0.16em] text-[var(--brand)] uppercase">
                      Focus Mode
                    </p>
                    <h2 className="truncate text-xl font-semibold text-[var(--text)]">专注对话练习</h2>
                    <p className="text-sm text-[var(--text-soft)]">
                      当前场景：{scenario}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="rounded-full border border-[var(--line)] bg-white/85 px-3 py-1.5 text-xs font-medium text-[var(--text-soft)]">
                      {session.showThaiScript ? "泰文已显示" : "仅拼音模式"}
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsFocusModeOpen(false)}
                      className="rounded-full border border-[var(--line)] bg-white px-4 py-2 text-sm font-medium text-[var(--text-soft)] transition hover:bg-[var(--accent-soft)]"
                    >
                      退出全屏
                    </button>
                  </div>
                </div>

                <div className="min-h-0 flex-1 rounded-[28px] border border-[rgba(31,122,104,0.08)] bg-white/58 p-2 sm:p-3">
                  <ChatWindow
                    messages={session.messages}
                    isLoading={isLoading}
                    showThaiScript={session.showThaiScript}
                    isFullscreen
                  />
                </div>

                {renderComposerSection(true)}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
