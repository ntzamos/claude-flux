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

export interface ImageResult {
  id: number;
  assessment_id: string;
  side: ImageSide;
  image_path: string;
  clahe_path: string | null;
  annotated_path: string | null;
  detect_result: string | null;
  image_grade: string | null;
  status: "pending" | "processing" | "complete" | "error";
  created_at: Date;
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

export type ValidationResult = "valid" | "wrong_side" | "no_device" | "blurry" | "dirty" | "unclear";

export async function validateImageSide(
  imagePath: string,
  expectedSide: ImageSide,
  callClaudeFn: (prompt: string, opts?: { resume?: boolean }) => Promise<string>
): Promise<ValidationResult> {
  const sideLabel = expectedSide === "frame" ? "sides/edges/frame" : expectedSide;
  const prompt =
    `Look at this image: /files/${imagePath}\n` +
    `I need to verify this is a usable photo of the ${sideLabel} of a smartphone for grading.\n` +
    `Reply with exactly one word from this list: valid, wrong_side, no_device, blurry, dirty.\n` +
    `- valid: clearly shows the ${sideLabel} of a phone, in focus, surface visible\n` +
    `- wrong_side: shows a different side of the phone (e.g. got back when expecting front)\n` +
    `- no_device: no phone visible, or the device is partially out of frame / obstructed\n` +
    `- blurry: image is out of focus, motion-blurred, or too dark to see the surface\n` +
    `- dirty: surface is heavily covered in fingerprints or smudges that obscure the panel\n` +
    `If multiple issues apply, pick the most critical one (blurry > dirty > no_device > wrong_side).`;

  try {
    const result = await callClaudeFn(prompt, { resume: false });
    const normalized = result.trim().toLowerCase().split(/\s/)[0];
    if (normalized === "valid") return "valid";
    if (normalized === "wrong_side") return "wrong_side";
    if (normalized === "no_device") return "no_device";
    if (normalized === "blurry") return "blurry";
    if (normalized === "dirty") return "dirty";
    return "unclear";
  } catch {
    return "unclear";
  }
}

// ============================================================
// IMAGE RESULTS (per-photo detect records)
// ============================================================

export async function getImageResults(assessmentId: string): Promise<ImageResult[]> {
  return (await sql`
    SELECT * FROM device_image_results
    WHERE assessment_id = ${assessmentId}
    ORDER BY side, id
  `) as ImageResult[];
}

// ============================================================
// GRADING RULEBOOK
// ============================================================

export async function getGradingRulebook(): Promise<string> {
  try {
    const rows = await sql`
      SELECT category, rule FROM grading_rulebook
      WHERE active = true
      ORDER BY category, id
    `;
    if (rows.length === 0) return "";
    return rows.map((r: any) => `- [${r.category}] ${r.rule}`).join("\n");
  } catch {
    return "";
  }
}

// ============================================================
// EAGER DETECT — fire immediately after photo accepted
// ============================================================

function extractGrade(text: string): string | null {
  const m =
    text.match(/\bgrade[:\s*]+([ABCD])\b/i) ||
    text.match(/\b([ABCD])\s*[=—]\s*(like new|light|heavy|crack)/i) ||
    text.match(/\boverall[:\s]+([ABCD])\b/i);
  return m ? m[1].toUpperCase() : null;
}

export async function runEagerDetect(
  assessmentId: string,
  side: ImageSide,
  imagePath: string,
  idx: number,
  callClaudeFn: (prompt: string, opts?: { resume?: boolean }) => Promise<string>
): Promise<void> {
  const annotatedPath = `/files/devices/${assessmentId}/annotated_${side}_${idx}.jpg`;
  const clahePath = `/files/devices/${assessmentId}/clahe_${side}_${idx}.jpg`;

  // Reserve a row immediately so the dashboard can show "analyzing…"
  const [row] = await sql`
    INSERT INTO device_image_results
      (assessment_id, side, image_path, clahe_path, annotated_path, status)
    VALUES (${assessmentId}, ${side}, ${imagePath}, ${clahePath}, ${annotatedPath}, 'processing')
    ON CONFLICT (assessment_id, image_path) DO UPDATE SET status = 'processing'
    RETURNING id
  `;
  const resultId = row.id as number;

  const rulebook = await getGradingRulebook();
  const detectPrompt = buildDetectPrompt(imagePath, annotatedPath, clahePath, rulebook);

  try {
    const result = await callClaudeFn(detectPrompt, { resume: false });
    await sql`
      UPDATE device_image_results
      SET detect_result = ${result}, image_grade = ${extractGrade(result)}, status = 'complete'
      WHERE id = ${resultId}
    `;
  } catch (err: any) {
    await sql`
      UPDATE device_image_results
      SET detect_result = ${"Error: " + (err?.message ?? "unknown")}, status = 'error'
      WHERE id = ${resultId}
    `;
  }
}

// ============================================================
// GRADING (synthesise pre-computed per-image results)
// ============================================================

export async function runFullGrading(
  assessment: DeviceAssessment,
  callClaudeFn: (prompt: string, opts?: { resume?: boolean }) => Promise<string>,
  _botToken?: string
): Promise<string> {
  const allImages: Array<{ path: string; side: ImageSide; idx: number }> = [
    ...assessment.front_images.map((p, i) => ({ path: p, side: "front" as ImageSide, idx: i + 1 })),
    ...assessment.back_images.map((p, i) => ({ path: p, side: "back" as ImageSide, idx: i + 1 })),
    ...assessment.frame_images.map((p, i) => ({ path: p, side: "frame" as ImageSide, idx: i + 1 })),
  ];

  if (allImages.length === 0) {
    return "No images found to grade.";
  }

  // Use pre-computed results where available; run detect for any gaps
  const precomputed = await getImageResults(assessment.id);
  const preMap = new Map(precomputed.map(r => [r.image_path, r]));
  const rulebook = await getGradingRulebook();

  const detectResults = await Promise.all(
    allImages.map(async ({ path, side, idx }) => {
      const pre = preMap.get(path);
      if (pre && pre.status === "complete" && pre.detect_result) {
        return { side, idx, result: pre.detect_result };
      }
      // Not yet pre-computed — run now and save
      const annotatedPath = `/files/devices/${assessment.id}/annotated_${side}_${idx}.jpg`;
      const clahePath = `/files/devices/${assessment.id}/clahe_${side}_${idx}.jpg`;
      const detectPrompt = buildDetectPrompt(path, annotatedPath, clahePath, rulebook);
      try {
        const result = await callClaudeFn(detectPrompt, { resume: false });
        const grade = extractGrade(result);
        await sql`
          INSERT INTO device_image_results
            (assessment_id, side, image_path, clahe_path, annotated_path, detect_result, image_grade, status)
          VALUES (${assessment.id}, ${side}, ${path}, ${clahePath}, ${annotatedPath}, ${result}, ${grade}, 'complete')
          ON CONFLICT (assessment_id, image_path) DO UPDATE
            SET detect_result = EXCLUDED.detect_result, image_grade = EXCLUDED.image_grade,
                clahe_path = EXCLUDED.clahe_path, annotated_path = EXCLUDED.annotated_path,
                status = 'complete'
        `;
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

  const rulebookSection = rulebook
    ? `\n\nGRADING RULEBOOK (apply these when determining the overall grade):\n${rulebook}`
    : "";

  const synthesisPrompt =
    `You are grading a smartphone for resale. Here are the defect analysis results for each photo:\n\n` +
    summaryParts.join("\n\n---\n\n") +
    rulebookSection +
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

function buildDetectPrompt(
  imagePath: string,
  annotatedOutputPath: string,
  clahePath: string,
  rulebook: string
): string {
  const imgPath = `/files/${imagePath}`;
  const rulebookSection = rulebook
    ? `\n\nGRADING RULEBOOK — apply these rules when classifying defects:\n${rulebook}`
    : "";
  return (
    "DEFECT DETECTION TASK:" +
    `\nOriginal image: ${imgPath}` +
    rulebookSection +
    "\n" +
    "\nSTEP 0 — ENHANCE IMAGE FOR INSPECTION:" +
    `\nRun: bun /home/relay/app/actions/clahe.ts ${imgPath} ${clahePath}` +
    `\nThen open ${clahePath} with the Read tool. Use this contrast-enhanced version for your inspection in Step 1.` +
    "\nIf the CLAHE step fails, fall back to the original image." +
    "\n" +
    "\nSTEP 1 — VISUAL INSPECTION (use the CLAHE-enhanced image):" +
    "\n- Analyze only what is visible in this photo. Do not speculate about sides not shown." +
    "\n- Inspect systematically: screen, back panel, each individual camera lens, camera module glass, frame, corners." +
    "\n- CRACK vs SCRATCH distinction (critical):" +
    "\n    Scratches: straight or gently curved, uniform direction, reflect light evenly along their length." +
    "\n    Cracks: branch, change direction, or radiate from a point; one side may catch light differently than the other." +
    "\n    If a mark branches at any point → it is a crack." +
    "\n    A starburst or spider-web pattern → always a crack." +
    "\n    Circular wear around a lens rim → scratch. Radial lines from a point on lens glass → crack." +
    "\n- A cracked lens glass = Grade D regardless of anything else." +
    "\n- List every defect with pixel location (approximate x,y,w,h) before moving on." +
    "\n" +
    "\nSTEP 2 — ANNOTATE WITH SELF-VERIFICATION (mandatory — iterate until accurate):" +
    "\nRun the pre-built annotation script using the ORIGINAL image (not the CLAHE version):" +
    `\n  bun /home/relay/app/actions/annotate.ts ${imgPath} ${annotatedOutputPath} '<defectsJSON>'` +
    "\nWhere <defectsJSON> is a JSON array built from your Step 1 findings, e.g.:" +
    "\n  '[{\"label\":\"scratch\",\"x\":120,\"y\":340,\"w\":90,\"h\":25},{\"label\":\"crack\",\"x\":400,\"y\":200,\"w\":60,\"h\":60}]'" +
    `\nAfter running, open ${annotatedOutputPath} with the Read tool and visually verify:` +
    "\n  - Is each red bounding box correctly placed over its defect?" +
    "\nIf a bbox is off, adjust x/y/w/h and re-run. Repeat up to 4 times until accurate." +
    "\nOnly proceed to Step 3 once all boxes are correctly placed." +
    "\n" +
    "\nSTEP 3 — SEND THE ANNOTATED IMAGE:" +
    `\nRun: bash /home/relay/app/actions/send_file_to_telegram.sh ${annotatedOutputPath}` +
    "\n" +
    "\nSTEP 4 — TEXT REPLY:" +
    "\nReply plain text only: list each defect with location and type (scratch vs crack), then Grade A/B/C/D + one sentence reason." +
    "\nGrading: A=like new, B=one or more light scratches, C=heavy/deep or multiple scratches, D=at least one crack (screen or lens)." +
    `\n\nUser: [Image: ${imgPath}]\n\nRun the defect detection task above.`
  );
}
