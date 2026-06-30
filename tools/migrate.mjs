// One-time content migration: parse the legacy built HTML into clean Markdown
// posts that use the `gallery` shortcode. Run with `npm run migrate`.
//
// Output:
//   src/posts/<slug>.md            (15 root posts, tag: post)
//   src/spain/<city>.md            (5 cities, tag: spain)
//   src/french_ski_resorts/<r>.md  (7 resorts, tag: ski)
//
// The two section landings ("Trip to Spain", "Ski Resorts in France") are
// hand-written templates (src/spain.njk, src/ski-resorts.njk), not generated here.

import fs from "node:fs";
import path from "node:path";
import { parse } from "node-html-parser";

const ROOT = process.cwd();

const ROOT_POSTS = [
  "bern-fribourg-murten",
  "flight-to-geneva",
  "foyer-schumann",
  "georgia",
  "hike-to-chalet-de-narderan",
  "ictp",
  "kashmir",
  "lyon-basilica-botanique-jardin",
  "lyon-vintage-shop",
  "marche-de-plainpalais",
  "middle-east",
  "murree",
  "sion-vex",
  "sunrise-choully",
  "visit-to-la-cathedrale-de-lausanne",
];

// Dates are not present in the section sub-pages' HTML, so supply them here.
const SPAIN_DATES = {
  barcelona: "2018-12-16",
  girona: "2018-12-17",
  valencia: "2018-12-18",
  cartagena: "2018-12-19",
  almeria: "2018-12-20",
};
const SKI_DATES = {
  "le-grand-bornand": "2019-01-12",
  "les-gets": "2019-01-19",
  crozet: "2019-01-20",
  "saint-gervais": "2019-01-26",
  "les-contamines": "2019-02-02",
  avoriaz: "2019-02-09",
  "la-clusaz": "2019-02-23",
};

const PROSE_TAGS = new Set(["p", "h2", "h3", "h4", "ul", "ol", "blockquote"]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

/** Trim whitespace/tabs and drop the hard-coded /wanderings prefix. */
function clean(p) {
  return String(p || "")
    .trim()
    .replace(/^\/wanderings(?=\/)/, "");
}

/** Collapse runs of whitespace into single spaces. */
const tidy = (s) => String(s || "").replace(/\s+/g, " ").trim();

/** Clean attribute URLs inside inline prose HTML (strip prefix + trim). */
function cleanInlineHtml(html) {
  return String(html)
    .replace(/(href|src)="([^"]*)"/g, (_m, attr, val) => {
      const v = val.trim().replace(/^\/wanderings(?=\/)/, "");
      return `${attr}="${v}"`;
    })
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

const stripTags = (html) => String(html).replace(/<[^>]+>/g, "");

function truncate(text, max = 180) {
  const t = tidy(text);
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 60 ? cut.slice(0, lastSpace) : cut).replace(/[.,;:]$/, "") + "…";
}

function yamlStr(s) {
  return '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}

/** Walk a post body element into an ordered list of prose/gallery blocks. */
function parseBody(body) {
  const blocks = [];
  let gallery = null;

  const flush = () => {
    if (gallery && gallery.length) blocks.push({ type: "gallery", rows: gallery });
    gallery = null;
  };
  const pushRow = (srcs) => {
    const row = srcs.map(clean).filter(Boolean);
    if (row.length) (gallery ||= []).push(row);
  };

  for (const node of body.childNodes) {
    if (node.nodeType !== 1) continue; // skip text + comment nodes
    const el = node;
    const tag = (el.tagName || "").toLowerCase();
    if (tag === "style" || tag === "script" || tag === "link") continue;

    // System A — photoset rows
    if (el.classList.contains("photoset")) {
      for (const row of el.querySelectorAll(".photoset-row")) {
        pushRow(row.querySelectorAll("figure a").map((a) => a.getAttribute("href")));
      }
      continue;
    }

    // System B — w3 images (rows and single images both match here)
    const w3 = el.querySelectorAll("img.w3-hover-opacity");
    if (w3.length) {
      pushRow(w3.map((i) => i.getAttribute("data-src")));
      continue;
    }

    // Prose
    if (PROSE_TAGS.has(tag)) {
      const text = tidy(el.textContent.replace(/\u00a0/g, " "));
      const imgs = el.querySelectorAll("img");
      if (imgs.length && !text) {
        // image-only paragraph (e.g. an inline SVG) — treat as a gallery row
        pushRow(imgs.map((im) => im.getAttribute("src") || im.getAttribute("data-src")));
        continue;
      }
      if (text) {
        flush();
        blocks.push({ type: "prose", html: cleanInlineHtml(el.innerHTML) });
      }
      continue;
    }
    // everything else (spacers, modals, debug markup) is ignored
  }
  flush();
  return blocks;
}

function blocksToBody(blocks, title) {
  let out = "";
  let gi = 0;
  for (const b of blocks) {
    if (b.type === "prose") {
      out += `\n${b.html}\n`;
    } else {
      gi += 1;
      const rows = b.rows.map((r) => "  " + JSON.stringify(r)).join(",\n");
      out += `\n{% set gallery${gi} = [\n${rows}\n] %}\n{% gallery gallery${gi}, ${JSON.stringify(
        title
      )} %}\n`;
    }
  }
  return out.trim() + "\n";
}

function firstImage(blocks) {
  const g = blocks.find((b) => b.type === "gallery");
  return g ? g.rows[0][0] : "";
}

function firstParagraph(blocks) {
  const p = blocks.find((b) => b.type === "prose");
  return p ? stripTags(p.html) : "";
}

/** Extract per-city hero + summary from the curated spain.html landing cards. */
function parseSpainCards() {
  const map = {};
  const root = parse(read("spain.html"));
  for (const item of root.querySelectorAll(".blog-item")) {
    const a = item.querySelector("a");
    if (!a) continue;
    const city = clean(a.getAttribute("href")).split("/").filter(Boolean).pop();
    const img = item.querySelector("img");
    map[city] = {
      hero: img ? clean(img.getAttribute("src")) : "",
      summary: tidy(item.querySelector(".blog-summary")?.textContent || ""),
    };
  }
  return map;
}

// ---------------------------------------------------------------------------
// Per-file migration
// ---------------------------------------------------------------------------

function migrate({ srcPath, outPath, permalink, tags, dateOverride, heroOverride, summaryOverride }) {
  const root = parse(read(srcPath));
  const article = root.querySelector("article.post");
  if (!article) throw new Error(`no article.post in ${srcPath}`);

  const title = tidy(article.querySelector(".post-title")?.textContent || "");

  let date = dateOverride;
  let tripDate;
  for (const t of article.querySelectorAll("time.post-date")) {
    const dt = (t.getAttribute("datetime") || "").slice(0, 10);
    if (!dt) continue;
    if (/trip/i.test(t.textContent)) tripDate = dt;
    else if (!date) date = dt;
  }

  const location = tidy(article.querySelector(".post-footer-location")?.textContent || "");
  const body = article.querySelector(".post-body, .post-content");
  const blocks = body ? parseBody(body) : [];
  const hero = heroOverride || firstImage(blocks);
  const summary = summaryOverride || truncate(firstParagraph(blocks));

  const fm = ["---", "layout: post.njk", `title: ${yamlStr(title)}`];
  if (date) fm.push(`date: ${date}`);
  if (tripDate) fm.push(`tripDate: ${tripDate}`);
  if (location) fm.push(`location: ${yamlStr(location)}`);
  if (hero) fm.push(`hero: ${yamlStr(hero)}`);
  if (summary) fm.push(`summary: ${yamlStr(summary)}`);
  fm.push(`permalink: ${yamlStr(permalink)}`);
  fm.push(`tags: ${tags}`);
  fm.push("---", "");

  const content = fm.join("\n") + "\n" + blocksToBody(blocks, title);
  fs.mkdirSync(path.dirname(path.join(ROOT, outPath)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, outPath), content);

  const imgCount = blocks
    .filter((b) => b.type === "gallery")
    .reduce((n, b) => n + b.rows.flat().length, 0);
  console.log(`  ${outPath.padEnd(46)} ${date || "(no date)"}  ${imgCount} imgs`);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

console.log("Root posts:");
for (const slug of ROOT_POSTS) {
  migrate({
    srcPath: `${slug}.html`,
    outPath: `src/posts/${slug}.md`,
    permalink: `/${slug}/`,
    tags: "post",
  });
}

console.log("\nSpain cities:");
const spainCards = parseSpainCards();
for (const city of Object.keys(SPAIN_DATES)) {
  migrate({
    srcPath: `spain/${city}.html`,
    outPath: `src/spain/${city}.md`,
    permalink: `/spain/${city}/`,
    tags: "spain",
    dateOverride: SPAIN_DATES[city],
    heroOverride: spainCards[city]?.hero,
    summaryOverride: spainCards[city]?.summary,
  });
}

console.log("\nSki resorts:");
for (const resort of Object.keys(SKI_DATES)) {
  migrate({
    srcPath: `french_ski_resorts/${resort}.html`,
    outPath: `src/french_ski_resorts/${resort}.md`,
    permalink: `/french_ski_resorts/${resort}/`,
    tags: "ski",
    dateOverride: SKI_DATES[resort],
  });
}

console.log("\nDone.");
