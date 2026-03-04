/**
 * Annotate an image with defect bounding boxes and labels.
 *
 * Usage:
 *   bun /home/relay/app/actions/annotate.ts <imagePath> <outputPath> '<defectsJSON>'
 *
 * defectsJSON: JSON array of { label: string, x: number, y: number, w: number, h: number }
 *
 * Example:
 *   bun annotate.ts /tmp/phone.jpg /files/defect-annotated.jpg '[{"label":"scratch","x":100,"y":200,"w":80,"h":30}]'
 */

import { createCanvas, loadImage } from "/home/relay/app/services/relay/node_modules/canvas/index.js";
import { writeFileSync } from "fs";

const [,, imagePath, outputPath, defectsArg] = process.argv;

if (!imagePath || !outputPath || !defectsArg) {
  console.error("Usage: bun annotate.ts <imagePath> <outputPath> '<defectsJSON>'");
  process.exit(1);
}

type Defect = { label: string; x: number; y: number; w: number; h: number };

let defects: Defect[];
try {
  defects = JSON.parse(defectsArg);
} catch {
  console.error("Invalid defects JSON");
  process.exit(1);
}

const img = await loadImage(imagePath);
const canvas = createCanvas(img.width, img.height);
const ctx = canvas.getContext("2d");
ctx.drawImage(img, 0, 0);

for (const d of defects) {
  // Red bounding box
  ctx.strokeStyle = "red";
  ctx.lineWidth = 4;
  ctx.strokeRect(d.x, d.y, d.w, d.h);

  // Label background + text
  ctx.font = "bold 28px sans-serif";
  const textWidth = ctx.measureText(d.label).width;
  const labelX = d.x;
  const labelY = d.y - 34 < 0 ? d.y + d.h + 4 : d.y - 34;

  ctx.fillStyle = "red";
  ctx.fillRect(labelX, labelY, textWidth + 10, 34);

  ctx.fillStyle = "white";
  ctx.fillText(d.label, labelX + 5, labelY + 26);
}

const buf = canvas.toBuffer("image/jpeg", { quality: 0.92 });
writeFileSync(outputPath, buf);
console.log(`Annotated image saved to ${outputPath}`);
