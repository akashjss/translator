"use client";

import { LANGUAGES } from "@/lib/languages";
import type { DirectionTranscript } from "@/hooks/useConversation";

interface Props {
  side: "left" | "right";
  speakerLabel: string;
  speakingLanguage: string;
  outputLanguage: string;
  onLanguageChange: (code: string) => void;
  transcript: DirectionTranscript;
  disabled: boolean;
  isActive: boolean;
  onActivate: () => void;
}

export function DirectionCard({
  side,
  speakerLabel,
  speakingLanguage,
  outputLanguage,
  onLanguageChange,
  transcript,
  disabled,
  isActive,
  onActivate,
}: Props) {
  const accent =
    side === "left" ? "border-sky-500/60" : "border-amber-500/60";
  const ring = isActive
    ? side === "left"
      ? "ring-2 ring-sky-400 shadow-sky-500/30"
      : "ring-2 ring-amber-400 shadow-amber-500/30"
    : "";
  const activeBtn =
    side === "left"
      ? "bg-sky-500 text-white"
      : "bg-amber-500 text-black";

  const speakingLangLabel =
    LANGUAGES.find((l) => l.code === speakingLanguage)?.label ??
    speakingLanguage;
  const outputLangLabel =
    LANGUAGES.find((l) => l.code === outputLanguage)?.label ?? outputLanguage;

  return (
    <section
      className={`flex flex-col gap-3 rounded-2xl border ${accent} bg-neutral-900/60 p-4 shadow-lg ${ring}`}
    >
      <header className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-neutral-400">
            {speakerLabel} speaks
          </div>
          <div className="text-lg font-semibold">
            {speakingLangLabel}
            <span className="mx-2 text-neutral-500">→</span>
            <span className="text-neutral-300">{outputLangLabel}</span>
          </div>
        </div>
        <select
          value={speakingLanguage}
          onChange={(e) => onLanguageChange(e.target.value)}
          disabled={disabled}
          className="rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-neutral-500 disabled:opacity-50"
          aria-label={`${speakerLabel} language`}
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </header>

      <button
        type="button"
        onClick={onActivate}
        disabled={!isActive && disabled === false}
        className={`rounded-xl px-4 py-3 text-sm font-medium transition ${
          isActive
            ? activeBtn
            : "bg-neutral-800 text-neutral-200 hover:bg-neutral-700"
        }`}
      >
        {isActive ? "Speaking" : `Tap when ${speakerLabel} is speaking`}
      </button>

      <div className="grid gap-2">
        <TranscriptBlock
          label="Heard"
          finalText={transcript.sourceFinal}
          interimText={transcript.sourceInterim}
        />
        <TranscriptBlock
          label="Translated"
          finalText={transcript.targetFinal}
          interimText={transcript.targetInterim}
          muted
        />
      </div>
    </section>
  );
}

function TranscriptBlock({
  label,
  finalText,
  interimText,
  muted,
}: {
  label: string;
  finalText: string;
  interimText: string;
  muted?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border border-neutral-800 bg-neutral-950/70 p-3 text-sm ${
        muted ? "text-neutral-300" : "text-neutral-100"
      }`}
    >
      <div className="mb-1 text-[10px] uppercase tracking-widest text-neutral-500">
        {label}
      </div>
      <div className="min-h-[3rem] whitespace-pre-wrap leading-relaxed">
        {finalText}
        {interimText && (
          <span className="text-neutral-400"> {interimText}</span>
        )}
        {!finalText && !interimText && (
          <span className="text-neutral-600">…</span>
        )}
      </div>
    </div>
  );
}
