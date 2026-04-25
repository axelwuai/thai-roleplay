"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { AuthUser } from "@/lib/types";
import { getOrCreatePracticeClientId } from "@/lib/utils";

interface AuthControlsProps {
  clientId?: string;
  allowClose?: boolean;
  hideTrigger?: boolean;
  onAuthChange?: (user: AuthUser | null) => void;
  openSignal?: number;
  required?: boolean;
  subtitle?: string;
  title?: string;
  triggerLabelWhenLoggedOut?: string;
}

type AuthMode = "login" | "register";

export function AuthControls({
  clientId,
  allowClose = true,
  hideTrigger = false,
  onAuthChange,
  openSignal,
  required = false,
  subtitle = "登录后，你的练习记录就能跟账号绑定，换设备也能继续练。",
  title,
  triggerLabelWhenLoggedOut = "登录同步",
}: AuthControlsProps) {
  const onAuthChangeRef = useRef(onAuthChange);
  const [resolvedClientId, setResolvedClientId] = useState(clientId ?? "");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (clientId) {
      setResolvedClientId(clientId);
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    setResolvedClientId(getOrCreatePracticeClientId(window.localStorage));
  }, [clientId]);

  useEffect(() => {
    onAuthChangeRef.current = onAuthChange;
  }, [onAuthChange]);

  useEffect(() => {
    let cancelled = false;

    const loadCurrentUser = async () => {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        const data = (await response.json()) as { user?: AuthUser | null };
        const nextUser = data.user ?? null;

        if (!cancelled) {
          setUser(nextUser);
          onAuthChangeRef.current?.(nextUser);
        }
      } catch (error) {
        console.error("[AuthControls] failed to load current user", error);
      }
    };

    void loadCurrentUser();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!openSignal || user) {
      return;
    }

    setIsOpen(true);
  }, [openSignal, user]);

  useEffect(() => {
    if (!required || !isMounted || user) {
      return;
    }

    setIsOpen(true);
  }, [isMounted, required, user]);

  const actionLabel = useMemo(() => {
    if (user) {
      return user.email;
    }

    return triggerLabelWhenLoggedOut;
  }, [triggerLabelWhenLoggedOut, user]);

  const submitAuth = async () => {
    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
          clientId: resolvedClientId,
        }),
      });

      const data = (await response.json()) as {
        user?: AuthUser;
        error?: string;
      };

      if (!response.ok || !data.user) {
        throw new Error(data.error ?? "账号请求失败。");
      }

      setUser(data.user);
      setPassword("");
      setErrorMessage("");
      setIsOpen(false);
      onAuthChangeRef.current?.(data.user);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "暂时无法完成操作。");
    } finally {
      setIsSubmitting(false);
    }
  };

  const logout = async () => {
    setIsSubmitting(true);
    setErrorMessage("");

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
      });

      setUser(null);
      onAuthChangeRef.current?.(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "退出登录失败。");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {!hideTrigger ? (
        <button
          type="button"
          onClick={() => {
            if (user) {
              void logout();
              return;
            }

            setIsOpen(true);
          }}
          disabled={isSubmitting}
          className="inline-flex items-center rounded-full border border-[var(--line)] bg-white/80 px-4 py-2 text-sm font-medium text-[var(--text-soft)] transition hover:-translate-y-0.5 hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
        >
          {user ? `${actionLabel} · 退出` : actionLabel}
        </button>
      ) : null}

      {isOpen && isMounted
        ? createPortal(
            <div className="fixed inset-0 z-[100] overflow-y-auto bg-[rgba(31,42,44,0.28)] px-4 py-6 sm:flex sm:items-center sm:justify-center sm:py-8">
              <div className="glass-card mx-auto w-full max-w-md max-h-[calc(100dvh-48px)] overflow-y-auto rounded-[28px] px-5 py-5 sm:my-auto sm:px-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-medium tracking-[0.16em] text-[var(--brand)] uppercase">
                      Account
                    </p>
                    <h2 className="mt-1 text-2xl font-semibold text-[var(--text)]">
                      {title ?? (mode === "login" ? "登录账号" : "创建账号")}
                    </h2>
                    <p className="mt-2 text-sm leading-7 text-[var(--text-soft)]">
                      {subtitle}
                    </p>
                  </div>
                  {allowClose ? (
                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      className="rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-sm text-[var(--text-soft)]"
                    >
                      关闭
                    </button>
                  ) : null}
                </div>

                <div className="mt-5 flex rounded-full bg-[rgba(255,249,242,0.88)] p-1">
                  {(["login", "register"] as const).map((nextMode) => (
                    <button
                      key={nextMode}
                      type="button"
                      onClick={() => {
                        setMode(nextMode);
                        setErrorMessage("");
                      }}
                      className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition ${
                        mode === nextMode
                          ? "bg-[var(--brand)] text-white"
                          : "text-[var(--text-soft)]"
                      }`}
                    >
                      {nextMode === "login" ? "登录" : "注册"}
                    </button>
                  ))}
                </div>

                <form
                  className="mt-5 space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void submitAuth();
                  }}
                >
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-[var(--text)]">邮箱</span>
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@example.com"
                      className="w-full rounded-[18px] border border-[var(--line)] bg-white px-4 py-3 text-sm text-[var(--text)] outline-none transition focus:border-[rgba(31,122,104,0.4)] focus:ring-4 focus:ring-[rgba(31,122,104,0.08)]"
                    />
                  </label>

                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-[var(--text)]">密码</span>
                    <input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="至少 6 位"
                      className="w-full rounded-[18px] border border-[var(--line)] bg-white px-4 py-3 text-sm text-[var(--text)] outline-none transition focus:border-[rgba(31,122,104,0.4)] focus:ring-4 focus:ring-[rgba(31,122,104,0.08)]"
                    />
                  </label>

                  {errorMessage ? (
                    <div className="rounded-[18px] border border-[rgba(220,104,72,0.2)] bg-[rgba(255,241,235,0.9)] px-4 py-3 text-sm text-[#a54d2c]">
                      {errorMessage}
                    </div>
                  ) : null}

                  <button
                    type="submit"
                    disabled={isSubmitting || !email.trim() || password.trim().length < 6}
                    className="w-full rounded-[18px] bg-[var(--brand)] px-5 py-3 text-sm font-medium text-white transition hover:-translate-y-0.5 hover:bg-[#166755] disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isSubmitting
                      ? "处理中..."
                      : mode === "login"
                        ? "登录并同步练习记录"
                        : "创建账号并同步练习记录"}
                  </button>
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
