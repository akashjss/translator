# Realtime Translator

Two-way conversational translation between two people sharing one laptop mic, powered by OpenAI's `gpt-realtime-translate` over WebRTC.

## How it works

```
Mic ──► [active speaker toggle] ──┬──► PC1 (lang A → lang B) ──► OpenAI ──► translated audio + captions
                                  └──► PC2 (lang B → lang A) ──► OpenAI ──► translated audio + captions
```

- Two `RTCPeerConnection`s stay open for the whole call, one per direction.
- The active-speaker toggle (button or `Space` key) enables the mic track on one peer connection and silences the other (sends zeroed audio so the stream stays continuous).
- The Next.js API route at `/api/session` mints a short-lived translation client secret via `https://api.openai.com/v1/realtime/translations/client_secrets`, so your `OPENAI_API_KEY` never reaches the browser. The browser uses that ephemeral secret to POST its SDP offer directly to `https://api.openai.com/v1/realtime/translations/calls`.
- `gpt-realtime-translate` handles both speech recognition and translation in a single pass — no separate transcription model is needed.

## Features

- **Per-card audio controls** — mute/unmute translated output, volume slider, CC (subtitles) toggle.
- **Latency badges** — each card shows measured input and output latency (mic-enable → first transcript delta) once the session is live.
- **Reconnection** — on connection drop, automatically retries with exponential backoff (1 s → 2 s → 4 s, max 3 attempts). Status pill shows `Reconnecting…` during retries and `Unavailable` when retries are exhausted.
- **Connection states** — `Idle`, `Connecting…`, `Live`, `Reconnecting…`, `Delayed`, `Unavailable`, `Closed`, `Error`.

## Run on your laptop

1. Copy env file and add your key:

   ```bash
   cp .env.local.example .env.local
   # edit .env.local and set OPENAI_API_KEY
   ```

2. Install and run:

   ```bash
   pnpm install
   pnpm dev
   ```

3. Open `http://localhost:3000`, allow microphone access, pick languages, hit **Start**.
4. Tap a speaker card or press `Space` to switch who's talking.

## Tests

```bash
pnpm test          # run once
pnpm test:watch    # watch mode
```

Unit tests cover: status transitions, latency tracking, delayed detection, reconnect backoff, transcript accumulation, and `StatusPill` rendering.

## Phone (Phase 2)

The app ships a `manifest.webmanifest`, so once deployed (e.g. `vercel deploy`) you can use Safari/Chrome's "Add to Home Screen" to install it like a native app. iOS Safari requires a user gesture before audio plays — the **Start** button satisfies that.

## Known limitations (v1)

- Single mic, tap-to-swap speakers. No automatic speaker detection.
- Output language is one of 13 supported by `gpt-realtime-translate`: en, es, pt, fr, de, it, ru, ja, zh, ko, hi, id, vi.
- Input language is auto-detected by the model; pinning it is not supported by the API.
- Echo on laptop speakers is mitigated only by browser AEC (`echoCancellation: true`). For best results use headphones or keep speaker volume modest.
- If a speaker accidentally talks in the listener's language, the model may stay silent for that segment (per OpenAI: same-language passthrough).
- No tab/system audio capture, no file upload.
- No persistence of transcripts.
