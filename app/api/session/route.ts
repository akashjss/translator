import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CLIENT_SECRET_URL =
  "https://api.openai.com/v1/realtime/translations/client_secrets";

const SUPPORTED_OUTPUT_LANGS = new Set([
  "en", "es", "pt", "fr", "de", "it", "ru",
  "ja", "zh", "ko", "hi", "id", "vi",
]);

interface SessionRequest {
  targetLanguage: string;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not set on the server" },
      { status: 500 },
    );
  }

  let body: SessionRequest;
  try {
    body = (await req.json()) as SessionRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const targetLanguage = body.targetLanguage;
  if (!targetLanguage || !SUPPORTED_OUTPUT_LANGS.has(targetLanguage)) {
    return NextResponse.json(
      { error: `Unsupported targetLanguage: ${targetLanguage}` },
      { status: 400 },
    );
  }

  const upstream = await fetch(CLIENT_SECRET_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      session: {
        model: "gpt-realtime-translate",
        input_audio_transcription: { model: "whisper-1" },
        audio: {
          input: {
            noise_reduction: { type: "near_field" },
          },
          output: { language: targetLanguage },
        },
      },
    }),
  });

  const text = await upstream.text();
  if (!upstream.ok) {
    return NextResponse.json(
      {
        error: "Failed to create translation client secret",
        status: upstream.status,
        body: text,
      },
      { status: 502 },
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return NextResponse.json(
      { error: "OpenAI returned non-JSON response", body: text },
      { status: 502 },
    );
  }

  const clientSecret = extractClientSecret(parsed);
  if (!clientSecret) {
    return NextResponse.json(
      {
        error: "OpenAI response did not contain a client secret",
        body: parsed,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ clientSecret });
}

function extractClientSecret(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;

  if (typeof p.client_secret === "string") return p.client_secret;
  if (
    p.client_secret &&
    typeof p.client_secret === "object" &&
    typeof (p.client_secret as Record<string, unknown>).value === "string"
  ) {
    return (p.client_secret as Record<string, unknown>).value as string;
  }
  if (typeof p.value === "string" && (p.value as string).startsWith("ek_")) {
    return p.value as string;
  }
  if (
    p.session &&
    typeof p.session === "object" &&
    typeof (p.session as Record<string, unknown>).client_secret === "string"
  ) {
    return (p.session as Record<string, unknown>).client_secret as string;
  }
  return null;
}
