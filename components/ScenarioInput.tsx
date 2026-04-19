"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const EXAMPLE_SCENARIOS = [
  "去餐厅点菜",
  "叫出租车去机场",
  "在医院描述症状",
  "和老师沟通作业",
  "买衣服试穿",
];

export function ScenarioInput() {
  const router = useRouter();
  const [scenario, setScenario] = useState("");
  const [isPending, startTransition] = useTransition();

  const startPractice = (value: string) => {
    const nextScenario = value.trim();

    if (!nextScenario) {
      return;
    }

    startTransition(() => {
      router.push(`/practice?scenario=${encodeURIComponent(nextScenario)}`);
    });
  };

  return (
    <aside className="rounded-[30px] bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(255,249,242,0.98))] p-5 shadow-[0_18px_45px_rgba(79,92,90,0.12)] sm:p-6">
      <div className="space-y-5">
        <div className="space-y-3">
          <p className="text-sm font-medium text-[var(--brand)]">开始一个新场景</p>
          <h2 className="display-title text-3xl leading-tight text-[var(--text)]">
            想练什么，就直接写出来。
          </h2>
          <p className="text-sm leading-7 text-[var(--text-soft)]">
            例如：去餐厅点菜、打车去机场、跟医生说肚子疼。
          </p>
        </div>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            startPractice(scenario);
          }}
        >
          <label className="block space-y-2">
            <span className="text-sm font-medium text-[var(--text)]">场景名称</span>
            <input
              value={scenario}
              onChange={(event) => setScenario(event.target.value)}
              placeholder="去餐厅点菜 / 叫出租车 / 在医院描述症状"
              className="w-full rounded-[22px] border border-[var(--line)] bg-white px-4 py-4 text-base text-[var(--text)] outline-none transition focus:border-[rgba(31,122,104,0.4)] focus:ring-4 focus:ring-[rgba(31,122,104,0.08)]"
            />
          </label>

          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-[22px] bg-[var(--brand)] px-5 py-4 text-base font-medium text-white transition hover:-translate-y-0.5 hover:bg-[#166755] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isPending ? "正在进入练习..." : "开始练习"}
          </button>
        </form>

        <div className="space-y-3">
          <p className="text-sm font-medium text-[var(--text)]">试试这些示例</p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_SCENARIOS.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => {
                  setScenario(example);
                  startPractice(example);
                }}
                className="soft-chip rounded-full px-4 py-2 text-sm text-[var(--text-soft)] transition hover:-translate-y-0.5 hover:border-[rgba(31,122,104,0.25)] hover:text-[var(--brand)]"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
