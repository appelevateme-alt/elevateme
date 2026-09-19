"use client";

import { useEffect, useRef } from "react";
import { Button } from "./Button";

type AlertTone = "info" | "success" | "warning" | "danger";

const alertStyles: Record<AlertTone, string> = {
  info: "border-blue-300 bg-blue-50 text-blue-900",
  success: "border-green-300 bg-green-50 text-green-900",
  warning: "border-amber-300 bg-amber-50 text-amber-900",
  danger: "border-red-300 bg-red-50 text-red-900",
};

export function Alert({
  tone = "info",
  title,
  children,
}: {
  tone?: AlertTone;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`rounded border px-4 py-3 text-sm ${alertStyles[tone]}`}>
      {title && <p className="font-semibold">{title}</p>}
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

// Toast for non-critical confirmation only (§9). Simple, auto-dismissing, with text (never icon-only).
export function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div role="status" className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded border border-gray-300 bg-gray-900 px-4 py-2 text-sm text-white">
      {message}
    </div>
  );
}

export function Progress({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div>
      <p className="em-meta mb-1">{label}: step {value} of {max}</p>
      <div role="progressbar" aria-valuenow={value} aria-valuemin={1} aria-valuemax={max} aria-label={label} className="h-1.5 w-full rounded bg-gray-200">
        <div className="h-1.5 rounded bg-[#1d4ed8]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Skeleton({ lines = 3, label = "Loading" }: { lines?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-2 py-2">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-4 animate-pulse rounded bg-gray-200" style={{ width: `${92 - i * 12}%` }} />
      ))}
      <span className="sr-only">{label}…</span>
    </div>
  );
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading rows" className="flex flex-col divide-y divide-gray-100 border-y border-gray-200">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2 py-3">
          <div className="h-4 w-2/3 animate-pulse rounded bg-gray-200" />
          <div className="h-3 w-1/3 animate-pulse rounded bg-gray-100" />
        </div>
      ))}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  body = "We could not load this. Your input is preserved — try again.",
  onRetry,
}: {
  title?: string;
  body?: string;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="rounded border border-red-300 bg-red-50 p-5">
      <p className="em-item-title text-red-900">{title}</p>
      <p className="mt-1 text-sm text-red-800">{body}</p>
      {onRetry && (
        <div className="mt-3">
          <Button variant="secondary" onClick={onRetry}>Retry</Button>
        </div>
      )}
    </div>
  );
}

// Accessible confirmation dialog: traps focus, restores trigger focus, Esc closes.
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const lastTrigger = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      lastTrigger.current = document.activeElement as HTMLElement;
      confirmRef.current?.focus();
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") onCancel();
        if (e.key === "Tab") {
          // Simple focus trap between the two buttons.
          const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-confirm-dialog] button"));
          if (buttons.length === 0) return;
          const first = buttons[0];
          const last = buttons[buttons.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      };
      document.addEventListener("keydown", onKey);
      return () => {
        document.removeEventListener("keydown", onKey);
        lastTrigger.current?.focus?.();
      };
    }
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="presentation" onClick={onCancel}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        data-confirm-dialog
        className="w-full max-w-md rounded border border-gray-300 bg-white p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-title" className="em-section-title">{title}</h2>
        <p id="confirm-body" className="mt-1 text-sm text-gray-600">{body}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button ref={confirmRef} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}
