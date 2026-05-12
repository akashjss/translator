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
  onLatency?: (ms: number, kind: "input" | "output") => void;
  onError?: (e: unknown) => void;
};

// Capture latest opts per call so tests can trigger callbacks
const capturedOpts: SessionOpts[] = [];
const mockHandle = {
  pc: {} as RTCPeerConnection,
  setMicEnabled: vi.fn(),
  setRemoteVolume: vi.fn(),
  close: vi.fn(),
};

vi.mock("@/lib/translator", () => ({
  createTranslationSession: vi.fn(async (opts: SessionOpts) => {
    capturedOpts.push(opts);
    return { ...mockHandle, setMicEnabled: vi.fn(), close: vi.fn() };
  }),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stubMic() {
  const track = { stop: vi.fn() };
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia: vi.fn().mockResolvedValue({
        getTracks: () => [track],
      }),
    },
  });
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

  async function startConversation() {
    const hook = renderHook(() => useConversation());
    await act(async () => {
      hook.result.current.start({ langA: "en", langB: "es" });
    });
    await act(async () => { await Promise.resolve(); });
    return hook;
  }

  describe("initial state", () => {
    it("starts idle", () => {
      const { result } = renderHook(() => useConversation());
      expect(result.current.status).toBe("idle");
      expect(result.current.active).toBe("A");
      expect(result.current.error).toBeNull();
    });

    it("transcripts start empty", () => {
      const { result } = renderHook(() => useConversation());
      const { AtoB, BtoA } = result.current.transcripts;
      expect(AtoB.sourceFinal).toBe("");
      expect(AtoB.targetFinal).toBe("");
      expect(BtoA.sourceFinal).toBe("");
    });

    it("latency starts null", () => {
      const { result } = renderHook(() => useConversation());
      expect(result.current.latency.AtoB.input).toBeNull();
      expect(result.current.latency.AtoB.output).toBeNull();
    });
  });

  describe("transcript accumulation", () => {
    it("accumulates source interim deltas", async () => {
      const hook = await startConversation();
      const atoBOpts = capturedOpts[0]; // AtoB session

      act(() => {
        atoBOpts.onSourceTranscriptDelta?.("Hello");
        atoBOpts.onSourceTranscriptDelta?.(" world");
      });

      expect(hook.result.current.transcripts.AtoB.sourceInterim).toBe("Hello world");
    });

    it("commits interim to final on done and clears interim", async () => {
      const hook = await startConversation();
      const atoBOpts = capturedOpts[0];

      act(() => {
        atoBOpts.onSourceTranscriptDelta?.("Hello");
        atoBOpts.onSourceTranscriptDone?.("Hello");
      });

      const { AtoB } = hook.result.current.transcripts;
      expect(AtoB.sourceFinal).toBe("Hello");
      expect(AtoB.sourceInterim).toBe("");
    });

    it("joins multiple finalized utterances with a space", async () => {
      const hook = await startConversation();
      const atoBOpts = capturedOpts[0];

      act(() => {
        atoBOpts.onSourceTranscriptDone?.("Hello");
        atoBOpts.onSourceTranscriptDone?.("world");
      });

      expect(hook.result.current.transcripts.AtoB.sourceFinal).toBe("Hello world");
    });

    it("accumulates target interim deltas in BtoA direction", async () => {
      const hook = await startConversation();
      const bToAOpts = capturedOpts[1]; // BtoA session

      act(() => {
        bToAOpts.onTargetTranscriptDelta?.("Hola");
        bToAOpts.onTargetTranscriptDelta?.(" mundo");
      });

      expect(hook.result.current.transcripts.BtoA.targetInterim).toBe("Hola mundo");
    });

    it("resets transcripts on re-start", async () => {
      const hook = await startConversation();
      const atoBOpts = capturedOpts[0];

      act(() => { atoBOpts.onSourceTranscriptDone?.("Hello"); });
      expect(hook.result.current.transcripts.AtoB.sourceFinal).toBe("Hello");

      // Stop and restart
      act(() => { hook.result.current.stop(); });
      await act(async () => { hook.result.current.start({ langA: "en", langB: "es" }); });
      await act(async () => { await Promise.resolve(); });

      expect(hook.result.current.transcripts.AtoB.sourceFinal).toBe("");
    });
  });

  describe("latency state", () => {
    it("updates latency state when onLatency fires", async () => {
      const hook = await startConversation();
      const atoBOpts = capturedOpts[0];

      act(() => { atoBOpts.onLatency?.(340, "input"); });
      expect(hook.result.current.latency.AtoB.input).toBe(340);

      act(() => { atoBOpts.onLatency?.(820, "output"); });
      expect(hook.result.current.latency.AtoB.output).toBe(820);
    });

    it("resets latency to null on re-start", async () => {
      const hook = await startConversation();
      const atoBOpts = capturedOpts[0];
      act(() => { atoBOpts.onLatency?.(400, "input"); });

      act(() => { hook.result.current.stop(); });
      await act(async () => { hook.result.current.start({ langA: "en", langB: "es" }); });
      await act(async () => { await Promise.resolve(); });

      expect(hook.result.current.latency.AtoB.input).toBeNull();
    });
  });

  describe("reconnection", () => {
    it("schedules reconnect with 1s delay on first error", async () => {
      const hook = await startConversation();
      const atoBOpts = capturedOpts[0];

      act(() => { atoBOpts.onStatus?.("error"); });
      expect(hook.result.current.status).toBe("reconnecting");

      // Advance past the 1s backoff — a new session should be created
      await act(async () => { vi.advanceTimersByTime(1_100); });
      await act(async () => { await Promise.resolve(); });

      // capturedOpts now has 3 sessions: AtoB + BtoA initial + 1 AtoB retry
      expect(capturedOpts.length).toBeGreaterThan(2);
    });

    it("goes unavailable after MAX_RETRIES (3) exhausted", async () => {
      const hook = await startConversation();

      // Each act() fires the timer synchronously:
      //   - capturedOpts.push (sync) adds new session opts immediately
      //   - retryCount reset (async, after await) does NOT run between iterations
      // This lets retryCount increment correctly through all 3 retries.

      // Attempt 1: retryCount → 1, fire 1s timer → capturedOpts grows
      act(() => { capturedOpts.at(-1)!.onStatus?.("error"); });
      act(() => { vi.advanceTimersByTime(1_100); });

      // Attempt 2: retryCount → 2, fire 2s timer
      act(() => { capturedOpts.at(-1)!.onStatus?.("error"); });
      act(() => { vi.advanceTimersByTime(2_100); });

      // Attempt 3: retryCount → 3, fire 4s timer
      act(() => { capturedOpts.at(-1)!.onStatus?.("error"); });
      act(() => { vi.advanceTimersByTime(4_100); });

      // 4th error: retryCount = 3 >= MAX_RETRIES → unavailable
      act(() => { capturedOpts.at(-1)!.onStatus?.("error"); });

      expect(hook.result.current.status).toBe("unavailable");
    });

    it("stop() cancels pending reconnect timer", async () => {
      const { createTranslationSession } = await import("@/lib/translator");
      const initialCallCount = vi.mocked(createTranslationSession).mock.calls.length;

      const hook = await startConversation();
      const atoBOpts = capturedOpts[0];

      act(() => { atoBOpts.onStatus?.("error"); });
      expect(hook.result.current.status).toBe("reconnecting");

      act(() => { hook.result.current.stop(); });

      // Advance past retry delay — no new session should be created
      await act(async () => { vi.advanceTimersByTime(2_000); });
      await act(async () => { await Promise.resolve(); });

      const newCalls = vi.mocked(createTranslationSession).mock.calls.length - initialCallCount;
      expect(hook.result.current.status).toBe("idle");
      // Only the initial 2 sessions (AtoB + BtoA), no retry session
      expect(newCalls).toBe(2);
    });
  });

  describe("aggregate status", () => {
    it("is live only when both directions are live", async () => {
      const hook = await startConversation();
      const [atoBOpts, bToAOpts] = capturedOpts;

      act(() => { atoBOpts.onStatus?.("live"); });
      expect(hook.result.current.status).not.toBe("live");

      act(() => { bToAOpts.onStatus?.("live"); });
      expect(hook.result.current.status).toBe("live");
    });

    it("is delayed if either direction is delayed", async () => {
      const hook = await startConversation();
      const [atoBOpts, bToAOpts] = capturedOpts;

      act(() => { atoBOpts.onStatus?.("live"); bToAOpts.onStatus?.("live"); });
      act(() => { atoBOpts.onStatus?.("delayed"); });

      expect(hook.result.current.status).toBe("delayed");
    });

    it("is reconnecting if either direction is reconnecting", async () => {
      const hook = await startConversation();
      const [atoBOpts, bToAOpts] = capturedOpts;

      act(() => { atoBOpts.onStatus?.("live"); bToAOpts.onStatus?.("live"); });
      act(() => { atoBOpts.onStatus?.("error"); });

      expect(hook.result.current.status).toBe("reconnecting");
    });
  });
});
