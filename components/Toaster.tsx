"use client";

import { useEffect, useState } from "react";

type ToastKind = "success" | "error" | "info";
type ToastEvent = { id: number; message: string; kind: ToastKind };

const CHANNEL = "chip-kings-toast";

export function toast(message: string, kind: ToastKind = "info") {
  if (typeof window === "undefined") return;
  const event = new CustomEvent<ToastEvent>(CHANNEL, {
    detail: { id: Date.now() + Math.random(), message, kind },
  });
  window.dispatchEvent(event);
}

export function Toaster() {
  const [current, setCurrent] = useState<ToastEvent | null>(null);

  useEffect(() => {
    function handler(e: Event) {
      const ce = e as CustomEvent<ToastEvent>;
      setCurrent(ce.detail);
      const timer = setTimeout(() => setCurrent(null), 2400);
      return () => clearTimeout(timer);
    }
    window.addEventListener(CHANNEL, handler);
    return () => window.removeEventListener(CHANNEL, handler);
  }, []);

  if (!current) return null;

  const borderColor =
    current.kind === "success"
      ? "border-success"
      : current.kind === "error"
      ? "border-danger"
      : "border-border";

  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-bg-card border ${borderColor} rounded-[10px] px-4 py-3 text-sm font-medium shadow-xl flex items-center gap-2.5 animate-fade-in`}
      role="status"
    >
      {current.message}
    </div>
  );
}
