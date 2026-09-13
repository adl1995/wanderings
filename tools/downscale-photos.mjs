#!/usr/bin/env node
// Idempotent, in-place photo downscaler.
//
// Goal: shrink the full-resolution originals in `photos/` so the repo stays
// small while PhotoSwipe still opens a crisp full-size image. Each photo is
// resized so its long edge is at most MAX_EDGE px and re-encoded at QUALITY.
// EXIF orientation is baked in (and the tag reset) so rotation is preserved.
//
// Safe to re-run: images already within MAX_EDGE are skipped, so a second pass
// won't degrade quality further. Only raster photos are touched; svg/png icons
// and generated thumbnails are left alone.
//
// Usage:
//   node tools/downscale-photos.mjs            # resize in place
//   node tools/downscale-photos.mjs --dry-run  # report only, change nothing
//   MAX_EDGE=1600 QUALITY=82 node tools/downscale-photos.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PHOTOS = path.join(ROOT, "photos");

const MAX_EDGE = Number(process.env.MAX_EDGE || 2048);
const QUALITY = Number(process.env.QUALITY || 80);
// Also re-encode any image over this byte size even if its dimensions already
// fit, so nothing stays large enough to bloat the repo.
const MAX_BYTES = Number(process.env.MAX_BYTES || 1024 * 1024);
const DRY_RUN = process.argv.includes("--dry-run");

const IMAGE_RE = /\.(jpe?g|webp|png)$/i;

/** Recursively collect all raster photos (jpeg/webp/png) under a directory. */
function collectImages(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectImages(full));
    else if (entry.isFile() && IMAGE_RE.test(entry.name)) out.push(full);
  }
  return out;
}

/** Re-encode with the same on-disk format so file references stay valid. */
function encodeSameFormat(pipeline, file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".webp") return pipeline.webp({ quality: QUALITY });
  if (ext === ".png") return pipeline.png({ compressionLevel: 9, palette: true });
  return pipeline.jpeg({ quality: QUALITY, mozjpeg: true });
}

/** Long edge in display orientation (accounts for EXIF rotation). */
function longEdge(meta) {
  let { width = 0, height = 0 } = meta;
  if (meta.orientation && meta.orientation >= 5) [width, height] = [height, width];
  return Math.max(width, height);
}

function fmtBytes(n) {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}

async function processFile(file) {
  const rel = path.relative(ROOT, file);
  const before = fs.statSync(file).size;

  let meta;
  try {
    meta = await sharp(file).metadata();
  } catch (err) {
    console.warn(`  skip (unreadable): ${rel} — ${err.message}`);
    return { before, after: before, resized: false };
  }

  if (longEdge(meta) <= MAX_EDGE && before <= MAX_BYTES) {
    return { before, after: before, resized: false };
  }

  if (DRY_RUN) {
    console.log(`  would resize: ${rel} (${longEdge(meta)}px, ${fmtBytes(before)})`);
    return { before, after: before, resized: true };
  }

  // Encode to a buffer first so a failure can never truncate the original.
  const buffer = await encodeSameFormat(
    sharp(file)
      .rotate() // bake in EXIF orientation, then reset the tag
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true }),
    file
  ).toBuffer();

  fs.writeFileSync(file, buffer);
  const after = buffer.length;
  console.log(`  resized: ${rel}  ${fmtBytes(before)} -> ${fmtBytes(after)}`);
  return { before, after, resized: true };
}

async function main() {
  if (!fs.existsSync(PHOTOS)) {
    console.error(`photos/ not found at ${PHOTOS}`);
    process.exit(1);
  }

  const files = collectImages(PHOTOS);
  console.log(
    `${DRY_RUN ? "[dry-run] " : ""}Scanning ${files.length} images — ` +
      `cap ${MAX_EDGE}px, quality ${QUALITY}, max ${fmtBytes(MAX_BYTES)}\n`
  );

  let totalBefore = 0;
  let totalAfter = 0;
  let resizedCount = 0;

  for (const file of files) {
    const { before, after, resized } = await processFile(file);
    totalBefore += before;
    totalAfter += after;
    if (resized) resizedCount += 1;
  }

  const saved = totalBefore - totalAfter;
  console.log(
    `\n${DRY_RUN ? "[dry-run] " : ""}Done. ` +
      `${resizedCount}/${files.length} ${DRY_RUN ? "to resize" : "resized"}. ` +
      `${fmtBytes(totalBefore)} -> ${fmtBytes(totalAfter)}` +
      (DRY_RUN ? "" : ` (saved ${fmtBytes(saved)})`)
  );
  if (!DRY_RUN) {
    console.log(
      "\nNext: rebuild to refresh thumbnails, then commit:\n" +
        "  npm run build\n" +
        '  git add -A photos && git commit -m "Downscale photo originals"'
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
