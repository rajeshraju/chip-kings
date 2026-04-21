import { formatDollar, isPot, netForPerson } from "@/lib/calc";
import type { Person } from "@/lib/types";

type Props = {
  person: Person;
  index: number;
  onEdit?: (i: number) => void;
  onRemove?: (i: number) => void;
  readOnly?: boolean;
};

export function PlayerRow({ person, index, onEdit, onRemove, readOnly }: Props) {
  const pot = isPot(person.name);
  const earnings = Number(person.earnings) || 0;
  const expenses = Number(person.expenses) || 0;
  const net = netForPerson(person);
  const isEarnWin = earnings >= 0;
  const isNetWin = net >= 0;

  return (
    <div
      className={`flex justify-between items-center gap-3 p-3.5 rounded-[10px] border transition-colors animate-slide-in ${
        pot
          ? "border-accent"
          : "border-border bg-bg-elevated hover:border-border-strong"
      } ${pot ? "" : ""}`}
      style={pot ? { background: "rgb(var(--accent) / 0.12)" } : undefined}
    >
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[15px] mb-1 flex items-center gap-2">
          <span>{pot ? "💰" : "👤"}</span>
          <span className="truncate">{person.name}</span>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className={`chip ${isEarnWin ? "chip-win" : "chip-loss"}`}>
            {isEarnWin ? "+" : "−"}${formatDollar(Math.abs(earnings))}
          </span>
          {expenses > 0 && (
            <span className="chip chip-neutral">exp ${formatDollar(expenses)}</span>
          )}
          <span className={`chip ${isNetWin ? "chip-win" : "chip-loss"}`}>
            net {isNetWin ? "+" : "−"}${formatDollar(Math.abs(net))}
          </span>
        </div>
      </div>
      {!readOnly && (
        <div className="flex gap-1.5 flex-shrink-0">
          <button
            type="button"
            onClick={() => onEdit?.(index)}
            className="btn btn-secondary btn-small"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => onRemove?.(index)}
            className="btn btn-danger btn-small"
          >
            Remove
          </button>
        </div>
      )}
    </div>
  );
}
