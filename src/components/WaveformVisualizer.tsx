"use client";

import { useEffect, useRef } from "react";

interface Props {
  inputStream: MediaStream | null;
  outputStream: MediaStream | null;
  isInputActive: boolean;
}

const BAR_COUNT = 64;
const FFT_SIZE = 256;
const INPUT_COLOR = "#06b6d4";
const OUTPUT_COLOR = "#0e7490";
const BASELINE_COLOR = "#e5e7eb";

export function WaveformVisualizer({ inputStream, outputStream, isInputActive }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const connectedInputRef = useRef<MediaStream | null>(null);
  const connectedOutputRef = useRef<MediaStream | null>(null);
  const isInputActiveRef = useRef(isInputActive);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    isInputActiveRef.current = isInputActive;
  }, [isInputActive]);

  const getAudioCtx = () => {
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioContext();
    }
    return audioCtxRef.current;
  };

  useEffect(() => {
    if (!inputStream || connectedInputRef.current === inputStream) return;
    connectedInputRef.current = inputStream;
    const ctx = getAudioCtx();
    const source = ctx.createMediaStreamSource(inputStream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = 0.8;
    source.connect(analyser);
    inputAnalyserRef.current = analyser;
  }, [inputStream]);

  useEffect(() => {
    if (!outputStream || connectedOutputRef.current === outputStream) return;
    connectedOutputRef.current = outputStream;
    const ctx = getAudioCtx();
    const source = ctx.createMediaStreamSource(outputStream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = 0.8;
    source.connect(analyser);
    outputAnalyserRef.current = analyser;
  }, [outputStream]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const ctx2d = canvas.getContext("2d");
      if (!ctx2d) return;

      const W = canvas.width;
      const H = canvas.height;
      const mid = H / 2;
      const gap = 2;
      const barW = Math.max(1, W / BAR_COUNT - gap);
      const bufSize = FFT_SIZE / 2;
      const step = Math.max(1, Math.floor(bufSize / BAR_COUNT));

      ctx2d.clearRect(0, 0, W, H);

      ctx2d.fillStyle = BASELINE_COLOR;
      ctx2d.fillRect(0, mid - 0.5, W, 1);

      if (inputAnalyserRef.current && isInputActiveRef.current) {
        const data = new Uint8Array(bufSize);
        inputAnalyserRef.current.getByteFrequencyData(data);
        ctx2d.fillStyle = INPUT_COLOR;
        for (let i = 0; i < BAR_COUNT; i++) {
          const val = data[i * step] / 255;
          const barH = Math.max(2, val * (mid - 8));
          ctx2d.fillRect(i * (barW + gap), mid - barH, barW, barH);
        }
      }

      if (outputAnalyserRef.current) {
        const data = new Uint8Array(bufSize);
        outputAnalyserRef.current.getByteFrequencyData(data);
        ctx2d.fillStyle = OUTPUT_COLOR;
        for (let i = 0; i < BAR_COUNT; i++) {
          const val = data[i * step] / 255;
          const barH = Math.max(2, val * (mid - 8));
          ctx2d.fillRect(i * (barW + gap), mid + 1, barW, barH);
        }
      }
    };

    draw();

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={160}
      className="w-full"
      style={{ height: "160px", display: "block" }}
    />
  );
}
