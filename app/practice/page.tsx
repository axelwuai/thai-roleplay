import { Suspense } from "react";

import { PracticePageContent } from "@/components/PracticePageContent";

export default function PracticePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen py-6 sm:py-8">
          <div className="page-shell">
            <div className="glass-card rounded-[var(--radius-xl)] px-5 py-12 text-center text-[var(--text-soft)]">
              正在加载练习场景...
            </div>
          </div>
        </main>
      }
    >
      <PracticePageContent />
    </Suspense>
  );
}
