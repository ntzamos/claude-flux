/**
 * Device Assessment Module
 *
 * Manages multi-step smartphone grading sessions:
 * collect front/back/frame photos → validate each → run /detect in parallel → grade A/B/C/D
 */

import { sql } from "./db.ts";
import { mkdir, writeFile, unlink } from "fs/promises";
import { spawn } from "bun";

// ============================================================
// TYPES
// ============================================================

export type AssessmentStep =
  | "pending_imei"
  | "pending_info"
  | "collecting_front"
  | "collecting_back"
  | "collecting_frame"
  | "processing"
  | "complete"
  | "cancelled";

export type ImageSide = "front" | "back" | "frame";

export interface DeviceAssessment {
  id: string;
  imei: string | null;
  device_info: Record<string, unknown>;
  front_images: string[];
  back_images: string[];
  frame_images: string[];
  grading_result: Record<string, unknown> | null;
  overall_grade: string | null;
  status: AssessmentStep;
  created_at: Date;
  updated_at: Date;
}

export interface AssessmentState {
  chat_id: number;
  assessment_id: string;
  current_step: AssessmentStep;
  updated_at: Date;
}

// ============================================================
// STATE MACHINE
// ============================================================

export async function getAssessmentState(chatId: number): Promise<AssessmentState | null> {
  const rows = await sql`SELECT * FROM device_assessment_state WHERE chat_id = ${chatId}`;
  return rows[0] ?? null;
}

export async function createAssessment(chatId: number): Promise<DeviceAssessment> {
  const [assessment] = await sql`
    INSERT INTO device_assessments DEFAULT VALUES RETURNING *
  `;
  await sql`
    INSERT INTO device_assessment_state (chat_id, assessment_id, current_step)
    VALUES (${chatId}, ${assessment.id}, 'pending_imei')
    ON CONFLICT (chat_id) DO UPDATE
      SET assessment_id = EXCLUDED.assessment_id,
          current_step  = 'pending_imei',
          updated_at    = NOW()
  `;
  return assessment as DeviceAssessment;
}

export async function advanceStep(chatId: number, nextStep: AssessmentStep): Promise<void> {
  const state = await getAssessmentState(chatId);
  if (!state) return;
  await Promise.all([
    sql`UPDATE device_assessment_state
        SET current_step = ${nextStep}, updated_at = NOW()
        WHERE chat_id = ${chatId}`,
    sql`UPDATE device_assessments
        SET status = ${nextStep}, updated_at = NOW()
        WHERE id = ${state.assessment_id}`,
  ]);
}

export async function clearAssessmentState(chatId: number): Promise<void> {
  await sql`DELETE FROM device_assessment_state WHERE chat_id = ${chatId}`;
}

export async function getAssessment(assessmentId: string): Promise<DeviceAssessment | null> {
  const rows = await sql`SELECT * FROM device_assessments WHERE id = ${assessmentId}`;
  return (rows[0] ?? null) as DeviceAssessment | null;
}

export async function listAssessments(limit = 50): Promise<DeviceAssessment[]> {
  return (await sql`
    SELECT * FROM device_assessments
    ORDER BY created_at DESC
    LIMIT ${limit}
  `) as DeviceAssessment[];
}

export async function deleteAssessment(assessmentId: string): Promise<void> {
  await sql`DELETE FROM device_assessments WHERE id = ${assessmentId}`;
  // Files are cleaned up by the caller (server.ts) with rm -rf
}

// ============================================================
// IMAGE STORAGE
// ============================================================

export async function saveDeviceImage(
  assessmentId: string,
  side: ImageSide,
  buffer: ArrayBuffer
): Promise<string> {
  const dir = `/files/devices/${assessmentId}/${side}`;
  await mkdir(dir, { recursive: true });

  // Count existing images to get next number
  let existingCount = 0;
  try {
    const { readdir } = await import("fs/promises");
    const files = await readdir(dir);
    existingCount = files.filter(f => f.endsWith(".jpg")).length;
  } catch {}

  const n = String(existingCount + 1).padStart(3, "0");
  const fileName = `${side}_${n}.jpg`;
  const fullPath = `${dir}/${fileName}`;
  await writeFile(fullPath, Buffer.from(buffer));
  return `devices/${assessmentId}/${side}/${fileName}`;
}

export async function appendImage(
  assessmentId: string,
  side: ImageSide,
  imagePath: string
): Promise<number> {
  let rows;
  if (side === "front") {
    rows = await sql`
      UPDATE device_assessments
      SET front_images = array_append(front_images, ${imagePath}), updated_at = NOW()
      WHERE id = ${assessmentId}
      RETURNING array_length(front_images, 1) AS count
    `;
  } else if (side === "back") {
    rows = await sql`
      UPDATE device_assessments
      SET back_images = array_append(back_images, ${imagePath}), updated_at = NOW()
      WHERE id = ${assessmentId}
      RETURNING array_length(back_images, 1) AS count
    `;
  } else {
    rows = await sql`
      UPDATE device_assessments
      SET frame_images = array_append(frame_images, ${imagePath}), updated_at = NOW()
      WHERE id = ${assessmentId}
      RETURNING array_length(frame_images, 1) AS count
    `;
  }
  return rows[0]?.count ?? 1;
}

export async function removeLastImage(imagePath: string): Promise<void> {
  try {
    await unlink(`/files/${imagePath}`);
  } catch {}
}

// ============================================================
// VALIDATION (lightweight Claude call — no session, no memory)
// ============================================================

export async function validateImageSide(
  imagePath: string,
  expectedSide: ImageSide,
  callClaudeFn: (prompt: string, opts?: { resume?: boolean }) => Promise<string>
): Promise<"valid" | "wrong_side" | "unclear"> {
  const sideLabel = expectedSide === "frame" ? "sides/edges/frame" : expectedSide;
  const prompt =
    `Look at this image: /files/${imagePath}\n` +
    `Is this the ${sideLabel} of a smartphone?\n` +
    `Reply with exactly one word: valid, wrong_side, or unclear.\n` +
    `- valid: it clearly shows the ${sideLabel} of a phone\n` +
    `- wrong_side: it shows a different side of a phone\n` +
    `- unclear: the image is blurry, too dark, or not a phone at all`;

  try {
    const result = await callClaudeFn(prompt, { resume: false });
    const normalized = result.trim().toLowerCase();
    if (normalized.includes("valid") && !normalized.includes("wrong")) return "valid";
    if (normalized.includes("wrong_side") || normalized.includes("wrong side")) return "wrong_side";
    return "unclear";
  } catch {
    return "unclear";
  }
}

// ============================================================
// GRADING (full /detect on all images in parallel)
// ============================================================

export async function runFullGrading(
  assessment: DeviceAssessment,
  callClaudeFn: (prompt: string, opts?: { resume?: boolean }) => Promise<string>,
  botToken: string
): Promise<string> {
  const allImages: Array<{ path: string; side: string; idx: number }> = [
    ...assessment.front_images.map((p, i) => ({ path: p, side: "front", idx: i + 1 })),
    ...assessment.back_images.map((p, i) => ({ path: p, side: "back", idx: i + 1 })),
    ...assessment.frame_images.map((p, i) => ({ path: p, side: "frame", idx: i + 1 })),
  ];

  if (allImages.length === 0) {
    return "No images found to grade.";
  }

  // Run /detect on each image in parallel with unique annotated output paths
  const detectResults = await Promise.all(
    allImages.map(async ({ path, side, idx }) => {
      const annotatedPath = `/files/devices/${assessment.id}/annotated_${side}_${idx}.jpg`;
      const detectPrompt = buildDetectPrompt(path, annotatedPath);
      try {
        const result = await callClaudeFn(detectPrompt, { resume: false });
        // Send annotated image to Telegram if it was created
        try {
          const { exists } = await import("fs");
          if (exists(annotatedPath)) {
            const proc = spawn(["bash", "/home/relay/app/actions/send_file_to_telegram.sh", annotatedPath]);
            await proc.exited;
          }
        } catch {}
        return { side, idx, result };
      } catch (err: any) {
        return { side, idx, result: `Error analyzing ${side} image ${idx}: ${err?.message}` };
      }
    })
  );

  // Synthesize into overall grade
  const summaryParts = detectResults.map(r => `${r.side.toUpperCase()} (photo ${r.idx}):\n${r.result}`);
  const deviceLabel = (assessment.device_info as any)?.description
    ? `Device: ${(assessment.device_info as any).description}` + (assessment.imei ? ` | IMEI: ${assessment.imei}` : "")
    : assessment.imei ? `IMEI: ${assessment.imei}` : "Unknown device";

  const synthesisPrompt =
    `You are grading a smartphone for resale. Here are the defect analysis results for each photo:\n\n` +
    summaryParts.join("\n\n---\n\n") +
    `\n\nBased on all of the above, provide a final grading summary in plain text (no markdown):\n` +
    `1. Overall grade: A, B, C, or D (A=like new, B=light scratches, C=heavy scratches/multiple defects, D=cracked screen or lens)\n` +
    `2. One sentence per side (front/back/frame) summarizing condition\n` +
    `3. Any standout defects worth noting\n` +
    `4. One-line recommendation for resale\n` +
    `Keep it concise and conversational.`;

  let gradeSummary = "";
  let overallGrade = "B";
  try {
    gradeSummary = await callClaudeFn(synthesisPrompt, { resume: false });
    // Extract grade from response
    const gradeMatch = gradeSummary.match(/\bgrade[:\s]+([ABCD])\b/i) ||
                       gradeSummary.match(/\boverall[:\s]+([ABCD])\b/i) ||
                       gradeSummary.match(/\b([ABCD])\s*=\s*(like new|light|heavy|crack)/i);
    if (gradeMatch) overallGrade = gradeMatch[1].toUpperCase();
  } catch {
    gradeSummary = summaryParts.join("\n\n");
  }

  // Save to DB
  const gradingResult = {
    images_analyzed: allImages.length,
    per_image: detectResults.map(r => ({ side: r.side, idx: r.idx, result: r.result })),
    summary: gradeSummary,
  };
  await sql`
    UPDATE device_assessments
    SET grading_result = ${JSON.stringify(gradingResult)},
        overall_grade  = ${overallGrade},
        status         = 'complete',
        updated_at     = NOW()
    WHERE id = ${assessment.id}
  `;

  const header = `Assessment complete — ${deviceLabel}\nAssessment ID: ${assessment.id.slice(0, 8)}\n\n`;
  return header + gradeSummary;
}

// ============================================================
// INTERNAL HELPERS
// ============================================================

function buildDetectPrompt(imagePath: string, annotatedOutputPath: string): string {
  return (
    `/detect /files/${imagePath}\n` +
    `OVERRIDE OUTPUT PATH: Use '${annotatedOutputPath}' instead of '/files/defect-annotated.jpg' as the annotated output path when running annotate.ts.`
  );
}
