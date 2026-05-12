"use client";

import type { TranslatorStatus } from "@/lib/translator";

const COPY: Record<TranslatorStatus, { label: string; dot: string }> = {
  idle: { label: "Idle", dot: "bg-neutral-500" },
  connecting: { label: "Connecting…", dot: "bg-yellow-400 animate-pulse" },
  live: { label: "Live", dot: "bg-emerald-400" },
  reconnecting: { label: "Reconnecting…", dot: "bg-orange-400 animate-pulse" },
  delayed: { label: "Delayed", dot: "bg-yellow-500 animate-pulse" },
  unavailable: { label: "Unavailable", dot: "bg-red-600" },
  closed: { label: "Closed", dot: "bg-neutral-500" },
  error: { label: "Error", dot: "bg-red-500" },
};

export function StatusPill({ status }: { status: TranslatorStatus }) {
  const { label, dot } = COPY[status];
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1 text-xs font-medium text-neutral-200">
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {label}
    </span>
  );
}
