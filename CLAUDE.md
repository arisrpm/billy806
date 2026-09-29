# Billy Crystal 860 — Squarespace build

One-page Squarespace site. Squarespace supplies the page shell, hosting and
section backgrounds; everything structured is custom HTML/CSS/JS reading from
one Google Sheet. Built assets are served to Squarespace from this repo via
jsDelivr.

**Read this before changing anything — several traps below cost real time.**

## Architecture

```
Google Sheet ──► core.js (one batched fetch) ──► header / calendar / creative / faq
                                                          │
                                            main.js starts them all
```

- **`js/core.js`** — the only thing that talks to Google Sheets. Exposes
  `window.BC`: `getSheet`, `getRow`, `esc`, `allowInline`, `normalizeUrl`,
  `bool`, `config`. No DOM.
- **`js/main.js`** — startup only. Warms the fetch, waits for DOM, calls each
  module's `init()` with error isolation. Knows no sheet or markup.
- **Components** — `header`, `calendar`, `creative`, `faq`. Each owns its
  rendering and exposes `window.BC<Name> = { init }`.

Bundle order matters: **core → components → main**. `main.js` is the only file
that acts on evaluation, so it must be last.

## Files

| | |
|---|---|
| `css/`, `js/` | source, edited by hand |
| `dist/bc.min.css`, `dist/bc.min.js` | built output — **committed**, jsDelivr serves these |
| `dev/build.sh` | the build (see below) |
| `dev/serve.py` | local server that sends `no-store` |
| `dev/harness.js` | mock Sheets data + scenarios (not currently wired into index.html) |
| `index.html` | local dev page, loads `css/` and `js/` directly. Never uploaded |
| `squarespace/` | the blocks to paste into Squarespace |

## Build

```bash
./dev/build.sh            # once
./dev/build.sh --watch    # rebuild on save
./dev/build.sh --urls     # print pinned Code Injection lines (after pushing)
```

Concatenates in order, minifies with `npx --yes esbuild` (nothing added to the
repo), and flips `CONFIG.debug` to `false` in the output only.

**Every source file must be listed in `CSS_FILES` / `JS_FILES`.** A file left
out is silently omitted — this happened with `creative`, and the site shipped
without the Creative Team section. `build.sh` now fails loudly if a bundle is
empty, under 2KB, or missing a signature selector or module global.

## Deploying

Squarespace → Settings → Advanced → Code Injection → **HEADER** only.
Full block in `squarespace/code-injection-header.html`.

**Pin to a commit SHA, not `@main`.** jsDelivr caches the branch→commit
resolution for up to 12 hours, and purging the *file* does not refresh that
mapping — a push can appear not to have deployed. `./dev/build.sh --urls`
prints both URLs pinned to `origin/main`.

Keep the CSS and JS URLs on the **same commit**. They have drifted before.

## The Google Sheet

ID is in `js/core.js` → `CONFIG.spreadsheetId`. Tabs and ranges:

| tab | range | |
|---|---|---|
| `Header` | A:D | one config row: CENTER CALL TO ACTION, BUTTON TEXT, BUTTON URL, BUTTON TARGET |
| `Calendar` | A:E | one row per date: DATE (MM/DD/YYYY), MATINEE TIME, MAT BEST AVAILABLE, EVENING TIME, EVE BEST AVAILABLE |
| `FAQs` | A:B | QUESTION, ANSWER |
| `Creative` | A:D | NAME, ROLE, IMG, BIO |

The workbook **must** be shared "Anyone with the link → Viewer" — an API key
cannot read a private sheet. The key is visible to visitors regardless;
restrict it to the Sheets API and this site's referrers, and keep nothing
private in the workbook, since the key grants read access to every tab.

### Links in cells are formatting, not text

A link added with Insert → Link lives in the cell's *format*. `values.batchGet`
returns only the visible text and the URL is lost. Core therefore uses
`spreadsheets.get` with `includeGridData` and a `fields` mask, reads
`textFormatRuns`, and rebuilds links, bold and italic as `row.$html[key]`.
Costs ~0.8KB gzipped over `values.batchGet`, same latency, still one request.

Modules prefer `row.$html?.field` and fall back to the plain value.

## Components

**Header** (`js/header.js`) — `NAV` array at the top is the whole menu. Items
only render if a section with that id exists on the page; skipped ones are
logged. Anchor clicks scroll manually and never write `#id` to the URL. Bar is
`position: sticky`. Markup lives in Code Injection, **not** a Code Block —
a Code Block sits inside a section wrapper where sticky is unreliable.

**Calendar** (`js/calendar.js`) — month grid, one request shared with every
other module, so paging months costs no network. Ticket URLs are built by hand,
not with `URLSearchParams`, which would percent-encode the slashes and colon
Telecharge expects literally. `CONFIG` holds `baseUrl`, `aid` (emitted as both
`AID` and `utm_id`), `utm`, `startYear` / `startMonth`, and `listBelow` — below
that width the grid becomes a date list, because seven columns on a phone give
~50px each.

**Notices** (`css/notices.css`) — static card grid, no JS, no sheet tab. Markup
in `squarespace/code-block-notices.html`. Contains a legacy `.bc-location`
block, superseded but kept until that Code Block is swapped.

**Creative** (`js/creative.js`) — polaroid grid, click opens a `<dialog>`.
Cards with **no bio render as a `<div>`, not a button** — a focusable control
that does nothing is worse than none. Arrows page between people **who have
bios**, non-continuous, in the header row beside the role and name. Name and
role are baked into the card artwork, so `alt` carries both. Bios come from a
typed cell or a Google Doc URL.

**FAQ** (`js/faq.js`) — accordion from the FAQs tab. Flags at the top:
`PANEL_STARTS_OPEN` (true), `PANEL_TOGGLE` (false — buckle click disabled at
the client's request), `ALLOW_MULTIPLE` (false, one answer at a time).

## Traps

Each of these cost time. They are not hypothetical.

1. **`main.css` sets `h1,h2,h3,h4,h5 { color: var(--bc-text) !important }`** to
   beat the Squarespace theme. `!important` beats any specificity, so *any*
   component with an inverted heading must match it. Has bitten the FAQ open
   row and the creative modal name.
2. **Optional chaining does not guard undeclared identifiers.**
   `BCHeader?.init?.()` throws `ReferenceError`; `window.BCHeader?.init?.()`
   is safe. `main.js` looks modules up on `window` by name for this reason.
3. **`position: sticky` dies silently** if any ancestor has `overflow` other
   than `visible`/`clip`. `header.js` warns in dev when it finds one.
   `overflow-x: hidden` also forces `overflow-y: auto` — use `clip`.
   This caught the menu too: a scroll lock of `overflow: hidden` on
   `<html>`/`<body>` killed the sticky header whenever the menu opened, and
   the page showed through above the panel. There is deliberately **no scroll
   lock** — the panel is fixed and opaque, with `overscroll-behavior: contain`
   to stop a touch flick chaining out to the page.
4. **`hyphens: auto` does nothing without `lang` on `<html>`.** Squarespace
   sets it; the dev page sets `lang="en"`.
5. **Google Docs export works from the browser** (CORS is fine), but Docs
   exports emphasis as generated CSS classes, not `<em>`/`<strong>`, and wraps
   links in `google.com/url?q=`. `creative.js` recovers both.
6. **jsDelivr rejects files over 20MB.** Three images in `img/` exceed or
   approach it. Artwork is Squarespace-hosted; `img/` is dev reference only.
   Image URLs in CSS go through tokens (`--bc-hero-image` etc).
7. **`normalizeUrl` accepts** `#anchor`, `/path`, bare hostnames, `http(s)`,
   `mailto:`, `tel:` — and rejects `javascript:`, `data:`, and non-links like
   "TBD". A bare hostname is prefixed with `https://` rather than resolved as a
   path on this site.
8. **`dist/bc.min.css` was once committed at 0 bytes.** The build's verify step
   now prevents it. Do not remove that step.

## State

- Live at `billycrystal860.com` (password-protected during build).
- `js/creative.js` is commented out in `index.html` and has no mount there —
  test the creative module in a scratch harness, not the dev page.
- FAQ buckle toggle disabled; panel always open.
- Modal torn-paper edge was tried and reverted. It needs a **nine-slice
  `border-image`** (one asset, all four edges and corners) to work at variable
  bio heights — a top-only strip leaves a corner step that no CSS fixes.

## Working notes

- Ari pushes; don't run `git push`.
- Compile with `./dev/build.sh` after any `css/` or `js/` change.
- Prefer `position: sticky` over `fixed`; anchors should not write `#id` to the
  address bar.
