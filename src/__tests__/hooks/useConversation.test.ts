import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useConversation } from "@/hooks/useConversation";
import type { TranslatorStatus } from "@/lib/translator";

// ─── Mock translator module ───────────────────────────────────────────────────

type SessionOpts = {
  onStatus?: (s: TranslatorStatus) => void;
  onSourceTranscriptDelta?: (d: string) => void;
  onSourceTranscriptDone?: (t: string) => void;
  onTargetTranscriptDelta?: (d: string) => void;
  onTargetTranscriptDone?: (t: string) => void;
  onRemoteStream?: (s: MediaStream) => void;
  onError?: (e: unknown) => void;
};

const capturedOpts: SessionOpts[] = [];

vi.mock("@/lib/translator", () => ({
  createTranslationSession: vi.fn(async (opts: SessionOpts) => {
    capturedOpts.push(opts);
    return {
      pc: {} as RTCPeerConnection,
      setMicEnabled: vi.fn(),
      setRemoteVolume: vi.fn(),
      getRemoteStream: vi.fn(() => null),
      close: vi.fn(),
    };
  }),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stubMic() {
  const track = { stop: vi.fn() };
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia: vi.fn().mockResolvedValue({
        getTracks: () => [track],
        getAudioTracks: () => [track],
      }),
    },
  });
}

async function startHook(targetLang = "es") {
  const hook = renderHook(() => useConversation());
  await act(async () => { hook.result.current.start(targetLang); });
  await act(async () => { await Promise.resolve(); });
  return hook;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("useConversation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    capturedOpts.length = 0;
    stubMic();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("initial state", () => {
    it("starts idle with empty transcript", () => {
      const { result } = renderHook(() => useConversation());
      expect(result.current.status).toBe("idle");
      expect(result.current.error).toBeNull();
      expect(result.current.transcript.sourceFinal).toBe("");
      expect(result.current.transcript.targetFinal).toBe("");
      expect(result.current.micStream).toBeNull();
      expect(result.current.remoteStream).toBeNull();
    });
  });

  describe("start()", () => {
    it("creates one session with the given targetLang", async () => {
      const { createTranslationSession } = await import("@/lib/translator");
      await startHook("de");
      expect(vi.mocked(createTranslationSession)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(createTranslationSession).mock.calls[0][0].targetLang).toBe("de");
    });

    it("resets transcript on re-start", async () => {
      const hook = await startHook();
      act(() => { capturedOpts[0].onSourceTranscriptDone?.("Hello"); });
      expect(hook.result.current.transcript.sourceFinal).toBe("Hello");

      act(() => { hook.result.current.stop(); });
      await act(async () => { hook.result.current.start("es"); });
      await act(async () => { await Promise.resolve(); });

      expect(hook.result.current.transcript.sourceFinal).toBe("");
    });
  });

  describe("transcript accumulation", () => {
    it("accumulates source interim deltas", async () => {
      const hook = await startHook();
      act(() => {
        capturedOpts[0].onSourceTranscriptDelta?.("Hello");
        capturedOpts[0].onSourceTranscriptDelta?.(" world");
      });
      expect(hook.result.current.transcript.sourceInterim).toBe("Hello world");
    });

    it("commits source interim to final on done and clears interim", async () => {
      const hook = await startHook();
      act(() => {
        capturedOpts[0].onSourceTranscriptDelta?.("Hello");
        capturedOpts[0].onSourceTranscriptDone?.("Hello");
      });
      expect(hook.result.current.transcript.sourceFinal).toBe("Hello");
      expect(hook.result.current.transcript.sourceInterim).toBe("");
    });

    it("joins multiple finalized utterances with a space", async () => {
      const hook = await startHook();
      act(() => {
        capturedOpts[0].onSourceTranscriptDone?.("Hello");
        capturedOpts[0].onSourceTranscriptDone?.("world");
      });
      expect(hook.result.current.transcript.sourceFinal).toBe("Hello world");
    });

    it("accumulates target interim deltas", async () => {
      const hook = await startHook();
      act(() => {
        capturedOpts[0].onTargetTranscriptDelta?.("Hola");
        capturedOpts[0].onTargetTranscriptDelta?.(" mundo");
      });
      expect(hook.result.current.transcript.targetInterim).toBe("Hola mundo");
    });
  });

  describe("reconnection", () => {
    it("schedules reconnect with 1s delay on first error", async () => {
      const { createTranslationSession } = await import("@/lib/translator");
      const before = vi.mocked(createTranslationSession).mock.calls.length;

      const hook = await startHook();
      act(() => { capturedOpts[0].onStatus?.("error"); });
      expect(hook.result.current.status).toBe("reconnecting");

      await act(async () => { vi.advanceTimersByTime(1_100); });
      await act(async () => { await Promise.resolve(); });

      expect(vi.mocked(createTranslationSession).mock.calls.length).toBeGreaterThan(before + 1);
    });

    it("goes unavailable after MAX_RETRIES (3) exhausted", async () => {
      const hook = await startHook();

      act(() => { capturedOpts.at(-1)!.onStatus?.("error"); });
      act(() => { vi.advanceTimersByTime(1_100); });

      act(() => { capturedOpts.at(-1)!.onStatus?.("error"); });
      act(() => { vi.advanceTimersByTime(2_100); });

      act(() => { capturedOpts.at(-1)!.onStatus?.("error"); });
      act(() => { vi.advanceTimersByTime(4_100); });

      act(() => { capturedOpts.at(-1)!.onStatus?.("error"); });

      expect(hook.result.current.status).toBe("unavailable");
    });

    it("stop() cancels pending reconnect timer", async () => {
      const { createTranslationSession } = await import("@/lib/translator");
      const hook = await startHook();
      const before = vi.mocked(createTranslationSession).mock.calls.length;

      act(() => { capturedOpts[0].onStatus?.("error"); });
      act(() => { hook.result.current.stop(); });

      await act(async () => { vi.advanceTimersByTime(2_000); });
      await act(async () => { await Promise.resolve(); });

      expect(hook.result.current.status).toBe("idle");
      expect(vi.mocked(createTranslationSession).mock.calls.length).toBe(before);
    });
  });
});
