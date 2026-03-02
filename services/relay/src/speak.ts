/**
 * ElevenLabs Text-to-Speech
 *
 * Converts text to an OGG Opus audio file suitable for Telegram sendVoice.
 * Requires ffmpeg (already installed) to convert MP3 → OGG.
 */

import { writeFile, unlink } from "fs/promises";
import { spawn } from "bun";

/**
 * Converts `text` to speech and writes an OGG Opus file to `outputPath`.
 * Returns true on success, false if ElevenLabs is not configured or fails.
 */
export async function textToSpeech(text: string, outputPath: string): Promise<boolean> {
  // Read at call time so loadSettings() values are visible
  const API_KEY = process.env.ELEVENLABS_API_KEY || "";
  // Default: Sarah — Mature, Reassuring, Confident
  const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "EXAVITQu4vr4xnSDxMaL";
  if (!API_KEY) return false;

  // ElevenLabs caps input at ~5000 chars for turbo models
  const truncated = text.slice(0, 4500);

  const mp3Path = outputPath.replace(/\.ogg$/, ".mp3");

  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: truncated,
          model_id: "eleven_turbo_v2_5",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!res.ok) {
      const body = await res.text();
      console.error(`[speak] ElevenLabs ${res.status}:`, body);
      return false;
    }

    // Save MP3
    const buffer = await res.arrayBuffer();
    await writeFile(mp3Path, Buffer.from(buffer));

    // Convert MP3 → OGG Opus (required by Telegram sendVoice)
    const proc = spawn(
      ["ffmpeg", "-y", "-i", mp3Path, "-c:a", "libopus", "-b:a", "64k", outputPath],
      { stdout: "pipe", stderr: "pipe" }
    );
    const exitCode = await proc.exited;

    await unlink(mp3Path).catch(() => {});

    if (exitCode !== 0) {
      console.error("[speak] ffmpeg conversion failed");
      return false;
    }

    return true;
  } catch (error) {
    console.error("[speak] textToSpeech error:", error);
    await unlink(mp3Path).catch(() => {});
    return false;
  }
}
