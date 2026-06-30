# Wanderings

A personal travel photo blog — wanderings around Europe, the Middle East, and
South Asia. Built as a static site with [Eleventy](https://www.11ty.dev/) and
deployed to GitHub Pages at <https://adl1995.github.io/wanderings/>.

## Features

- **Fast galleries** — only lightweight WebP thumbnails are downloaded up front;
  full-resolution originals load on demand when a photo is opened.
- **One lightbox** — [PhotoSwipe](https://photoswipe.com/) v5, with every photo
  in a post grouped into a single swipeable gallery.
- **Responsive** — fluid layout that works from small phones to desktops.
- **RSS feed** at `/feed.xml`.

## Requirements

- Node.js 18 or newer

## Local development

```sh
npm ci          # install dependencies
npm start       # dev server with live reload
```

Then open <http://localhost:8080/wanderings/>.

The first build generates WebP thumbnails for every photo and may take a couple
of minutes; subsequent builds reuse the cached thumbnails and are fast.

## Production build

```sh
npm run build   # outputs the static site to _site/
```

## Project structure

```
src/
  _data/site.json         Site metadata (title, URL, author)
  _includes/              Nunjucks layouts (base, post, pagination)
  index.njk               Home page (paginated post cards)
  spain.njk               "Trip to Spain" landing page
  ski-resorts.njk         "Ski Resorts in France" landing page
  posts/                  Travel posts (Markdown)
  spain/                  Spain city posts
  french_ski_resorts/     French ski resort posts
photos/                   Full-resolution originals (one folder per post)
css/main.css              Single consolidated stylesheet
js/lightbox.mjs           PhotoSwipe initialiser
eleventy.config.js        Eleventy config, gallery/thumbnail shortcodes
tools/                    One-off migration / photo-reorg scripts
```

## Adding a post

1. Create a Markdown file under `src/posts/` (or `src/spain/`,
   `src/french_ski_resorts/`).
2. Add front matter:

   ```yaml
   ---
   layout: post.njk
   title: "My New Trip"
   date: 2024-01-01
   location: "Somewhere, Country"   # optional — adds a map link
   hero: "/photos/my-new-trip/cover.jpg"
   summary: "A short teaser shown on cards and the feed."
   permalink: "/my-new-trip/"
   tags: post
   ---
   ```

3. Drop the photos in `photos/my-new-trip/` and add galleries in the body:

   ```njk
   {% set gallery1 = [
     ["/photos/my-new-trip/a.jpg", "/photos/my-new-trip/b.jpg"],
     ["/photos/my-new-trip/c.jpg"]
   ] %}
   {% gallery gallery1, "My New Trip" %}
   ```

   Each inner array is one row; thumbnails and lightbox dimensions are generated
   automatically. Missing files are skipped with a build warning.

## Deployment

Pushing to `main` triggers the GitHub Actions workflow in
`.github/workflows/deploy.yml`, which builds the site and publishes `_site/` to
GitHub Pages. In the repository settings, set **Pages → Build and deployment →
Source** to **GitHub Actions**.

