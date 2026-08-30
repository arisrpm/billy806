# Billy Crystal 860 --- Squarespace Project Notes

## Project Overview

This is a custom one-page Squarespace build. Squarespace will primarily
provide the page shell, hosting, and basic section layout, while
structured and dynamic components will be handled with custom HTML, CSS,
JavaScript, and Google Sheets.

The goal is to keep the Squarespace implementation minimal,
maintainable, fast-loading, and easy for the client to update.

## Architecture

### Squarespace

Use Squarespace for:

-   Page/section structure
-   Hero and straightforward static content
-   Images and other simple content blocks
-   Footer/static content where appropriate
-   Code Blocks that act as mounting points for custom components

Avoid relying heavily on native Squarespace components for structured
interfaces that are easier to control ourselves.

### Custom Components

Expected custom components include:

-   Header / navigation
-   Calendar
-   FAQs
-   Creative Team
-   Additional credits or other structured content as needed

Example Code Block mounting points:

``` html
<div id="bc-calendar"></div>
<div id="bc-faq"></div>
<div id="bc-creative"></div>
```

## Custom Header

Because the site is a one-pager, the plan is to avoid the native
Squarespace header and build a custom header in a Code Block.

The header design currently includes:

-   Hamburger/menu control
-   Center call-to-action text
-   Ticket CTA button/link

The center CTA is plain text and may change over time.

The button text, URL, and target may also change and will be controlled
through Google Sheets.

Navigation can use same-page anchors for sections such as:

-   About
-   Calendar
-   Tickets
-   Creative Team
-   FAQ

## Google Sheets

Use one Google Sheets workbook as a lightweight content-management
source.

Current tabs:

### Header

One active configuration row.

Columns:

  Column                  Purpose
  ----------------------- --------------------------
  CENTER CALL TO ACTION   Plain center header text
  BUTTON TEXT             CTA button label
  BUTTON URL              CTA destination
  BUTTON TARGET           Link behavior

Expected target logic:

-   `None` → open normally in the same window
-   `Blank` → open in a new tab/window using `target="_blank"` and
    `rel="noopener noreferrer"`
-   Missing button text or URL → do not render the button
-   Missing center CTA → do not render center text

### Calendar

Columns:

  Column               Purpose
  -------------------- --------------------------------
  DATE                 Performance date
  MATINEE TIME         Matinee performance time
  MAT BEST AVAILABLE   Matinee best-availability flag
  EVENING TIME         Evening performance time
  EVE BEST AVAILABLE   Evening best-availability flag

Calendar behavior:

-   No selected time means no performance is displayed for that slot.
-   Matinee and evening performances are independent.
-   Best Available can be independently enabled for each performance.
-   Times should use controlled dropdown values rather than free-form
    text.
-   Sheet row/date order should drive calendar order unless requirements
    change.

Initial run planning discussed: October 1, 2026 + 14 weeks = January 7,
2027.

### FAQs

Columns:

  Column     Purpose
  ---------- --------------
  QUESTION   FAQ question
  ANSWER     FAQ answer

FAQ behavior:

-   Row order determines display order.
-   Render as a custom accessible accordion.
-   Keep the sheet simple unless future requirements justify additional
    fields.

## Git Repository Structure

Keep source files modular during development.

``` text
project/
├── css/
│   ├── main.css
│   ├── header.css
│   ├── calendar.css
│   ├── faq.css
│   └── creative.css
│
├── js/
│   ├── main.js
│   ├── core.js
│   ├── header.js
│   ├── calendar.js
│   ├── faq.js
│   └── creative.js
│
└── dist/
    ├── bc.min.css
    └── bc.min.js
```

Names can be adjusted once the final repository naming convention is
established.

### Core JS

The shared/core layer should own reusable functionality such as:

-   Google Sheets API requests
-   Spreadsheet configuration
-   Data normalization
-   URL validation
-   HTML/data safety helpers
-   Shared error handling
-   Common utilities needed by multiple modules

Individual component files should focus on their own rendering and
interaction logic.

## Production Asset Strategy

Performance is the priority.

Do **not** make visitors load every source module independently.

The production site should consume:

-   One bundled/minified CSS file
-   One bundled/minified JavaScript file

This provides modular source code for development while minimizing
browser requests in production.

Example Squarespace injection:

``` html
<link
  rel="stylesheet"
  href="https://cdn.jsdelivr.net/gh/OWNER/REPO@VERSION/dist/bc.min.css"
>

<script
  defer
  src="https://cdn.jsdelivr.net/gh/OWNER/REPO@VERSION/dist/bc.min.js"
></script>
```

Using `defer` allows the page HTML to parse without the custom
JavaScript blocking initial rendering.

## Development and Caching Strategy

### During Active Development

Use the `main` branch plus a cache-busting query parameter:

``` html
<link
  rel="stylesheet"
  href="https://cdn.jsdelivr.net/gh/OWNER/REPO@main/dist/bc.min.css?v=1"
>

<script
  defer
  src="https://cdn.jsdelivr.net/gh/OWNER/REPO@main/dist/bc.min.js?v=1"
></script>
```

When CDN/browser caching prevents a new build from appearing
immediately, increment the version:

``` text
?v=1
?v=2
?v=3
```

This keeps development quick without requiring Squarespace URLs to be
replaced after every commit.

### Production / Launch

At launch, replace `@main` with a specific Git commit hash:

``` text
@8f29abc/dist/bc.min.css
@8f29abc/dist/bc.min.js
```

Benefits:

-   Immutable production assets
-   Aggressive browser/CDN caching
-   Predictable deployments
-   No accidental changes from future commits
-   Easy rollback by restoring a previous commit hash

## Performance Priorities

1.  Keep Squarespace blocks minimal.
2.  Bundle custom CSS into one production file.
3.  Bundle custom JS into one production file.
4.  Load JavaScript with `defer`.
5.  Pin production assets to a Git commit.
6.  Fetch only the Google Sheets data each component actually needs.
7.  Avoid unnecessary third-party libraries.
8.  Prevent visible layout shifts while Google Sheets data loads.
9.  Keep component markup and rendering lightweight.
10. Use client-editable Sheet fields only where content genuinely needs
    ongoing updates.

## Current Direction

The working architecture is:

``` text
Squarespace
    ↓
One-page shell + Code Block mount points
    ↓
bc.min.css + bc.min.js
    ↓
Shared Core
    ↓
Header / Calendar / FAQ / Creative / Other Modules
    ↓
Google Sheets Workbook
```

This gives the project a custom frontend architecture without giving up
Squarespace's convenience for hosting and basic page management.

## Current Status

-   One-page Squarespace architecture established
-   Custom header approach selected
-   Google Sheets selected as dynamic content source
-   Header Sheet structure established
-   Calendar Sheet structure established
-   FAQ Sheet structure established
-   Git `css` and `js` folders created
-   Modular source + bundled production asset strategy selected
-   Development and production caching strategy established

## Next Steps

1.  Finalize the Google Sheets workbook and remaining tabs.
2.  Establish the repository naming conventions.
3.  Build the shared/core Google Sheets layer.
4.  Build the custom header.
5.  Build the calendar component.
6.  Build the FAQ accordion.
7.  Add additional components as requirements are finalized.
8.  Establish the bundling/minification workflow.
9.  Test responsive behavior and loading performance.
10. Pin final production assets to a launch commit.
