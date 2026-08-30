# Billy Crystal 860 --- Squarespace Project Notes

## Project Overview

This is a custom one-page Squarespace build. Squarespace will primarily
provide the page shell, hosting, and basic section layout, while
structured and dynamic components will be handled with custom HTML, CSS,
JavaScript, and Google Sheets.

The goal is to keep the Squarespace implementation minimal,
maintainable, fast-loading, and easy for the client to update.

------------------------------------------------------------------------

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

------------------------------------------------------------------------

# Google Sheets

Use one Google Sheets workbook as a lightweight CMS, with separate tabs
for each component.

## Header Tab

One active configuration row.

  Column                  Purpose
  ----------------------- --------------------------
  CENTER CALL TO ACTION   Plain center header text
  BUTTON TEXT             CTA button label
  BUTTON URL              CTA destination
  BUTTON TARGET           Link behavior

Expected target logic:

-   `None` → normal same-window link
-   `Blank` → `target="_blank"` with `rel="noopener noreferrer"`
-   Missing button text or URL → do not render button
-   Missing center CTA → do not render center text

## Calendar Tab

  Column               Purpose
  -------------------- --------------------------------
  DATE                 Performance date
  MATINEE TIME         Matinee performance time
  MAT BEST AVAILABLE   Matinee best-availability flag
  EVENING TIME         Evening performance time
  EVE BEST AVAILABLE   Evening best-availability flag

Behavior:

-   No selected time = no performance for that slot.
-   Matinee and evening performances are independent.
-   Best Available can be enabled independently.
-   Use controlled time dropdowns rather than free-form text.
-   Sheet date/row order drives display order unless requirements
    change.

Initial run planning discussed:

**October 1, 2026 + 14 weeks = January 7, 2027.**

## FAQs Tab

  Column     Purpose
  ---------- --------------
  QUESTION   FAQ question
  ANSWER     FAQ answer

Behavior:

-   Row order controls display order.
-   Render as a custom accessible accordion.
-   Keep management fields minimal unless requirements expand.

------------------------------------------------------------------------

# Git Repository Structure

Keep development source modular.

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

The individual source files keep development organized. Squarespace
should ultimately consume only the bundled production assets.

------------------------------------------------------------------------

# JavaScript Architecture

## `core.js`

Shared functionality should live in the core layer so Calendar, FAQ,
Header, Creative, and future components do not duplicate Google Sheets
logic.

Responsibilities can include:

-   Google Sheets API requests
-   Spreadsheet ID/API configuration
-   Data normalization
-   URL validation
-   Safe output helpers
-   Shared error handling
-   Common utility methods

### Example Core Structure

``` js
(() => {
  'use strict';

  const CONFIG = {
    spreadsheetId: 'YOUR_SPREADSHEET_ID',
    apiKey: 'YOUR_API_KEY',
  };

  const getSheet = async sheetName => {
    const range = encodeURIComponent(
      `${sheetName}!A:Z`
    );

    const url =
      `https://sheets.googleapis.com/v4/spreadsheets/` +
      `${CONFIG.spreadsheetId}/values/${range}` +
      `?key=${encodeURIComponent(CONFIG.apiKey)}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Google Sheets request failed: ${response.status}`
      );
    }

    const data = await response.json();

    return data.values || [];
  };

  const isValidUrl = value => {
    try {
      const url = new URL(value);

      return (
        url.protocol === 'http:' ||
        url.protocol === 'https:'
      );
    } catch {
      return false;
    }
  };

  window.BC = {
    getSheet,
    isValidUrl,
  };
})();
```

This is an architectural example; final column parsing can be
centralized here once the workbook is finalized.

------------------------------------------------------------------------

# Header Component

The site is planned without the native Squarespace header. A custom
header will be inserted using a Code Block.

Conceptually:

``` html
<header class="bc-header">

  <button
    class="bc-header__menu"
    type="button"
    aria-label="Open menu"
    aria-expanded="false"
  >
    <span></span>
    <span></span>
    <span></span>
  </button>

  <div class="bc-header__cta"></div>

  <a class="bc-header__tickets" href="#">
    GET TICKETS NOW
  </a>

</header>
```

The center text and ticket button will be populated from the `Header`
Google Sheet tab.

## Example `header.js`

``` js
(() => {
  'use strict';

  const MODULE = '[BC Header]';

  const init = async () => {
    const header =
      document.querySelector('.bc-header');

    if (!header || !window.BC) {
      return;
    }

    const center =
      header.querySelector('.bc-header__cta');

    const button =
      header.querySelector('.bc-header__tickets');

    try {
      const rows =
        await BC.getSheet('Header');

      // Row 1 = headings
      // Row 2 = active header configuration
      const row = rows[1];

      if (!row) {
        return;
      }

      const [
        centerText = '',
        buttonText = '',
        buttonUrl = '',
        buttonTarget = '',
      ] = row;

      if (center) {
        center.textContent =
          String(centerText).trim();

        center.hidden =
          !String(centerText).trim();
      }

      if (button) {
        const text =
          String(buttonText).trim();

        const url =
          String(buttonUrl).trim();

        if (
          !text ||
          !url ||
          !BC.isValidUrl(url)
        ) {
          button.hidden = true;
        } else {
          button.textContent = text;
          button.href = url;
          button.hidden = false;

          if (
            String(buttonTarget)
              .trim()
              .toLowerCase() === 'blank'
          ) {
            button.target = '_blank';
            button.rel =
              'noopener noreferrer';
          } else {
            button.removeAttribute('target');
            button.removeAttribute('rel');
          }
        }
      }
    } catch (error) {
      console.error(
        `${MODULE} Unable to load header.`,
        error
      );
    }
  };

  window.BCHeader = {
    init,
  };
})();
```

------------------------------------------------------------------------

# Calendar Component

Squarespace Code Block:

``` html
<div id="bc-calendar"></div>
```

The Calendar module will fetch the `Calendar` tab and generate the
entire calendar interface.

## Example `calendar.js`

``` js
(() => {
  'use strict';

  const MODULE = '[BC Calendar]';
  const SELECTOR = '#bc-calendar';

  const renderPerformance = (
    time,
    bestAvailable
  ) => {
    if (!String(time || '').trim()) {
      return '';
    }

    const bestClass =
      bestAvailable === true ||
      String(bestAvailable).toUpperCase() === 'TRUE'
        ? ' is-best-available'
        : '';

    return `
      <div class="bc-calendar__performance${bestClass}">
        <span class="bc-calendar__time">
          ${String(time)}
        </span>

        ${
          bestClass
            ? `
              <span class="bc-calendar__best">
                Best Available
              </span>
            `
            : ''
        }
      </div>
    `;
  };

  const init = async () => {
    const container =
      document.querySelector(SELECTOR);

    if (!container || !window.BC) {
      return;
    }

    try {
      const rows =
        await BC.getSheet('Calendar');

      const performances =
        rows
          .slice(1)
          .filter(row => row[0]);

      container.innerHTML =
        performances
          .map(row => {
            const [
              date,
              matineeTime,
              matBest,
              eveningTime,
              eveBest,
            ] = row;

            return `
              <article class="bc-calendar__day">

                <div class="bc-calendar__date">
                  ${date}
                </div>

                ${renderPerformance(
                  matineeTime,
                  matBest
                )}

                ${renderPerformance(
                  eveningTime,
                  eveBest
                )}

              </article>
            `;
          })
          .join('');
    } catch (error) {
      console.error(
        `${MODULE} Unable to load calendar.`,
        error
      );

      container.innerHTML = `
        <p class="bc-calendar__error">
          Performance calendar unavailable.
        </p>
      `;
    }
  };

  window.BCCalendar = {
    init,
  };
})();
```

The final version should use shared safe-output helpers before inserting
Sheet values into generated HTML.

------------------------------------------------------------------------

# FAQ Component

Squarespace Code Block:

``` html
<div id="bc-faq"></div>
```

The FAQ module will generate an accessible accordion from the `FAQs`
tab.

## Example `faq.js`

``` js
(() => {
  'use strict';

  const MODULE = '[BC FAQ]';
  const SELECTOR = '#bc-faq';

  const renderFAQ = (
    question,
    answer,
    index
  ) => {
    const answerId =
      `bc-faq-answer-${index}`;

    return `
      <div class="bc-faq__item">

        <button
          class="bc-faq__question"
          type="button"
          aria-expanded="false"
          aria-controls="${answerId}"
        >
          <span>
            ${question}
          </span>

          <span
            class="bc-faq__icon"
            aria-hidden="true"
          >
            +
          </span>
        </button>

        <div
          class="bc-faq__answer"
          id="${answerId}"
          hidden
        >
          <div class="bc-faq__answer-inner">
            ${answer}
          </div>
        </div>

      </div>
    `;
  };

  const bindEvents = container => {
    container.addEventListener(
      'click',
      event => {
        const button =
          event.target.closest(
            '.bc-faq__question'
          );

        if (!button) {
          return;
        }

        const answerId =
          button.getAttribute(
            'aria-controls'
          );

        const answer =
          document.getElementById(
            answerId
          );

        if (!answer) {
          return;
        }

        const isOpen =
          button.getAttribute(
            'aria-expanded'
          ) === 'true';

        button.setAttribute(
          'aria-expanded',
          String(!isOpen)
        );

        answer.hidden = isOpen;
      }
    );
  };

  const init = async () => {
    const container =
      document.querySelector(SELECTOR);

    if (!container || !window.BC) {
      return;
    }

    try {
      const rows =
        await BC.getSheet('FAQs');

      const faqs =
        rows
          .slice(1)
          .filter(row => row[0]);

      container.innerHTML =
        faqs
          .map((row, index) => {
            const [
              question = '',
              answer = '',
            ] = row;

            return renderFAQ(
              question,
              answer,
              index
            );
          })
          .join('');

      bindEvents(container);
    } catch (error) {
      console.error(
        `${MODULE} Unable to load FAQs.`,
        error
      );
    }
  };

  window.BCFAQ = {
    init,
  };
})();
```

Again, the production implementation should safely escape Sheet values
before inserting them into generated markup.

------------------------------------------------------------------------

# Main JavaScript Entry Point

During development, source modules remain separate.

The final bundled `bc.min.js` will contain Core + Header + Calendar +
FAQ + other modules, but conceptually `main.js` is responsible for
starting them.

## Example `main.js`

``` js
(() => {
  'use strict';

  const init = () => {
    BCHeader?.init?.();
    BCCalendar?.init?.();
    BCFAQ?.init?.();

    console.log(
      '[BC] Site initialized.'
    );
  };

  if (
    document.readyState === 'loading'
  ) {
    document.addEventListener(
      'DOMContentLoaded',
      init,
      {
        once: true,
      }
    );
  } else {
    init();
  }
})();
```

Once bundled, source ordering should ensure `core.js` and component
definitions exist before the main initializer executes.

------------------------------------------------------------------------

# CSS Architecture

Keep component CSS separate while developing:

``` text
css/
├── main.css
├── header.css
├── calendar.css
├── faq.css
└── creative.css
```

The production build combines these into:

``` text
dist/bc.min.css
```

This avoids requiring the browser to discover and download numerous CSS
files.

## Example Base CSS

``` css
:root {
  --bc-text: #000;
  --bc-background: #fff;
  --bc-accent: #000;
  --bc-max-width: 1400px;
}

.bc-header,
#bc-calendar,
#bc-faq,
#bc-creative {
  box-sizing: border-box;
}

.bc-header *,
#bc-calendar *,
#bc-faq *,
#bc-creative * {
  box-sizing: inherit;
}
```

------------------------------------------------------------------------

# Production Asset Strategy

Performance is the priority.

Visitors should not load every source module independently.

The production site should consume:

-   **One bundled/minified CSS file**
-   **One bundled/minified JavaScript file**

Example:

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

`defer` allows Squarespace HTML to parse without the custom JavaScript
blocking the initial page render.

------------------------------------------------------------------------

# Development and Caching Strategy

## During Active Development

Use `@main` with a cache-busting query parameter:

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

When caching prevents a new build from appearing immediately:

``` text
?v=1
?v=2
?v=3
```

This keeps active development quick.

## Production / Launch

Replace `@main` with a specific Git commit hash:

``` html
<link
  rel="stylesheet"
  href="https://cdn.jsdelivr.net/gh/OWNER/REPO@8f29abc/dist/bc.min.css"
>

<script
  defer
  src="https://cdn.jsdelivr.net/gh/OWNER/REPO@8f29abc/dist/bc.min.js"
></script>
```

Benefits:

-   Immutable production assets
-   Aggressive CDN/browser caching
-   Predictable deployments
-   No accidental production changes from later commits
-   Easy rollback to a prior commit

------------------------------------------------------------------------

# Google Sheets API Key

Because Google Sheets data is being requested by browser-side
JavaScript, the API key will be visible to visitors.

The Google Cloud API key should therefore be restricted appropriately:

-   Restrict the key to the Google Sheets API.
-   Restrict browser usage to the production/staging site HTTP referrers
    where practical.
-   Do not treat the frontend API key as a secret.

------------------------------------------------------------------------

# Performance Priorities

1.  Keep Squarespace blocks minimal.
2.  Bundle custom CSS into one production file.
3.  Bundle custom JS into one production file.
4.  Load JavaScript with `defer`.
5.  Pin production assets to a Git commit.
6.  Fetch only the Google Sheets ranges/components actually needed.
7.  Avoid unnecessary third-party libraries.
8.  Prevent visible layout shifts while Google Sheets data loads.
9.  Keep component markup/rendering lightweight.
10. Use client-editable Sheet fields only where ongoing updates are
    genuinely useful.

------------------------------------------------------------------------

# Current Architecture

``` text
Squarespace
    ↓
One-page shell + Code Block mount points
    ↓
bc.min.css + bc.min.js
    ↓
Shared BC Core
    ↓
Header / Calendar / FAQ / Creative / Other Modules
    ↓
Google Sheets Workbook
```

------------------------------------------------------------------------

# Current Status

-   One-page Squarespace architecture established
-   Native Squarespace header expected to be replaced with custom header
-   Google Sheets selected as dynamic content source
-   Header Sheet structure established
-   Calendar Sheet structure established
-   FAQ Sheet structure established
-   Git `css` and `js` folders created
-   Modular source architecture selected
-   Single CSS + single JS production bundle strategy selected
-   Development cache-busting strategy established
-   Production commit-pinning strategy established
-   Initial Core/Header/Calendar/FAQ/Main JS patterns documented

------------------------------------------------------------------------

# Next Steps

1.  Finalize the Google Sheets workbook and remaining tabs.
2.  Confirm final Git repository/file naming.
3.  Add Spreadsheet ID and restricted Google Sheets API key.
4.  Build the real `core.js`.
5.  Build the custom header and navigation.
6.  Build the Calendar renderer.
7.  Build the FAQ accordion.
8.  Add Creative Team and other dynamic components.
9.  Establish the bundling/minification workflow.
10. Test mobile/responsive behavior and Google Sheets loading.
11. Test for layout shift and perceived loading lag.
12. Pin final production assets to the launch commit.
