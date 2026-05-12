# Realtime Translator

Two-way conversational translation between two people sharing one laptop mic, powered by OpenAI's `gpt-realtime-translate` over WebRTC.

## How it works

```
Mic ──► [active speaker toggle] ──┬──► PC1 (lang A → lang B) ──► OpenAI ──► translated audio + captions
                                  └──► PC2 (lang B → lang A) ──► OpenAI ──► translated audio + captions
```

- Two `RTCPeerConnection`s stay open for the whole call, one per direction.
- The active-speaker toggle (button or `Space` key) enables the mic track on one peer connection and disables it on the other.
- The Next.js API route at `/api/session` mints a short-lived translation client secret via `https://api.openai.com/v1/realtime/translations/client_secrets`, so your `OPENAI_API_KEY` never reaches the browser. The browser uses that ephemeral secret to POST its SDP offer directly to `https://api.openai.com/v1/realtime/translations/calls`.
- Source-language captions are enabled by configuring `audio.input.transcription = { model: "gpt-realtime-whisper" }` in the client-secret request.

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

## Phone (Phase 2)

The app ships a `manifest.webmanifest`, so once deployed (e.g. `vercel deploy`) you can use Safari/Chrome's "Add to Home Screen" to install it like a native app. iOS Safari requires a user gesture before audio plays — the **Start** button satisfies that.

## Known limitations (v1)

- Single mic, tap-to-swap speakers. No automatic speaker detection.
- Output language is one of 13 supported by `gpt-realtime-translate`: en, es, pt, fr, de, it, ru, ja, zh, ko, hi, id, vi.
- Input language is auto-detected by the model; pinning it is not supported by the API.
- Echo on laptop speakers is mitigated only by browser AEC (`echoCancellation: true`). For best results use headphones or keep speaker volume modest.
- If a speaker accidentally talks in the listener's language, the model may stay silent for that segment (per OpenAI: same-language passthrough).
- No tab/system audio capture, no file upload.
- No reconnect logic — if the connection drops, hit Stop then Start.
- No persistence of transcripts.
