"use client";

export type AdminView = "cards" | "list";

export function ViewToggle({
  value,
  onChange,
}: {
  value: AdminView;
  onChange: (v: AdminView) => void;
}) {
  return (
    <div
      role="group"
      aria-label="View mode"
      className="inline-flex rounded-[10px] border border-border bg-bg-elevated p-0.5 text-xs"
    >
      <ToggleBtn active={value === "cards"} onClick={() => onChange("cards")}>
        🂠 Cards
      </ToggleBtn>
      <ToggleBtn active={value === "list"} onClick={() => onChange("list")}>
        ≡ List
      </ToggleBtn>
    </div>
  );
}

function ToggleBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`px-3 py-1.5 rounded-[8px] font-medium transition-colors ${
        active
          ? "bg-bg-card text-fg border border-border"
          : "text-fg-dim hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}
