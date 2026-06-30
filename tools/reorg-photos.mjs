#!/usr/bin/env node
// One-time, idempotent photo-folder normalisation.
//
// Goal: every photo folder name is clean kebab-case and matches its post slug.
// We strip the inconsistent `DD-MM-YYYY` date suffixes (dates live in post
// front matter) and align `middle-east-sky` with its post slug `middle-east`.
// Folders are moved with `git mv` to preserve history; all references inside
// src/ are rewritten to match. Re-running is safe: already-renamed folders and
// already-updated references are skipped.

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PHOTOS = path.join(ROOT, "photos");
const SRC = path.join(ROOT, "src");

// [from, to] relative to photos/. Filenames inside are left untouched.
const RENAMES = [
  ["bern-fribourg-murten-18-10-2018", "bern-fribourg-murten"],
  ["sion-vex-03-11-2018", "sion-vex"],
  ["middle-east-sky", "middle-east"],
  ["spain/almeria-20-12-2018", "spain/almeria"],
  ["spain/barcelona-16-12-2018", "spain/barcelona"],
  ["spain/cartagena-19-12-2018", "spain/cartagena"],
  ["spain/girona-17-12-2018", "spain/girona"],
  ["spain/valencia-18-12-2018", "spain/valencia"],
];

function gitMove(from, to) {
  const fromAbs = path.join(PHOTOS, from);
  const toAbs = path.join(PHOTOS, to);
  if (!fs.existsSync(fromAbs)) {
    console.log(`  skip (already moved): ${from}`);
    return;
  }
  if (fs.existsSync(toAbs)) {
    console.warn(`  conflict: ${to} already exists, leaving ${from} in place`);
    return;
  }
  try {
    execSync(`git mv "photos/${from}" "photos/${to}"`, { cwd: ROOT, stdio: "pipe" });
  } catch {
    fs.renameSync(fromAbs, toAbs); // fall back when the path isn't tracked yet
  }
  console.log(`  moved: photos/${from} -> photos/${to}`);
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

function rewriteReferences() {
  const tokens = RENAMES.map(([from, to]) => [`/photos/${from}/`, `/photos/${to}/`]);
  let changed = 0;
  for (const file of walk(SRC)) {
    if (!/\.(md|njk)$/.test(file)) continue;
    let text = fs.readFileSync(file, "utf8");
    const before = text;
    for (const [from, to] of tokens) text = text.split(from).join(to);
    if (text !== before) {
      fs.writeFileSync(file, text);
      changed += 1;
      console.log(`  updated refs: ${path.relative(ROOT, file)}`);
    }
  }
  console.log(`References updated in ${changed} file(s).`);
}

console.log("Renaming photo folders…");
for (const [from, to] of RENAMES) gitMove(from, to);
console.log("Rewriting references in src/…");
rewriteReferences();
console.log("Done.");
