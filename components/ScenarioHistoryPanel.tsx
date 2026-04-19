"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import type { PracticeStats, ScenarioSessionSummary } from "@/lib/types";

interface ScenarioHistoryPanelProps {
  currentScenario: string;
  sessions: ScenarioSessionSummary[];
  stats: PracticeStats;
  onDeleteSession?: (scenario: string) => Promise<void>;
  onRenameSession?: (fromScenario: string, toScenario: string) => Promise<void>;
}

function formatUpdatedAt(updatedAt: string) {
  const timestamp = new Date(updatedAt).getTime();

  if (Number.isNaN(timestamp)) {
    return "刚刚更新";
  }

  const diffMinutes = Math.floor((Date.now() - timestamp) / 60000);

  if (diffMinutes < 1) {
    return "刚刚更新";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} 分钟前`;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

export function ScenarioHistoryPanel({
  currentScenario,
  sessions,
  stats,
  onDeleteSession,
  onRenameSession,
}: ScenarioHistoryPanelProps) {
  const [editingScenario, setEditingScenario] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [pendingScenario, setPendingScenario] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (editingScenario && !sessions.some((item) => item.scenario === editingScenario)) {
      setEditingScenario(null);
      setDraftName("");
    }
  }, [editingScenario, sessions]);

  const latestPracticeLabel = stats.latestUpdatedAt ? formatUpdatedAt(stats.latestUpdatedAt) : "还没开始";

  const startRename = (scenario: string) => {
    setEditingScenario(scenario);
    setDraftName(scenario);
    setErrorMessage("");
  };

  const submitRename = async (scenario: string) => {
    const nextName = draftName.trim();

    if (!nextName) {
      setErrorMessage("场景名不能为空。");
      return;
    }

    if (nextName === scenario) {
      setEditingScenario(null);
      setDraftName("");
      setErrorMessage("");
      return;
    }

    if (!onRenameSession) {
      return;
    }

    setPendingScenario(scenario);
    setErrorMessage("");

    try {
      await onRenameSession(scenario, nextName);
      setEditingScenario(null);
      setDraftName("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "暂时无法重命名场景。");
    } finally {
      setPendingScenario(null);
    }
  };

  const deleteSession = async (scenario: string) => {
    if (!onDeleteSession) {
      return;
    }

    const confirmed = window.confirm(`确定删除“${scenario}”吗？这段练习记录会从数据库里移除。`);

    if (!confirmed) {
      return;
    }

    setPendingScenario(scenario);
    setErrorMessage("");

    try {
      await onDeleteSession(scenario);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "暂时无法删除场景。");
    } finally {
      setPendingScenario(null);
    }
  };

  return (
    <aside className="glass-card flex w-full shrink-0 flex-col overflow-hidden rounded-[var(--radius-xl)] xl:sticky xl:top-3 xl:max-h-[calc(100dvh-24px)] xl:w-[320px]">
      <div className="border-b border-[var(--line)] bg-white/55 px-4 py-4">
        <p className="text-[11px] font-medium tracking-[0.16em] text-[var(--brand)] uppercase">
          History
        </p>
        <h2 className="mt-1 text-lg font-semibold text-[var(--text)]">场景记录</h2>
        <p className="mt-1 text-sm text-[var(--text-soft)]">
          点一下就回到那段场景，继续练下去。
        </p>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-[18px] bg-white/80 px-3 py-3">
            <p className="text-[11px] tracking-[0.14em] text-[var(--text-soft)] uppercase">场景</p>
            <p className="mt-1 text-lg font-semibold text-[var(--text)]">{stats.totalScenarios}</p>
          </div>
          <div className="rounded-[18px] bg-white/80 px-3 py-3">
            <p className="text-[11px] tracking-[0.14em] text-[var(--text-soft)] uppercase">消息</p>
            <p className="mt-1 text-lg font-semibold text-[var(--text)]">{stats.totalMessages}</p>
          </div>
          <div className="rounded-[18px] bg-white/80 px-3 py-3">
            <p className="text-[11px] tracking-[0.14em] text-[var(--text-soft)] uppercase">练习日</p>
            <p className="mt-1 text-lg font-semibold text-[var(--text)]">{stats.activeDays}</p>
          </div>
        </div>

        <p className="mt-3 text-xs text-[var(--text-soft)]">最近练习：{latestPracticeLabel}</p>

        {errorMessage ? (
          <div className="mt-3 rounded-[16px] border border-[rgba(220,104,72,0.2)] bg-[rgba(255,241,235,0.9)] px-3 py-2 text-xs leading-6 text-[#a54d2c]">
            {errorMessage}
          </div>
        ) : null}
      </div>

      <div className="max-h-[260px] overflow-y-auto px-3 py-3 xl:min-h-0 xl:max-h-none xl:flex-1">
        {sessions.length > 0 ? (
          <div className="space-y-2">
            {sessions.map((session) => {
              const isActive = session.scenario === currentScenario;
              const isEditing = editingScenario === session.scenario;
              const isPending = pendingScenario === session.scenario;

              return (
                <article
                  key={session.scenario}
                  className={`block rounded-[22px] border px-4 py-3 transition hover:-translate-y-0.5 ${
                    isActive
                      ? "border-[rgba(31,122,104,0.18)] bg-[var(--brand-soft)]"
                      : "border-[var(--line)] bg-white/88 hover:bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {isEditing ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={draftName}
                            onChange={(event) => setDraftName(event.target.value)}
                            className="w-full rounded-[14px] border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--text)] outline-none transition focus:border-[rgba(31,122,104,0.4)] focus:ring-4 focus:ring-[rgba(31,122,104,0.08)]"
                            placeholder="输入新的场景名字"
                            disabled={isPending}
                          />
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                void submitRename(session.scenario);
                              }}
                              disabled={isPending}
                              className="rounded-full bg-[var(--brand)] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[#166755] disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              保存
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingScenario(null);
                                setDraftName("");
                                setErrorMessage("");
                              }}
                              disabled={isPending}
                              className="rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--text-soft)] transition hover:bg-[var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              取消
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="line-clamp-2 text-sm font-medium leading-6 text-[var(--text)]">
                          {session.scenario}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-[var(--text-soft)]">
                        {session.messageCount > 0
                          ? `${session.messageCount} 条消息`
                          : "刚创建"}
                      </p>
                    </div>
                    {isActive ? (
                      <span className="shrink-0 rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-medium text-[var(--brand)]">
                        当前
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-[var(--text-soft)]">{formatUpdatedAt(session.updatedAt)}</p>

                    {isEditing ? null : (
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/practice?scenario=${encodeURIComponent(session.scenario)}`}
                          className="rounded-full bg-white/86 px-3 py-1.5 text-xs font-medium text-[var(--brand)] transition hover:bg-white"
                        >
                          继续
                        </Link>
                        <button
                          type="button"
                          onClick={() => startRename(session.scenario)}
                          disabled={isPending}
                          className="rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--text-soft)] transition hover:bg-[var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          重命名
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void deleteSession(session.scenario);
                          }}
                          disabled={isPending}
                          className="rounded-full border border-[rgba(220,104,72,0.2)] bg-white px-3 py-1.5 text-xs font-medium text-[#a54d2c] transition hover:bg-[rgba(255,241,235,0.9)] disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          删除
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-[22px] border border-dashed border-[var(--line)] bg-white/72 px-4 py-5 text-sm leading-7 text-[var(--text-soft)]">
            你聊过的场景会显示在这里。以后可以随时点回来，继续原来的对话。
          </div>
        )}
      </div>
    </aside>
  );
}
