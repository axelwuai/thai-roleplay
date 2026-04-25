"use client";

import { useCallback, useState } from "react";

import { AuthControls } from "@/components/AuthControls";
import { Header } from "@/components/Header";
import { ScenarioInput } from "@/components/ScenarioInput";
import type { AuthUser } from "@/lib/types";

export function HomePageContent() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authPromptSignal, setAuthPromptSignal] = useState(0);

  const handleAuthChange = useCallback((nextUser: AuthUser | null) => {
    setUser(nextUser);
  }, []);

  const requireAuth = useCallback(() => {
    setAuthPromptSignal((current) => current + 1);
  }, []);

  return (
    <main className="min-h-screen py-6 sm:py-8">
      <div className="page-shell flex min-h-[calc(100vh-3rem)] flex-col gap-6">
        <Header
          badge="AI Thai Speaking Coach"
          title="像真实场景一样，马上开口练泰语"
          subtitle="输入一个生活场景，AI 立刻进入角色扮演。你可以用中文、简单泰语、拼音式泰语或混合表达，它会带着你把对话说下去。"
          actionSlot={
            <AuthControls
              onAuthChange={handleAuthChange}
              openSignal={authPromptSignal}
              subtitle="为了把练习记录、学习历史和后续记忆持续绑定到你的账号，开始使用前请先登录。当前版本先提供邮箱账号登录。"
              title="登录后开始练习"
              triggerLabelWhenLoggedOut="登录账号"
            />
          }
        />

        <section className="glass-card grid flex-1 items-center gap-10 overflow-hidden rounded-[var(--radius-xl)] px-5 py-6 sm:px-8 sm:py-10 lg:grid-cols-[1.15fr_0.85fr] lg:px-12">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(31,122,104,0.15)] bg-[var(--brand-soft)] px-4 py-2 text-sm font-medium text-[var(--brand)]">
              面向中文初学者的泰语口语练习
            </div>

            <div className="space-y-4">
              <h1 className="display-title text-4xl leading-tight text-[var(--text)] sm:text-5xl">
                不背课文，先把生活里的话说出口。
              </h1>
              <p className="max-w-2xl text-base leading-8 text-[var(--text-soft)] sm:text-lg">
                适合想练日常沟通的初学者。AI 会扮演餐厅服务员、司机、医生、老师或店员，用短句、自然口语和罗马音带你一步步练。
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <article className="rounded-[24px] bg-white/78 p-4 shadow-[0_10px_30px_rgba(79,92,90,0.08)]">
                <p className="text-sm font-medium text-[var(--brand)]">立刻开场</p>
                <p className="mt-2 text-sm leading-7 text-[var(--text-soft)]">
                  进入场景后，AI 先开口，不需要你先组织一大段。
                </p>
              </article>
              <article className="rounded-[24px] bg-white/78 p-4 shadow-[0_10px_30px_rgba(79,92,90,0.08)]">
                <p className="text-sm font-medium text-[var(--brand)]">账号连续学习</p>
                <p className="mt-2 text-sm leading-7 text-[var(--text-soft)]">
                  登录后开始练习，历史记录和后续学习都按你的账号持续保存。
                </p>
              </article>
              <article className="rounded-[24px] bg-white/78 p-4 shadow-[0_10px_30px_rgba(79,92,90,0.08)]">
                <p className="text-sm font-medium text-[var(--brand)]">罗马音优先</p>
                <p className="mt-2 text-sm leading-7 text-[var(--text-soft)]">
                  默认同时显示泰文、罗马音和中文，也可以一键隐藏泰文。
                </p>
              </article>
            </div>
          </div>

          <ScenarioInput isAuthenticated={Boolean(user)} onRequireAuth={requireAuth} />
        </section>
      </div>
    </main>
  );
}
