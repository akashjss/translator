"use client";

import { useEffect, useState } from "react";
import { DirectionCard } from "@/components/SpeakerCard";
import { StatusPill } from "@/components/StatusPill";
import { useConversation } from "@/hooks/useConversation";

export default function HomePage() {
  const {
    status,
    active,
    error,
    transcripts,
    latency,
    start,
    stop,
    setSpeaker,
    toggleSpeaker,
    setVolume,
  } = useConversation();

  const [langA, setLangA] = useState("en");
  const [langB, setLangB] = useState("es");

  const isLive = status === "live" || status === "connecting" || status === "reconnecting" || status === "delayed";
  const canStart = status === "idle" || status === "closed" || status === "error" || status === "unavailable";

  useEffect(() => {
    if (!isLive) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) {
        return;
      }
      e.preventDefault();
      toggleSpeaker();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isLive, toggleSpeaker]);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Realtime Translator</h1>
          <p className="text-sm text-neutral-400">
            Tap the card or press{" "}
            <kbd className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px]">
              Space
            </kbd>{" "}
            to switch who&apos;s speaking.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status={status} />
          {canStart ? (
            <button
              type="button"
              onClick={() => start({ langA, langB })}
              className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-400"
            >
              Start
            </button>
          ) : (
            <button
              type="button"
              onClick={stop}
              className="rounded-full bg-red-500 px-4 py-2 text-sm font-semibold text-red-950 hover:bg-red-400"
            >
              Stop
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2">
        <DirectionCard
          side="left"
          speakerLabel="Person A"
          speakingLanguage={langA}
          outputLanguage={langB}
          onLanguageChange={setLangA}
          transcript={transcripts.AtoB}
          latency={latency.AtoB}
          disabled={isLive}
          isActive={isLive && active === "A"}
          onActivate={() => isLive && setSpeaker("A")}
          onVolumeChange={(v) => setVolume("AtoB", v)}
        />
        <DirectionCard
          side="right"
          speakerLabel="Person B"
          speakingLanguage={langB}
          outputLanguage={langA}
          onLanguageChange={setLangB}
          transcript={transcripts.BtoA}
          latency={latency.BtoA}
          disabled={isLive}
          isActive={isLive && active === "B"}
          onActivate={() => isLive && setSpeaker("B")}
          onVolumeChange={(v) => setVolume("BtoA", v)}
        />
      </section>

      <footer className="mt-auto text-center text-xs text-neutral-500">
        Only the active card&apos;s mic is sent to OpenAI.
      </footer>
    </main>
  );
}
