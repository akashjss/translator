import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTranslationSession } from "@/lib/translator";
import type { TranslatorStatus } from "@/lib/translator";

// ─── Minimal WebRTC mocks ─────────────────────────────────────────────────────

interface MockDC {
  readyState: string;
  close: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  onopen: (() => void) | null;
  onmessage: ((e: { data: string }) => void) | null;
}

function makeMockDC(): MockDC {
  return { readyState: "open", close: vi.fn(), send: vi.fn(), onopen: null, onmessage: null };
}

type MockPC = {
  connectionState: RTCPeerConnectionState;
  ontrack: ((e: RTCTrackEvent) => void) | null;
  onconnectionstatechange: (() => void) | null;
  addTrack: ReturnType<typeof vi.fn>;
  addTransceiver: ReturnType<typeof vi.fn>;
  createDataChannel: ReturnType<typeof vi.fn>;
  createOffer: ReturnType<typeof vi.fn>;
  setLocalDescription: ReturnType<typeof vi.fn>;
  setRemoteDescription: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
};

function makeMockPC(dc: MockDC): MockPC {
  return {
    connectionState: "connected",
    ontrack: null,
    onconnectionstatechange: null,
    addTrack: vi.fn(),
    addTransceiver: vi.fn(),
    createDataChannel: vi.fn(() => dc),
    createOffer: vi.fn().mockResolvedValue({ sdp: "v=0\r\n", type: "offer" }),
    setLocalDescription: vi.fn().mockResolvedValue(undefined),
    setRemoteDescription: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
  };
}

function makeMockStream() {
  const track = {
    enabled: true,
    stop: vi.fn(),
    clone: vi.fn(function (this: { enabled: boolean; stop: ReturnType<typeof vi.fn> }) {
      return { enabled: true, stop: vi.fn() };
    }),
  };
  return { getAudioTracks: vi.fn(() => [track]) };
}

function makeMockAudio() {
  return {
    srcObject: null,
    autoplay: false,
    volume: 1,
    play: vi.fn().mockResolvedValue(undefined),
  };
}

// Flush all pending microtasks/promise resolutions
const flushMicrotasks = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

// Trigger a data channel message
function emitEvent(dc: MockDC, event: object) {
  dc.onmessage?.({ data: JSON.stringify(event) });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("createTranslationSession", () => {
  let dc: MockDC;
  let pc: MockPC;

  beforeEach(() => {
    vi.useFakeTimers();
    dc = makeMockDC();
    pc = makeMockPC(dc);

    // Must use a regular function (not arrow) so `new RTCPeerConnection()` works
    vi.stubGlobal("RTCPeerConnection", vi.fn(function () { return pc; }));
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ clientSecret: "ek_test" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve("v=0\r\nanswer\r\n"),
        }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function buildHandle(overrides: Parameters<typeof createTranslationSession>[0] = {
    targetLang: "es",
    micStream: makeMockStream() as unknown as MediaStream,
    remoteAudio: makeMockAudio() as unknown as HTMLAudioElement,
  }) {
    const statuses: TranslatorStatus[] = [];
    const handlePromise = createTranslationSession({
      ...overrides,
      onStatus: (s) => { statuses.push(s); overrides.onStatus?.(s); },
    });
    await flushMicrotasks();
    dc.onopen?.();
    return { handle: await handlePromise, statuses };
  }

  describe("status transitions", () => {
    it("goes connecting → live when data channel opens", async () => {
      const { statuses } = await buildHandle();
      expect(statuses).toContain("connecting");
      expect(statuses.at(-1)).toBe("live");
    });

    it("sends session.update to enable input transcription on data channel open", async () => {
      await buildHandle();
      const sentPayloads = dc.send.mock.calls.map((c: [string]) => JSON.parse(c[0]));
      const update = sentPayloads.find(
        (p: { type?: string }) => p.type === "session.update",
      );
      expect(update).toBeDefined();
      expect(update.session.input_audio_transcription).toBeDefined();
    });

    it("goes to error on peer connection failure", async () => {
      const { statuses } = await buildHandle();
      pc.connectionState = "failed";
      pc.onconnectionstatechange?.();
      expect(statuses.at(-1)).toBe("error");
    });

    it("goes to closed when peer connection closes", async () => {
      const { statuses } = await buildHandle();
      pc.connectionState = "closed";
      pc.onconnectionstatechange?.();
      expect(statuses.at(-1)).toBe("closed");
    });
  });

  describe("latency tracking", () => {
    it("reports input latency from mic-enable to first input delta", async () => {
      const latencies: Array<{ ms: number; kind: string }> = [];
      const { handle } = await buildHandle({
        targetLang: "es",
        micStream: makeMockStream() as unknown as MediaStream,
        remoteAudio: makeMockAudio() as unknown as HTMLAudioElement,
        onLatency: (ms, kind) => latencies.push({ ms, kind }),
      });

      handle.setMicEnabled(true);
      vi.advanceTimersByTime(350);
      emitEvent(dc, { type: "session.input_transcript.delta", delta: "Hola" });

      expect(latencies).toHaveLength(1);
      expect(latencies[0].kind).toBe("input");
      expect(latencies[0].ms).toBeGreaterThanOrEqual(350);
    });

    it("reports output latency from mic-enable to first output delta", async () => {
      const latencies: Array<{ ms: number; kind: string }> = [];
      const { handle } = await buildHandle({
        targetLang: "es",
        micStream: makeMockStream() as unknown as MediaStream,
        remoteAudio: makeMockAudio() as unknown as HTMLAudioElement,
        onLatency: (ms, kind) => latencies.push({ ms, kind }),
      });

      handle.setMicEnabled(true);
      vi.advanceTimersByTime(820);
      emitEvent(dc, { type: "session.output_transcript.delta", delta: "Hello" });

      expect(latencies).toHaveLength(1);
      expect(latencies[0].kind).toBe("output");
      expect(latencies[0].ms).toBeGreaterThanOrEqual(820);
    });

    it("reports both input and output latency independently", async () => {
      const latencies: Array<{ ms: number; kind: string }> = [];
      const { handle } = await buildHandle({
        targetLang: "es",
        micStream: makeMockStream() as unknown as MediaStream,
        remoteAudio: makeMockAudio() as unknown as HTMLAudioElement,
        onLatency: (ms, kind) => latencies.push({ ms, kind }),
      });

      handle.setMicEnabled(true);
      vi.advanceTimersByTime(300);
      emitEvent(dc, { type: "session.input_transcript.delta", delta: "Hi" });
      vi.advanceTimersByTime(500);
      emitEvent(dc, { type: "session.output_transcript.delta", delta: "Hola" });

      expect(latencies).toHaveLength(2);
      expect(latencies.map((l) => l.kind)).toEqual(["input", "output"]);
    });

    it("does not double-report latency for subsequent deltas", async () => {
      const latencies: Array<{ kind: string }> = [];
      const { handle } = await buildHandle({
        targetLang: "es",
        micStream: makeMockStream() as unknown as MediaStream,
        remoteAudio: makeMockAudio() as unknown as HTMLAudioElement,
        onLatency: (_ms, kind) => latencies.push({ kind }),
      });

      handle.setMicEnabled(true);
      emitEvent(dc, { type: "session.input_transcript.delta", delta: "A" });
      emitEvent(dc, { type: "session.input_transcript.delta", delta: "B" });
      emitEvent(dc, { type: "session.input_transcript.delta", delta: "C" });

      expect(latencies.filter((l) => l.kind === "input")).toHaveLength(1);
    });

    it("resets latency tracking when mic is toggled off and on", async () => {
      const latencies: Array<{ kind: string }> = [];
      const { handle } = await buildHandle({
        targetLang: "es",
        micStream: makeMockStream() as unknown as MediaStream,
        remoteAudio: makeMockAudio() as unknown as HTMLAudioElement,
        onLatency: (_ms, kind) => latencies.push({ kind }),
      });

      handle.setMicEnabled(true);
      emitEvent(dc, { type: "session.input_transcript.delta", delta: "A" });
      expect(latencies).toHaveLength(1);

      handle.setMicEnabled(false);
      handle.setMicEnabled(true);
      emitEvent(dc, { type: "session.input_transcript.delta", delta: "B" });
      expect(latencies).toHaveLength(2);
    });
  });

  describe("delayed state detection", () => {
    it("emits delayed after 8s of mic activity with no transcript", async () => {
      const { handle, statuses } = await buildHandle();

      handle.setMicEnabled(true);
      vi.advanceTimersByTime(8_000);

      expect(statuses).toContain("delayed");
    });

    it("clears delayed and returns to live when first delta arrives", async () => {
      const { handle, statuses } = await buildHandle();

      handle.setMicEnabled(true);
      vi.advanceTimersByTime(8_000);
      expect(statuses.at(-1)).toBe("delayed");

      emitEvent(dc, { type: "session.input_transcript.delta", delta: "Hi" });
      expect(statuses.at(-1)).toBe("live");
    });

    it("does not emit delayed if transcript arrives before 8s", async () => {
      const { handle, statuses } = await buildHandle();

      handle.setMicEnabled(true);
      vi.advanceTimersByTime(2_000);
      emitEvent(dc, { type: "session.input_transcript.delta", delta: "Hi" });
      vi.advanceTimersByTime(6_000);

      expect(statuses).not.toContain("delayed");
    });

    it("cancels delayed timer when mic is disabled", async () => {
      const { handle, statuses } = await buildHandle();

      handle.setMicEnabled(true);
      vi.advanceTimersByTime(5_000);
      handle.setMicEnabled(false);
      vi.advanceTimersByTime(5_000);

      expect(statuses).not.toContain("delayed");
    });
  });

  describe("transcript events", () => {
    it("fires onSourceTranscriptDelta for input delta events", async () => {
      const deltas: string[] = [];
      const { } = await buildHandle({
        targetLang: "es",
        micStream: makeMockStream() as unknown as MediaStream,
        remoteAudio: makeMockAudio() as unknown as HTMLAudioElement,
        onSourceTranscriptDelta: (d) => deltas.push(d),
      });

      emitEvent(dc, { type: "session.input_transcript.delta", delta: "Hello" });
      emitEvent(dc, { type: "session.input_transcript.delta", delta: " world" });

      expect(deltas).toEqual(["Hello", " world"]);
    });

    it("fires onSourceTranscriptDone for both done event variants", async () => {
      const done: string[] = [];
      await buildHandle({
        targetLang: "es",
        micStream: makeMockStream() as unknown as MediaStream,
        remoteAudio: makeMockAudio() as unknown as HTMLAudioElement,
        onSourceTranscriptDone: (t) => done.push(t),
      });

      emitEvent(dc, { type: "session.input_transcript.done", transcript: "Hello world" });
      emitEvent(dc, { type: "session.input_transcript.completed", transcript: "Buenos días" });

      expect(done).toEqual(["Hello world", "Buenos días"]);
    });

    it("fires onTargetTranscriptDelta for output delta events", async () => {
      const deltas: string[] = [];
      await buildHandle({
        targetLang: "es",
        micStream: makeMockStream() as unknown as MediaStream,
        remoteAudio: makeMockAudio() as unknown as HTMLAudioElement,
        onTargetTranscriptDelta: (d) => deltas.push(d),
      });

      emitEvent(dc, { type: "session.output_transcript.delta", delta: "Hola" });
      emitEvent(dc, { type: "session.output_transcript.delta", delta: " mundo" });

      expect(deltas).toEqual(["Hola", " mundo"]);
    });
  });

  describe("controls", () => {
    it("setRemoteVolume clamps to [0, 1]", async () => {
      const audio = makeMockAudio();
      const { handle } = await buildHandle({
        targetLang: "es",
        micStream: makeMockStream() as unknown as MediaStream,
        remoteAudio: audio as unknown as HTMLAudioElement,
      });

      handle.setRemoteVolume(1.5);
      expect(audio.volume).toBe(1);

      handle.setRemoteVolume(-0.5);
      expect(audio.volume).toBe(0);

      handle.setRemoteVolume(0.7);
      expect(audio.volume).toBeCloseTo(0.7);
    });
  });
});
