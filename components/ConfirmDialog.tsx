"use client";

import { useEffect, useRef } from "react";

export function ConfirmDialog({
  open,
  title,
  message,
  itemName,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message?: string;
  itemName?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur flex items-center justify-center p-5 animate-fade-in"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <div
        className="bg-bg-card border border-border rounded-[14px] w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 flex gap-4 items-start">
          <div
            className={`w-11 h-11 rounded-full grid place-items-center flex-shrink-0 text-xl ${
              danger ? "bg-danger/10 text-danger" : "bg-accent/10 text-accent"
            }`}
            aria-hidden
          >
            {danger ? "🗑" : "?"}
          </div>
          <div className="flex-1 min-w-0">
            <h3
              id="confirm-title"
              className="font-display text-[17px] font-semibold mb-1.5"
            >
              {title}
            </h3>
            {itemName && (
              <div className="mb-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-bg-elevated border border-border text-sm font-semibold font-mono">
                  {itemName}
                </span>
              </div>
            )}
            {message && (
              <p className="text-sm text-fg-muted leading-relaxed">{message}</p>
            )}
          </div>
        </div>
        <div className="px-5 py-3.5 border-t border-border flex justify-end gap-2.5">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`btn ${danger ? "btn-danger" : ""}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
