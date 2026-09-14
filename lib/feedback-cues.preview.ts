/**
 * Local listen-through for answer feedback cues.
 *
 * Run with: npx tsx lib/feedback-cues.preview.ts
 *
 * Writes short WAVs and plays them with afplay when available.
 * Not imported by the app.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { cueDuration, renderCuePcm } from "@/lib/feedback-cues";
import type { FeedbackCue } from "@/lib/feedback-sound";

const CUES: FeedbackCue[] = ["try-again", "reveal", "success"];
const SAMPLE_RATE = 44100;

function encodeWav(samples: Float32Array, sampleRate: number): Buffer {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i] ?? 0));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }

  return buffer;
}

const dir = join(tmpdir(), "sidequest-feedback-cues");
mkdirSync(dir, { recursive: true });

for (const cue of CUES) {
  const wav = encodeWav(renderCuePcm(cue, SAMPLE_RATE), SAMPLE_RATE);
  const file = join(dir, `${cue}.wav`);
  writeFileSync(file, wav);
  console.log(`${cue}: ${cueDuration(cue).toFixed(2)}s → ${file}`);
  if (process.platform === "darwin") {
    spawnSync("afplay", [file], { stdio: "inherit" });
  }
}
