# Live Translation Waveform

Real-time speech translation powered by OpenAI's `gpt-realtime-translate` over WebRTC. Speak into your mic in any language — the model auto-detects it and streams translated audio plus live transcripts to the target language of your choice.

Multiple people can speak different languages into the same mic. The model handles language switching mid-stream automatically.

## How it works

```
Mic ──► RTCPeerConnection ──► OpenAI (gpt-realtime-translate)
                                      │
                          ┌───────────┴───────────┐
                    translated audio          transcripts
                    (remote audio track)   (input + output deltas)
```

- One `RTCPeerConnection` per session. Audio flows continuously — silence between phrases is intentional and keeps the stream alive.
- The Next.js API route at `/api/session` mints a short-lived client secret via `POST /v1/realtime/translations/client_secrets`, so your `OPENAI_API_KEY` never reaches the browser. The browser uses that ephemeral key to POST its SDP offer directly to `POST /v1/realtime/translations/calls`.
- `gpt-realtime-translate` handles speech recognition and translation in a single pass — no separate transcription model needed.
- Input language is auto-detected. Output language is configurable.

## Features

- **Live waveform** — input audio visualized above the baseline (cyan), translated output below (dark cyan).
- **Live transcripts** — source and translated text appear side by side as the speaker talks, with interim deltas shown before each sentence commits.
- **Auto language detection** — no need to declare the input language. Works with code-switching (e.g. switching mid-sentence between French and German).
- **Reconnection** — on connection drop, retries with exponential backoff (1 s → 2 s → 4 s, max 3 attempts). Status shows `Reconnecting…` during retries and `Unavailable` when retries are exhausted.
- **Connection states** — `Ready`, `Connecting…`, `Live mode`, `Reconnecting…`, `Delayed`, `Unavailable`, `Session ended`, `Error`.

## Run locally

1. Copy the env file and add your key:

   ```bash
   cp .env.local.example .env.local
   # edit .env.local and set OPENAI_API_KEY
   ```

2. Install and run:

   ```bash
   pnpm install
   pnpm dev
   ```

3. Open `http://localhost:3000`, allow microphone access, pick a target language, and hit **Start session**.

## Tests

```bash
pnpm test          # run once
pnpm test:watch    # watch mode
```

## Known limitations

- Output language must be one of 13 supported by `gpt-realtime-translate`: `en`, `es`, `pt`, `fr`, `de`, `it`, `ru`, `ja`, `zh`, `ko`, `hi`, `id`, `vi`.
- Input language pinning is not supported by the API — auto-detection only.
- Echo on laptop speakers is mitigated by browser AEC (`echoCancellation: true`). Use headphones for best results.
- No tab/system audio capture, no file upload, no transcript persistence.
