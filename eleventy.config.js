import fs from "node:fs";
import path from "node:path";

import { EleventyHtmlBasePlugin } from "@11ty/eleventy";
import { feedPlugin } from "@11ty/eleventy-plugin-rss";
import Image from "@11ty/eleventy-img";
import sharp from "sharp";

// ---------------------------------------------------------------------------
// Image helpers
// ---------------------------------------------------------------------------

const THUMB_OUTPUT_DIR = "./_site/img/thumbs/";
const THUMB_URL_PATH = "/img/thumbs/";
const THUMB_WIDTHS = [400, 800];

/** Trim stray whitespace/tabs (a bug in the legacy markup) and drop any
 * hard-coded `/wanderings` prefix so the HtmlBase plugin can add the right one. */
function cleanSrc(src) {
  return String(src).trim().replace(/^\/wanderings(?=\/)/, "");
}

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Read the on-disk pixel dimensions, honouring EXIF orientation. */
async function originalDimensions(inputPath) {
  try {
    const meta = await sharp(inputPath).metadata();
    let width = meta.width || 1600;
    let height = meta.height || 1200;
    if (meta.orientation && meta.orientation >= 5) {
      [width, height] = [height, width];
    }
    return { width, height };
  } catch {
    return { width: 1600, height: 1200 };
  }
}

async function makeThumbnails(inputPath) {
  const metadata = await Image(inputPath, {
    widths: THUMB_WIDTHS,
    formats: ["webp"],
    outputDir: THUMB_OUTPUT_DIR,
    urlPath: THUMB_URL_PATH,
    sharpOptions: { failOn: "none" },
  });
  return metadata.webp;
}

/** One linked, lazy-loaded thumbnail that opens the full-res original in PhotoSwipe. */
async function galleryItem(src, altText) {
  const cleaned = cleanSrc(src);
  const inputPath = "." + cleaned;
  if (!fs.existsSync(inputPath)) {
    console.warn(`[gallery] missing image, skipping: ${inputPath}`);
    return "";
  }
  try {
    const { width, height } = await originalDimensions(inputPath);
    const thumbs = await makeThumbnails(inputPath);
    const small = thumbs[0];
    const srcset = thumbs.map((t) => `${t.url} ${t.width}w`).join(", ");
    const ar = (width / height || 1).toFixed(4);
    return (
      `<a class="gallery-item" style="--ar:${ar};flex-grow:${ar};flex-basis:calc(${ar} * 16rem)"` +
      ` href="${cleaned}" target="_blank" rel="noopener"` +
      ` data-pswp-width="${width}" data-pswp-height="${height}">` +
      `<img src="${small.url}" srcset="${srcset}" sizes="(max-width: 600px) 100vw, 33vw"` +
      ` width="${small.width}" height="${small.height}" loading="lazy" decoding="async"` +
      ` alt="${escapeAttr(altText)}"></a>`
    );
  } catch (err) {
    console.warn(`[gallery] could not process ${inputPath}: ${err.message}`);
    return "";
  }
}

export default async function (eleventyConfig) {
  // ----- Plugins ----------------------------------------------------------
  eleventyConfig.addPlugin(EleventyHtmlBasePlugin);
  eleventyConfig.addPlugin(feedPlugin, {
    type: "rss",
    outputPath: "/feed.xml",
    collection: { name: "post", limit: 0 },
    metadata: {
      language: "en",
      title: "Wanderings",
      subtitle: "A personal travel photo blog.",
      // Origin only — the plugin adds the `/wanderings/` pathPrefix itself.
      base: "https://adl1995.github.io/",
      author: { name: "adl1995" },
    },
  });

  // ----- Passthrough static assets ---------------------------------------
  eleventyConfig.addPassthroughCopy({
    photos: "photos",
    img: "img",
    "css/main.css": "css/main.css",
    "js/lightbox.mjs": "js/lightbox.mjs",
    "node_modules/photoswipe/dist": "js/photoswipe",
  });

  eleventyConfig.addWatchTarget("./css/");
  eleventyConfig.addWatchTarget("./js/");

  // ----- Shortcodes -------------------------------------------------------
  // {% gallery rows, "Alt prefix" %} — rows is an array of rows, each row an
  // array of image src strings. Produces a PhotoSwipe-enabled grid.
  eleventyConfig.addAsyncShortcode("gallery", async function (rows, altPrefix) {
    if (!rows || !rows.length) return "";
    const prefix = altPrefix || (this.page && this.page.fileSlug) || "Photo";
    let counter = 0;
    let rowsHtml = "";
    for (const row of rows) {
      const items = Array.isArray(row) ? row : [row];
      let rowHtml = "";
      for (const src of items) {
        counter += 1;
        rowHtml += await galleryItem(src, `${prefix} — photo ${counter}`);
      }
      if (rowHtml.trim()) rowsHtml += `<div class="gallery-row">${rowHtml}</div>`;
    }
    // Skip the wrapper entirely when no images resolved (e.g. missing photos).
    if (!rowsHtml) return "";
    return `<div class="gallery">${rowsHtml}</div>`;
  });

  // {% thumb src, "alt", "(sizes)", "css-class" %} — a plain responsive image
  // for cards / hero images (no lightbox).
  eleventyConfig.addAsyncShortcode("thumb", async function (src, alt, sizes, className) {
    const cleaned = cleanSrc(src);
    const altText = escapeAttr(alt || "");
    const cls = className ? ` class="${className}"` : "";
    if (/\.svg$/i.test(cleaned)) {
      return `<img${cls} src="${cleaned}" alt="${altText}" loading="lazy" decoding="async">`;
    }
    const inputPath = "." + cleaned;
    if (!fs.existsSync(inputPath)) {
      console.warn(`[thumb] missing image, skipping: ${inputPath}`);
      return "";
    }
    try {
      const thumbs = await makeThumbnails(inputPath);
      const small = thumbs[0];
      const srcset = thumbs.map((t) => `${t.url} ${t.width}w`).join(", ");
      return (
        `<img${cls} src="${small.url}" srcset="${srcset}"` +
        ` sizes="${sizes || "(max-width: 700px) 100vw, 700px"}"` +
        ` width="${small.width}" height="${small.height}" loading="lazy" decoding="async"` +
        ` alt="${altText}">`
      );
    } catch (err) {
      console.warn(`[thumb] could not process ${inputPath}: ${err.message}`);
      return "";
    }
  });

  // ----- Filters ----------------------------------------------------------
  const readable = new Intl.DateTimeFormat("en", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  eleventyConfig.addFilter("readableDate", (value) => (value ? readable.format(new Date(value)) : ""));
  eleventyConfig.addFilter("htmlDateString", (value) =>
    value ? new Date(value).toISOString() : ""
  );
  eleventyConfig.addFilter("year", (value) => new Date(value).getUTCFullYear());

  // ----- Collections ------------------------------------------------------
  eleventyConfig.addCollection("post", (api) =>
    api.getFilteredByTag("post").sort((a, b) => b.date - a.date)
  );
  eleventyConfig.addCollection("spain", (api) =>
    api.getFilteredByTag("spain").sort((a, b) => a.date - b.date)
  );
  eleventyConfig.addCollection("ski", (api) =>
    api.getFilteredByTag("ski").sort((a, b) => a.date - b.date)
  );

  return {
    dir: {
      input: "src",
      includes: "_includes",
      data: "_data",
      output: "_site",
    },
    pathPrefix: "/wanderings/",
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    templateFormats: ["njk", "md", "11ty.js"],
  };
}
