"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { AuthControls } from "@/components/AuthControls";
import { PracticePanel } from "@/components/PracticePanel";
import { ScenarioHistoryPanel } from "@/components/ScenarioHistoryPanel";
import type { ScenarioSession, ScenarioSessionSummary } from "@/lib/types";
import {
  getOrCreatePracticeClientId,
  getPracticeDbMigrationKey,
  listStoredScenarioSessions,
  sortScenarioSessionsByUpdatedAt,
  summarizePracticeStats,
  summarizeScenarioSession,
} from "@/lib/utils";

export function PracticePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const scenario = searchParams.get("scenario")?.trim() ?? "";
  const [clientId, setClientId] = useState("");
  const [authVersion, setAuthVersion] = useState(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [sessionHistory, setSessionHistory] = useState<ScenarioSessionSummary[]>([]);

  const refreshSessionHistory = useCallback(async (activeClientId: string) => {
    if (!activeClientId) {
      return;
    }

    try {
      const response = await fetch("/api/sessions", {
        headers: {
          "x-client-id": activeClientId,
        },
        cache: "no-store",
      });

      if (!response.ok) {
        return;
      }

      const data = (await response.json()) as {
        sessions?: ScenarioSessionSummary[];
      };

      const nextHistory = Array.isArray(data.sessions) ? data.sessions : [];
      setSessionHistory(nextHistory);
    } catch (error) {
      console.error("[PracticePageContent] failed to load session history", error);
    }
  }, []);

  const migrateLocalSessionsToDatabase = useCallback(async (activeClientId: string) => {
    if (typeof window === "undefined" || !activeClientId) {
      return;
    }

    const migrationKey = getPracticeDbMigrationKey(activeClientId);

    if (window.localStorage.getItem(migrationKey) === "done") {
      return;
    }

    const localSessions = listStoredScenarioSessions(window.localStorage).filter(
      (session) => session.messages.length > 0,
    );

    if (localSessions.length === 0) {
      window.localStorage.setItem(migrationKey, "done");
      return;
    }

    try {
      await Promise.all(
        localSessions.map((session) =>
          fetch("/api/sessions", {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              "x-client-id": activeClientId,
            },
            body: JSON.stringify({ session }),
          }),
        ),
      );

      window.localStorage.setItem(migrationKey, "done");
    } catch (error) {
      console.error("[PracticePageContent] failed to migrate local sessions", error);
    }
  }, []);

  const handleSessionChange = useCallback((nextSession: ScenarioSession) => {
    setSessionHistory((currentHistory) => {
      const nextSummary = summarizeScenarioSession(nextSession);
      const remaining = currentHistory.filter((item) => item.scenario !== nextSummary.scenario);

      return sortScenarioSessionsByUpdatedAt([nextSummary, ...remaining]);
    });
  }, []);

  const handleAuthChange = useCallback(async () => {
    setAuthVersion((current) => current + 1);

    if (clientId) {
      await refreshSessionHistory(clientId);
    }
  }, [clientId, refreshSessionHistory]);

  const handleSessionRename = useCallback(
    async (fromScenario: string, toScenario: string) => {
      if (!clientId) {
        throw new Error("当前设备未准备好，请稍后再试。");
      }

      const response = await fetch("/api/sessions", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-client-id": clientId,
        },
        body: JSON.stringify({
          fromScenario,
          toScenario,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        session?: ScenarioSession;
      };

      if (!response.ok || !data.session) {
        throw new Error(data.error ?? "暂时无法重命名场景。");
      }

      await refreshSessionHistory(clientId);

      if (fromScenario === scenario) {
        router.push(`/practice?scenario=${encodeURIComponent(data.session.scenario)}`);
      }
    },
    [clientId, refreshSessionHistory, router, scenario],
  );

  const handleSessionDelete = useCallback(
    async (targetScenario: string) => {
      if (!clientId) {
        throw new Error("当前设备未准备好，请稍后再试。");
      }

      const remainingSessions = sessionHistory.filter((item) => item.scenario !== targetScenario);
      const response = await fetch(`/api/sessions?scenario=${encodeURIComponent(targetScenario)}`, {
        method: "DELETE",
        headers: {
          "x-client-id": clientId,
        },
      });

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "暂时无法删除场景。");
      }

      setSessionHistory(remainingSessions);
      await refreshSessionHistory(clientId);

      if (targetScenario === scenario) {
        const nextScenario = remainingSessions[0]?.scenario;

        if (nextScenario) {
          router.push(`/practice?scenario=${encodeURIComponent(nextScenario)}`);
          return;
        }

        router.push("/");
      }
    },
    [clientId, refreshSessionHistory, router, scenario, sessionHistory],
  );

  const practiceStats = summarizePracticeStats(sessionHistory);

  useEffect(() => {
    setIsSettingsOpen(false);
  }, [scenario]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setClientId(getOrCreatePracticeClientId(window.localStorage));
  }, []);

  useEffect(() => {
    if (!clientId) {
      return;
    }

    void (async () => {
      await migrateLocalSessionsToDatabase(clientId);
      await refreshSessionHistory(clientId);
    })();

    const handleFocus = () => {
      void refreshSessionHistory(clientId);
    };

    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, [clientId, migrateLocalSessionsToDatabase, refreshSessionHistory]);

  return (
    <main className="min-h-[100dvh] overflow-x-hidden py-3 sm:py-4">
      <div className="page-shell flex flex-col gap-3">
        <header className="glass-card flex items-center justify-between gap-4 rounded-[24px] px-4 py-3 sm:px-6">
          <div className="min-w-0 space-y-1">
            <div className="inline-flex items-center gap-2 rounded-full bg-[var(--accent-soft)] px-3 py-1 text-[11px] font-medium tracking-[0.14em] text-[var(--brand)] uppercase">
              Thai Roleplay
            </div>
            <div className="space-y-0.5">
              <h1 className="text-lg font-semibold text-[var(--text)] sm:text-xl">泰语口语练习</h1>
              <p className="truncate text-sm text-[var(--text-soft)]">
                {scenario
                  ? "顶部看场景状态，中间只滚动对话，底部固定发送和求助。"
                  : "先选择一个生活场景，再开始角色扮演。"}
              </p>
            </div>
          </div>

          {scenario ? (
            <div className="flex shrink-0 items-center gap-2">
              <div className="hidden rounded-full border border-[var(--line)] bg-white/75 px-3 py-2 text-sm text-[var(--text-soft)] sm:block">
                当前场景：{scenario}
              </div>
              <AuthControls clientId={clientId} onAuthChange={handleAuthChange} />
              <button
                type="button"
                onClick={() => setIsSettingsOpen((current) => !current)}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-white/80 px-4 py-2 text-sm font-medium text-[var(--text-soft)] transition hover:-translate-y-0.5 hover:bg-white"
              >
                设置
                <svg
                  viewBox="0 0 24 24"
                  className={`h-4 w-4 transition ${isSettingsOpen ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
            </div>
          ) : (
            <Link
              href="/"
              className="inline-flex shrink-0 items-center rounded-full border border-[var(--line)] bg-white/80 px-4 py-2 text-sm font-medium text-[var(--text-soft)] transition hover:-translate-y-0.5 hover:bg-white"
            >
              回首页
            </Link>
          )}
        </header>

        {scenario ? (
          <section className="flex flex-col gap-3 xl:grid xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
            <div className="order-2 xl:order-1">
              <PracticePanel
                key={`${scenario}:${authVersion}`}
                clientId={clientId}
                scenario={scenario}
                isSettingsOpen={isSettingsOpen}
                onCloseSettings={() => setIsSettingsOpen(false)}
                onSessionChange={handleSessionChange}
              />
            </div>
            <div className="order-1 xl:order-2">
              <ScenarioHistoryPanel
                currentScenario={scenario}
                sessions={sessionHistory}
                stats={practiceStats}
                onDeleteSession={handleSessionDelete}
                onRenameSession={handleSessionRename}
              />
            </div>
          </section>
        ) : (
          <section className="glass-card flex min-h-0 flex-1 items-center justify-center rounded-[var(--radius-xl)] px-6 py-12 text-center">
            <div className="max-w-md space-y-4">
              <p className="text-sm uppercase tracking-[0.2em] text-[var(--brand)]">
                No Scenario
              </p>
              <h2 className="display-title text-3xl text-[var(--text)]">先选一个你想练的生活情境。</h2>
              <p className="text-sm leading-7 text-[var(--text-soft)]">
                比如“去餐厅点菜”或“叫出租车去机场”。进入后，AI 会直接开始对话。
              </p>
              <Link
                href="/"
                className="inline-flex rounded-full bg-[var(--brand)] px-5 py-3 text-sm font-medium text-white transition hover:-translate-y-0.5 hover:bg-[#166755]"
              >
                回首页开始
              </Link>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
