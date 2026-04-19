interface QuickActionsProps {
  disabled?: boolean;
  onAction: (value: string) => void;
}

const ACTIONS = [
  "我不会",
  "给我提示",
  "再说一遍",
] as const;

export function QuickActions({
  disabled,
  onAction,
}: QuickActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {ACTIONS.map((action, index) => (
        <button
          key={action}
          type="button"
          disabled={disabled}
          onClick={() => onAction(action)}
          className={`rounded-full px-4 py-2 text-sm font-medium transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 ${
            index === 0
              ? "border border-[rgba(31,122,104,0.14)] bg-[var(--brand-soft)] text-[var(--brand)] hover:border-[rgba(31,122,104,0.28)]"
              : "soft-chip text-[var(--text-soft)] hover:border-[rgba(31,122,104,0.24)] hover:text-[var(--brand)]"
          }`}
        >
          {action}
        </button>
      ))}
    </div>
  );
}
