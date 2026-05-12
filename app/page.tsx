"use client";

import { useEffect, useState } from "react";
import { WaveformVisualizer } from "@/components/WaveformVisualizer";
import { useConversation } from "@/hooks/useConversation";
import { LANGUAGES } from "@/lib/languages";

const STATUS_LABEL: Record<string, string> = {
  idle: "Ready",
  connecting: "Connecting…",
  live: "Live mode",
  reconnecting: "Reconnecting…",
  delayed: "Delayed…",
  unavailable: "Unavailable",
  closed: "Session ended",
  error: "Error",
};

export default function HomePage() {
  const { status, error, transcript, micStream, remoteStream, start, stop } =
    useConversation();

  const [targetLang, setTargetLang] = useState("en");

  const isLive =
    status === "live" ||
    status === "connecting" ||
    status === "reconnecting" ||
    status === "delayed";
  const canStart =
    status === "idle" ||
    status === "closed" ||
    status === "error" ||
    status === "unavailable";

  const targetLangLabel =
    LANGUAGES.find((l) => l.code === targetLang)?.label ?? targetLang;

  return (
    <main className="mx-auto max-w-4xl px-6 py-8 min-h-screen">
      {/* Header */}
      <div className="flex items-start justify-between mb-1">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">
            Live translation waveform
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Input sits above the baseline. Translated output appears below it.
          </p>
        </div>
        <div className="flex items-center gap-5 text-sm text-gray-400 pt-1.5">
          {isLive && (
            <span className="flex items-center gap-1.5 text-gray-600">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Sending audio
            </span>
          )}
          <span>{STATUS_LABEL[status] ?? status}</span>
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center justify-between mt-6 mb-4">
        <div className="flex items-center gap-3">
          {canStart ? (
            <button
              type="button"
              onClick={() => start(targetLang)}
              className="flex items-center gap-2 rounded border border-gray-300 bg-white px-3.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm transition-colors"
            >
              <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
                <path d="M2 1.5l9 4.5-9 4.5V1.5z" />
              </svg>
              Start session
            </button>
          ) : (
            <button
              type="button"
              onClick={stop}
              className="flex items-center gap-2 rounded border border-gray-300 bg-white px-3.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm transition-colors"
            >
              <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
                <rect x="2" y="2" width="8" height="8" rx="1" />
              </svg>
              Stop session
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span className="text-gray-400">Translate to</span>
          <select
            value={targetLang}
            onChange={(e) => setTargetLang(e.target.value)}
            disabled={isLive}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400 disabled:opacity-50"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Waveform panel */}
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
          <div className="text-xs text-gray-400">
            {isLive
              ? `Auto-detecting input → translating to ${targetLangLabel}`
              : "Start a session to see the waveform"}
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-cyan-400" />
              Input
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-cyan-700" />
              Output
            </span>
          </div>
        </div>
        <div className="px-4 py-3">
          <WaveformVisualizer
            inputStream={micStream}
            outputStream={remoteStream}
            isInputActive={isLive}
          />
        </div>
      </div>

      {/* Transcripts */}
      <div className="grid grid-cols-2 gap-10 mt-7">
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-2">Input transcript</p>
          <p className="text-sm text-gray-800 leading-relaxed min-h-[5rem]">
            {transcript.sourceFinal}
            {transcript.sourceInterim && (
              <span className="text-gray-400"> {transcript.sourceInterim}</span>
            )}
            {!transcript.sourceFinal && !transcript.sourceInterim && (
              <span className="text-gray-300">…</span>
            )}
          </p>
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-2">Output transcript</p>
          <p className="text-sm text-gray-800 leading-relaxed min-h-[5rem]">
            {transcript.targetFinal}
            {transcript.targetInterim && (
              <span className="text-gray-400"> {transcript.targetInterim}</span>
            )}
            {!transcript.targetFinal && !transcript.targetInterim && (
              <span className="text-gray-300">…</span>
            )}
          </p>
        </div>
      </div>
    </main>
  );
}
