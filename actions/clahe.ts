/**
 * Apply CLAHE (Contrast Limited Adaptive Histogram Equalization) to an image.
 * Enhances local contrast to make scratches and cracks more visible for defect detection.
 *
 * Usage:
 *   bun /home/relay/app/actions/clahe.ts <inputPath> <outputPath>
 *
 * Example:
 *   bun clahe.ts /files/photo.jpg /files/photo_clahe.jpg
 */

import sharp from "/home/relay/app/services/relay/node_modules/sharp/lib/index.js";
import { existsSync } from "fs";

const [,, inputPath, outputPath] = process.argv;

if (!inputPath || !outputPath) {
  console.error("Usage: bun clahe.ts <inputPath> <outputPath>");
  process.exit(1);
}

if (!existsSync(inputPath)) {
  console.error(`Input file not found: ${inputPath}`);
  process.exit(1);
}

try {
  await (sharp as any)(inputPath)
    .clahe({ width: 8, height: 8, maxSlope: 3 })
    .jpeg({ quality: 95 })
    .toFile(outputPath);
  console.log(`CLAHE image saved to ${outputPath}`);
} catch (err) {
  console.error(`CLAHE failed: ${err}`);
  process.exit(1);
}
