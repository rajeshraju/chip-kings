"use client";

import { useEffect, useRef, useState } from "react";

export function PromptDialog({
  open,
  title,
  message,
  defaultValue = "",
  placeholder,
  confirmLabel = "Save",
  cancelLabel = "Cancel",
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onCancel: () => void;
  onConfirm: (value: string) => void;
}) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setValue(defaultValue);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, defaultValue, onCancel]);

  if (!open) return null;

  function submit() {
    onConfirm(value);
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur flex items-center justify-center p-5 animate-fade-in"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="prompt-title"
    >
      <div
        className="bg-bg-card border border-border rounded-[14px] w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 flex gap-4 items-start">
          <div
            className="w-11 h-11 rounded-full grid place-items-center flex-shrink-0 text-xl bg-accent/10 text-accent"
            aria-hidden
          >
            ✏️
          </div>
          <div className="flex-1 min-w-0">
            <h3
              id="prompt-title"
              className="font-display text-[17px] font-semibold mb-1.5"
            >
              {title}
            </h3>
            {message && (
              <p className="text-sm text-fg-muted leading-relaxed mb-3">
                {message}
              </p>
            )}
            <input
              ref={inputRef}
              className="input"
              value={value}
              placeholder={placeholder}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
            />
          </div>
        </div>
        <div className="px-5 py-3.5 border-t border-border flex justify-end gap-2.5">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="btn" onClick={submit}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
