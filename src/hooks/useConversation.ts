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

const emptyTranscript = (): DirectionTranscript => ({
  sourceFinal: "",
  sourceInterim: "",
  targetFinal: "",
  targetInterim: "",
});

interface StartArgs {
  langA: string;
  langB: string;
}

const directionForSpeaker = (s: Speaker): Direction =>
  s === "A" ? "AtoB" : "BtoA";

export function useConversation() {
  const [status, setStatus] = useState<TranslatorStatus>("idle");
  const [active, setActive] = useState<Speaker>("A");
  const [error, setError] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<
    Record<Direction, DirectionTranscript>
  >({ AtoB: emptyTranscript(), BtoA: emptyTranscript() });

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

  const updateAggregateStatus = useCallback(() => {
    const { AtoB: a, BtoA: b } = statusRef.current;
    if (a === "error" || b === "error") setStatus("error");
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

  const applyActive = useCallback((who: Speaker) => {
    const { AtoB, BtoA } = sessionsRef.current;
    if (!AtoB || !BtoA) return;
    AtoB.setMicEnabled(who === "A");
    BtoA.setMicEnabled(who === "B");
    setActive(who);
  }, []);

  const start = useCallback(
    async ({ langA, langB }: StartArgs) => {
      if (status !== "idle" && status !== "closed" && status !== "error") {
        return;
      }
      setError(null);
      setTranscripts({ AtoB: emptyTranscript(), BtoA: emptyTranscript() });
      statusRef.current = { AtoB: "connecting", BtoA: "connecting" };
      setStatus("connecting");

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

      const handleDelta = (
        dir: Direction,
        kind: keyof DirectionTranscript,
        delta: string,
      ) => {
        setTranscripts((prev) => ({
          ...prev,
          [dir]: { ...prev[dir], [kind]: prev[dir][kind] + delta },
        }));
      };
      const commitInterim = (
        dir: Direction,
        text: string,
        isSource: boolean,
      ) => {
        setTranscripts((prev) => {
          const cur = prev[dir];
          const finalKey = isSource ? "sourceFinal" : "targetFinal";
          const interimKey = isSource ? "sourceInterim" : "targetInterim";
          return {
            ...prev,
            [dir]: {
              ...cur,
              [finalKey]:
                (cur[finalKey] ? cur[finalKey] + " " : "") + text.trim(),
              [interimKey]: "",
            },
          };
        });
      };

      const buildSession = async (
        dir: Direction,
        targetLang: string,
      ): Promise<TranslatorHandle> => {
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
          onStatus: (s) => {
            statusRef.current[dir] = s;
            updateAggregateStatus();
          },
          onError: (e) => {
            const msg =
              e instanceof Error ? e.message : "translation session error";
            setError(msg);
          },
        });
      };

      try {
        const [aToB, bToA] = await Promise.all([
          buildSession("AtoB", langB),
          buildSession("BtoA", langA),
        ]);
        sessionsRef.current = { AtoB: aToB, BtoA: bToA };
        applyActive("A");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to start");
        setStatus("error");
      }
    },
    [status, updateAggregateStatus, applyActive],
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
      return next;
    });
  }, []);

  const stop = useCallback(() => {
    sessionsRef.current.AtoB?.close();
    sessionsRef.current.BtoA?.close();
    sessionsRef.current = { AtoB: null, BtoA: null };
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    statusRef.current = { AtoB: "idle", BtoA: "idle" };
    setStatus("idle");
  }, []);

  useEffect(() => {
    return () => {
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
    start,
    stop,
    setSpeaker,
    toggleSpeaker,
    directionForSpeaker,
  };
}
