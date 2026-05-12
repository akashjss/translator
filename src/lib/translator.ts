export type TranslatorStatus =
  | "idle"
  | "connecting"
  | "live"
  | "closed"
  | "error";

export interface TranslatorCallbacks {
  onSourceTranscriptDelta?: (delta: string) => void;
  onSourceTranscriptDone?: (text: string) => void;
  onTargetTranscriptDelta?: (delta: string) => void;
  onTargetTranscriptDone?: (text: string) => void;
  onStatus?: (status: TranslatorStatus) => void;
  onError?: (err: unknown) => void;
}

export interface TranslatorOptions extends TranslatorCallbacks {
  targetLang: string;
  micStream: MediaStream;
  remoteAudio: HTMLAudioElement;
}

export interface TranslatorHandle {
  pc: RTCPeerConnection;
  setMicEnabled: (enabled: boolean) => void;
  setRemoteVolume: (volume: number) => void;
  close: () => void;
}

const SESSION_URL = "/api/session";
const TRANSLATIONS_CALLS_URL =
  "https://api.openai.com/v1/realtime/translations/calls";

async function mintClientSecret(targetLang: string): Promise<string> {
  const res = await fetch(SESSION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetLanguage: targetLang }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to mint client secret (${res.status}): ${err}`);
  }
  const data = (await res.json()) as { clientSecret?: string };
  if (!data.clientSecret) {
    throw new Error("Response missing clientSecret");
  }
  return data.clientSecret;
}

export async function createTranslationSession(
  opts: TranslatorOptions,
): Promise<TranslatorHandle> {
  const {
    targetLang,
    micStream,
    remoteAudio,
    onSourceTranscriptDelta,
    onSourceTranscriptDone,
    onTargetTranscriptDelta,
    onTargetTranscriptDone,
    onStatus,
    onError,
  } = opts;

  const setStatus = (s: TranslatorStatus) => onStatus?.(s);
  setStatus("connecting");

  const pc = new RTCPeerConnection();

  pc.ontrack = (e) => {
    const [stream] = e.streams;
    if (stream) {
      remoteAudio.srcObject = stream;
      remoteAudio.autoplay = true;
      remoteAudio.play().catch(() => {});
    }
  };

  const sourceTrack = micStream.getAudioTracks()[0];
  if (!sourceTrack) throw new Error("No audio track on mic stream");
  const micTrack = sourceTrack.clone();
  micTrack.enabled = false;
  pc.addTrack(micTrack, micStream);

  pc.addTransceiver("audio", { direction: "recvonly" });

  const dc = pc.createDataChannel("oai-events");

  dc.onopen = () => setStatus("live");

  dc.onmessage = (e) => {
    let event: { type?: string; delta?: string; transcript?: string };
    try {
      event = JSON.parse(typeof e.data === "string" ? e.data : "");
    } catch {
      return;
    }
    switch (event.type) {
      case "session.input_transcript.delta":
        if (event.delta) onSourceTranscriptDelta?.(event.delta);
        break;
      case "session.input_transcript.done":
      case "session.input_transcript.completed":
        if (event.transcript) onSourceTranscriptDone?.(event.transcript);
        break;
      case "session.output_transcript.delta":
        if (event.delta) onTargetTranscriptDelta?.(event.delta);
        break;
      case "session.output_transcript.done":
      case "session.output_transcript.completed":
        if (event.transcript) onTargetTranscriptDone?.(event.transcript);
        break;
      case "error":
        onError?.(event);
        break;
    }
  };

  pc.onconnectionstatechange = () => {
    if (
      pc.connectionState === "failed" ||
      pc.connectionState === "disconnected"
    ) {
      setStatus("error");
    } else if (pc.connectionState === "closed") {
      setStatus("closed");
    }
  };

  try {
    const clientSecret = await mintClientSecret(targetLang);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const ans = await fetch(TRANSLATIONS_CALLS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${clientSecret}`,
        "Content-Type": "application/sdp",
      },
      body: offer.sdp ?? "",
    });

    if (!ans.ok) {
      const err = await ans.text();
      throw new Error(`SDP exchange failed (${ans.status}): ${err}`);
    }

    const answerSdp = await ans.text();
    await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
  } catch (err) {
    setStatus("error");
    onError?.(err);
    pc.close();
    throw err;
  }

  return {
    pc,
    setMicEnabled: (enabled: boolean) => {
      micTrack.enabled = enabled;
    },
    setRemoteVolume: (volume: number) => {
      remoteAudio.volume = Math.max(0, Math.min(1, volume));
    },
    close: () => {
      try {
        dc.close();
      } catch {}
      try {
        micTrack.stop();
      } catch {}
      pc.close();
      remoteAudio.srcObject = null;
      setStatus("closed");
    },
  };
}
