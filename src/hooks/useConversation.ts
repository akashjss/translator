"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createTranslationSession,
  type TranslatorHandle,
  type TranslatorStatus,
} from "@/lib/translator";

export interface Transcript {
  sourceFinal: string;
  sourceInterim: string;
  targetFinal: string;
  targetInterim: string;
}

const emptyTranscript = (): Transcript => ({
  sourceFinal: "",
  sourceInterim: "",
  targetFinal: "",
  targetInterim: "",
});

const MAX_RETRIES = 3;

export function useConversation() {
  const [status, setStatus] = useState<TranslatorStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<Transcript>(emptyTranscript());
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const sessionRef = useRef<TranslatorHandle | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const targetLangRef = useRef("en");
  const retryCount = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleReconnectRef = useRef<() => void>(() => {});

  const ensureAudioEl = () => {
    if (typeof window === "undefined") return null;
    if (!audioElRef.current) {
      audioElRef.current = new Audio();
      audioElRef.current.autoplay = true;
    }
    return audioElRef.current;
  };

  const appendSource = useCallback((delta: string) => {
    setTranscript((prev) => ({ ...prev, sourceInterim: prev.sourceInterim + delta }));
  }, []);

  const commitSource = useCallback((text: string) => {
    setTranscript((prev) => ({
      ...prev,
      sourceFinal: (prev.sourceFinal ? prev.sourceFinal + " " : "") + text.trim(),
      sourceInterim: "",
    }));
  }, []);

  const appendTarget = useCallback((delta: string) => {
    setTranscript((prev) => ({ ...prev, targetInterim: prev.targetInterim + delta }));
  }, []);

  const commitTarget = useCallback((text: string) => {
    setTranscript((prev) => ({
      ...prev,
      targetFinal: (prev.targetFinal ? prev.targetFinal + " " : "") + text.trim(),
      targetInterim: "",
    }));
  }, []);

  const buildSession = useCallback(async (): Promise<TranslatorHandle> => {
    const mic = micStreamRef.current;
    if (!mic) throw new Error("No mic stream");
    const audioEl = ensureAudioEl();
    if (!audioEl) throw new Error("Audio element unavailable");

    return createTranslationSession({
      targetLang: targetLangRef.current,
      micStream: mic,
      remoteAudio: audioEl,
      onSourceTranscriptDelta: appendSource,
      onSourceTranscriptDone: commitSource,
      onTargetTranscriptDelta: appendTarget,
      onTargetTranscriptDone: commitTarget,
      onRemoteStream: (stream) => setRemoteStream(stream),
      onStatus: (s) => {
        setStatus(s);
        if (s === "error") scheduleReconnectRef.current();
      },
      onError: (e) => {
        setError(e instanceof Error ? e.message : "Translation session error");
      },
    });
  }, [appendSource, commitSource, appendTarget, commitTarget]);

  const scheduleReconnect = useCallback(() => {
    if (!micStreamRef.current) return;
    if (retryCount.current >= MAX_RETRIES) {
      setStatus("unavailable");
      return;
    }
    retryCount.current += 1;
    setStatus("reconnecting");
    const delay = Math.pow(2, retryCount.current - 1) * 1_000;
    retryTimer.current = setTimeout(async () => {
      retryTimer.current = null;
      if (!micStreamRef.current) return;
      try {
        const handle = await buildSession();
        sessionRef.current = handle;
        handle.setMicEnabled(true);
        retryCount.current = 0;
      } catch {
        // next onStatus("error") will trigger another retry
      }
    }, delay);
  }, [buildSession]);

  useEffect(() => {
    scheduleReconnectRef.current = scheduleReconnect;
  }, [scheduleReconnect]);

  const start = useCallback(
    async (targetLang: string) => {
      setError(null);
      setTranscript(emptyTranscript());
      setRemoteStream(null);
      retryCount.current = 0;
      targetLangRef.current = targetLang;
      setStatus("connecting");

      let mic: MediaStream;
      try {
        mic = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Microphone permission denied");
        setStatus("error");
        return;
      }

      micStreamRef.current = mic;
      setMicStream(mic);

      try {
        const handle = await buildSession();
        sessionRef.current = handle;
        handle.setMicEnabled(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to start session");
        setStatus("error");
      }
    },
    [buildSession],
  );

  const stop = useCallback(() => {
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
    sessionRef.current?.close();
    sessionRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    retryCount.current = 0;
    setMicStream(null);
    setRemoteStream(null);
    setStatus("idle");
  }, []);

  const setVolume = useCallback((v: number) => {
    sessionRef.current?.setRemoteVolume(v);
  }, []);

  useEffect(() => {
    return () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
      sessionRef.current?.close();
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return { status, error, transcript, micStream, remoteStream, start, stop, setVolume };
}
