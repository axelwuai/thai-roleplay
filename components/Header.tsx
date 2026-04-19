import Link from "next/link";

interface HeaderProps {
  badge?: string;
  title: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  actionSlot?: React.ReactNode;
}

export function Header({
  badge,
  title,
  subtitle,
  backHref,
  backLabel = "返回首页",
  actionSlot,
}: HeaderProps) {
  return (
    <header className="glass-card rounded-[var(--radius-xl)] px-5 py-5 sm:px-8 sm:py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          {badge ? (
            <div className="inline-flex items-center gap-2 rounded-full bg-[var(--accent-soft)] px-3 py-1.5 text-xs font-medium tracking-[0.14em] text-[var(--brand)] uppercase">
              {badge}
            </div>
          ) : null}
          <div className="space-y-2">
            <h1 className="display-title text-3xl leading-tight text-[var(--text)] sm:text-4xl">
              {title}
            </h1>
            {subtitle ? (
              <p className="max-w-3xl text-sm leading-7 text-[var(--text-soft)] sm:text-base">
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {actionSlot}
          {backHref ? (
            <Link
              href={backHref}
              className="inline-flex items-center rounded-full border border-[var(--line)] bg-white/80 px-4 py-2 text-sm font-medium text-[var(--text-soft)] transition hover:-translate-y-0.5 hover:bg-white"
            >
              {backLabel}
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}
