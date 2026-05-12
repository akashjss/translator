"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createTranslationSession,
  type TranslatorHandle,
  type TranslatorStatus,
} from "@/lib/translator";

export type Speaker = "A" | "B";
export type Direction = "AtoB" | "BtoA";

export interface DirectionTranscript {
  sourceFinal: string;
  sourceInterim: string;
  targetFinal: string;
  targetInterim: string;
}

export interface DirectionLatency {
  input: number | null;
  output: number | null;
}

const emptyTranscript = (): DirectionTranscript => ({
  sourceFinal: "",
  sourceInterim: "",
  targetFinal: "",
  targetInterim: "",
});

const emptyLatency = (): DirectionLatency => ({ input: null, output: null });

interface StartArgs {
  langA: string;
  langB: string;
}

const MAX_RETRIES = 3;

const directionForSpeaker = (s: Speaker): Direction =>
  s === "A" ? "AtoB" : "BtoA";

export function useConversation() {
  const [status, setStatus] = useState<TranslatorStatus>("idle");
  const [active, setActive] = useState<Speaker>("A");
  const [error, setError] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<
    Record<Direction, DirectionTranscript>
  >({ AtoB: emptyTranscript(), BtoA: emptyTranscript() });
  const [latency, setLatency] = useState<Record<Direction, DirectionLatency>>({
    AtoB: emptyLatency(),
    BtoA: emptyLatency(),
  });

  const sessionsRef = useRef<Record<Direction, TranslatorHandle | null>>({
    AtoB: null,
    BtoA: null,
  });
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioElsRef = useRef<Record<Direction, HTMLAudioElement | null>>({
    AtoB: null,
    BtoA: null,
  });
  const statusRef = useRef<Record<Direction, TranslatorStatus>>({
    AtoB: "idle",
    BtoA: "idle",
  });
  const activeRef = useRef<Speaker>("A");
  const langRef = useRef({ A: "en", B: "es" });
  const retryCount = useRef<Record<Direction, number>>({ AtoB: 0, BtoA: 0 });
  const retryTimer = useRef<Record<Direction, ReturnType<typeof setTimeout> | null>>({
    AtoB: null,
    BtoA: null,
  });

  const updateAggregateStatus = useCallback(() => {
    const { AtoB: a, BtoA: b } = statusRef.current;
    if (a === "unavailable" || b === "unavailable") setStatus("unavailable");
    else if (a === "error" || b === "error") setStatus("error");
    else if (a === "reconnecting" || b === "reconnecting") setStatus("reconnecting");
    else if (a === "delayed" || b === "delayed") setStatus("delayed");
    else if (a === "live" && b === "live") setStatus("live");
    else if (a === "closed" && b === "closed") setStatus("closed");
    else setStatus("connecting");
  }, []);

  const ensureAudioEl = (dir: Direction) => {
    if (typeof window === "undefined") return null;
    let el = audioElsRef.current[dir];
    if (!el) {
      el = new Audio();
      el.autoplay = true;
      audioElsRef.current[dir] = el;
    }
    return el;
  };

  const handleDelta = useCallback(
    (dir: Direction, kind: keyof DirectionTranscript, delta: string) => {
      setTranscripts((prev) => ({
        ...prev,
        [dir]: { ...prev[dir], [kind]: prev[dir][kind] + delta },
      }));
    },
    [],
  );

  const commitInterim = useCallback(
    (dir: Direction, text: string, isSource: boolean) => {
      setTranscripts((prev) => {
        const cur = prev[dir];
        const finalKey = isSource ? "sourceFinal" : "targetFinal";
        const interimKey = isSource ? "sourceInterim" : "targetInterim";
        return {
          ...prev,
          [dir]: {
            ...cur,
            [finalKey]: (cur[finalKey] ? cur[finalKey] + " " : "") + text.trim(),
            [interimKey]: "",
          },
        };
      });
    },
    [],
  );

  const handleLatency = useCallback(
    (dir: Direction, ms: number, kind: "input" | "output") => {
      setLatency((prev) => ({
        ...prev,
        [dir]: { ...prev[dir], [kind]: ms },
      }));
    },
    [],
  );

  // Forward-declared so scheduleReconnect and buildSessionForDir can reference each other
  const scheduleReconnectRef = useRef<(dir: Direction) => void>(() => {});

  const buildSessionForDir = useCallback(
    async (dir: Direction): Promise<TranslatorHandle> => {
      const targetLang = dir === "AtoB" ? langRef.current.B : langRef.current.A;
      const micStream = micStreamRef.current;
      if (!micStream) throw new Error("No mic stream");
      const audioEl = ensureAudioEl(dir);
      if (!audioEl) throw new Error("Audio element not available");

      return createTranslationSession({
        targetLang,
        micStream,
        remoteAudio: audioEl,
        onSourceTranscriptDelta: (d) => handleDelta(dir, "sourceInterim", d),
        onSourceTranscriptDone: (t) => commitInterim(dir, t, true),
        onTargetTranscriptDelta: (d) => handleDelta(dir, "targetInterim", d),
        onTargetTranscriptDone: (t) => commitInterim(dir, t, false),
        onLatency: (ms, kind) => handleLatency(dir, ms, kind),
        onStatus: (s) => {
          statusRef.current[dir] = s;
          updateAggregateStatus();
          if (s === "error") scheduleReconnectRef.current(dir);
        },
        onError: (e) => {
          const msg = e instanceof Error ? e.message : "translation session error";
          setError(msg);
        },
      });
    },
    [handleDelta, commitInterim, handleLatency, updateAggregateStatus],
  );

  const scheduleReconnect = useCallback(
    (dir: Direction) => {
      if (!micStreamRef.current) return;

      const attempt = retryCount.current[dir];
      if (attempt >= MAX_RETRIES) {
        statusRef.current[dir] = "unavailable";
        updateAggregateStatus();
        return;
      }

      retryCount.current[dir] = attempt + 1;
      statusRef.current[dir] = "reconnecting";
      updateAggregateStatus();

      const delay = Math.pow(2, attempt) * 1_000;
      retryTimer.current[dir] = setTimeout(async () => {
        retryTimer.current[dir] = null;
        if (!micStreamRef.current) return;
        try {
          const handle = await buildSessionForDir(dir);
          sessionsRef.current[dir] = handle;
          const who = activeRef.current;
          handle.setMicEnabled(
            (dir === "AtoB" && who === "A") || (dir === "BtoA" && who === "B"),
          );
          retryCount.current[dir] = 0;
        } catch {
          // onStatus("error") in the new session will trigger another retry
        }
      }, delay);
    },
    [buildSessionForDir, updateAggregateStatus],
  );

  // Wire the ref so buildSessionForDir's onStatus callback can access scheduleReconnect
  useEffect(() => {
    scheduleReconnectRef.current = scheduleReconnect;
  }, [scheduleReconnect]);

  const applyActive = useCallback((who: Speaker) => {
    const { AtoB, BtoA } = sessionsRef.current;
    if (!AtoB || !BtoA) return;
    AtoB.setMicEnabled(who === "A");
    BtoA.setMicEnabled(who === "B");
    activeRef.current = who;
    setActive(who);
  }, []);

  const start = useCallback(
    async ({ langA, langB }: StartArgs) => {
      if (status !== "idle" && status !== "closed" && status !== "error") return;

      setError(null);
      setTranscripts({ AtoB: emptyTranscript(), BtoA: emptyTranscript() });
      setLatency({ AtoB: emptyLatency(), BtoA: emptyLatency() });
      retryCount.current = { AtoB: 0, BtoA: 0 };
      statusRef.current = { AtoB: "connecting", BtoA: "connecting" };
      setStatus("connecting");

      langRef.current = { A: langA, B: langB };

      let micStream: MediaStream;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Microphone permission denied",
        );
        setStatus("error");
        return;
      }
      micStreamRef.current = micStream;

      try {
        const [aToB, bToA] = await Promise.all([
          buildSessionForDir("AtoB"),
          buildSessionForDir("BtoA"),
        ]);
        sessionsRef.current = { AtoB: aToB, BtoA: bToA };
        applyActive("A");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to start");
        setStatus("error");
      }
    },
    [status, buildSessionForDir, applyActive],
  );

  const setSpeaker = useCallback(
    (who: Speaker) => applyActive(who),
    [applyActive],
  );

  const toggleSpeaker = useCallback(() => {
    setActive((prev) => {
      const next: Speaker = prev === "A" ? "B" : "A";
      const { AtoB, BtoA } = sessionsRef.current;
      if (AtoB && BtoA) {
        AtoB.setMicEnabled(next === "A");
        BtoA.setMicEnabled(next === "B");
      }
      activeRef.current = next;
      return next;
    });
  }, []);

  const setVolume = useCallback((dir: Direction, volume: number) => {
    sessionsRef.current[dir]?.setRemoteVolume(volume);
  }, []);

  const stop = useCallback(() => {
    // Cancel any pending reconnect timers
    for (const dir of ["AtoB", "BtoA"] as Direction[]) {
      if (retryTimer.current[dir]) {
        clearTimeout(retryTimer.current[dir]!);
        retryTimer.current[dir] = null;
      }
    }
    sessionsRef.current.AtoB?.close();
    sessionsRef.current.BtoA?.close();
    sessionsRef.current = { AtoB: null, BtoA: null };
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    statusRef.current = { AtoB: "idle", BtoA: "idle" };
    retryCount.current = { AtoB: 0, BtoA: 0 };
    setStatus("idle");
  }, []);

  useEffect(() => {
    return () => {
      for (const dir of ["AtoB", "BtoA"] as Direction[]) {
        if (retryTimer.current[dir]) clearTimeout(retryTimer.current[dir]!);
      }
      sessionsRef.current.AtoB?.close();
      sessionsRef.current.BtoA?.close();
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return {
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
    directionForSpeaker,
  };
}
