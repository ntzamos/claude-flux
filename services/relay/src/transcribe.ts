/**
 * Voice Transcription — local whisper.cpp only.
 *
 * Model discovery order:
 *  1. WHISPER_MODEL_PATH env var (if set in Settings)
 *  2. First *.bin file found in /whisper-models/
 *
 * WHISPER_BINARY defaults to "whisper-cpp" (compiled into the relay image).
 */

import { spawn } from "bun";
import { writeFile, readFile, unlink, readdir } from "fs/promises";
import { join } from "path";

const WHISPER_MODELS_DIR = "/whisper-models";

async function findModel(): Promise<string | null> {
  // 1. Explicit env var wins
  const explicit = process.env.WHISPER_MODEL_PATH?.trim();
  if (explicit) return explicit;

  // 2. Auto-discover first .bin in /whisper-models/
  try {
    const entries = await readdir(WHISPER_MODELS_DIR);
    const bin = entries.find(f => f.endsWith(".bin"));
    if (bin) return join(WHISPER_MODELS_DIR, bin);
  } catch {
    // directory doesn't exist or unreadable
  }

  return null;
}

export async function transcribe(audioBuffer: Buffer): Promise<string> {
  const modelPath = await findModel();
  if (!modelPath) return "";
  return transcribeLocal(audioBuffer, modelPath);
}

async function transcribeLocal(audioBuffer: Buffer, modelPath: string): Promise<string> {
  const whisperBinary = process.env.WHISPER_BINARY || "whisper-cpp";
  const timestamp = Date.now();
  const tmpDir = "/tmp";
  const oggPath = join(tmpDir, `voice_${timestamp}.ogg`);
  const wavPath = join(tmpDir, `voice_${timestamp}.wav`);
  const txtPath = join(tmpDir, `voice_${timestamp}.txt`);

  try {
    await writeFile(oggPath, audioBuffer);

    // Convert OGG → WAV (16kHz mono PCM) via ffmpeg
    const ffmpeg = spawn(
      ["ffmpeg", "-i", oggPath, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wavPath, "-y"],
      { stdout: "pipe", stderr: "pipe" }
    );
    if (await ffmpeg.exited !== 0) {
      const stderr = await new Response(ffmpeg.stderr).text();
      throw new Error(`ffmpeg failed: ${stderr}`);
    }

    // Transcribe via whisper.cpp
    const whisper = spawn(
      [whisperBinary, "--model", modelPath, "--file", wavPath,
       "--output-txt", "--output-file", join(tmpDir, `voice_${timestamp}`), "--no-prints"],
      { stdout: "pipe", stderr: "pipe" }
    );
    if (await whisper.exited !== 0) {
      const stderr = await new Response(whisper.stderr).text();
      throw new Error(`whisper-cpp failed: ${stderr}`);
    }

    return (await readFile(txtPath, "utf-8")).trim();
  } finally {
    await unlink(oggPath).catch(() => {});
    await unlink(wavPath).catch(() => {});
    await unlink(txtPath).catch(() => {});
  }
}
