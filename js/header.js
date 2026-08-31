/**
 * BC Header — custom one-page header and navigation.
 *
 * The header BAR ships as static markup in Squarespace Code Injection so it
 * paints with the page: no fetch, no layout shift, and a working Get Tickets
 * link even if JavaScript or the Sheets request fails.
 *
 * This module then:
 *   - builds the nav panel (closed by default, so it costs no layout shift)
 *   - wires the menu: Escape, click-outside, focus trap, scroll lock
 *   - publishes --bc-header-height so anchors clear the fixed bar
 *   - replaces the center text and ticket button from the Header sheet tab
 *
 * Nothing here is required for the header to be usable. It only enhances.
 */
(() => {
  'use strict';

  const MODULE = '[BC Header]';
  const SELECTOR = '.bc-header';
  const TAB = 'Header';

  // Same-page anchors. These live here rather than in the Squarespace
  // injection so nav changes are a git commit, not a CMS edit.
  const NAV = [
    { label: 'About', href: '#about' },
    { label: 'Tickets', href: '#tickets' },
    { label: 'Creative', href: '#creative' },
    { label: 'FAQ', href: '#faq' },
  ];

  const FOCUSABLE = 'a[href], button:not([disabled])';
  const PANEL_ID = 'bc-header-panel';

  let header = null;
  let toggle = null;
  let panel = null;
  let lastFocus = null;

  /* ------------------------------------------------------------------ *
   * Menu
   * ------------------------------------------------------------------ */

  /**
   * Only offer nav items whose section is actually on the page. The site grows
   * a section at a time, and a link to a section that does not exist is a dead
   * link the visitor can click. Items reappear on their own once the matching
   * id shows up, so NAV stays the single list to maintain.
   */
  const availableNav = () => {
    const present = NAV.filter(item => document.getElementById(item.href.slice(1)));

    if (BC.config.debug && present.length !== NAV.length) {
      const missing = NAV.filter(item => !present.includes(item)).map(item => item.href);
      console.warn(
        `${MODULE} Nav items hidden, no matching section on the page:`,
        missing.join(', ')
      );
    }

    return present;
  };

  const buildPanel = () => {
    const nav = document.createElement('nav');

    nav.className = 'bc-header__panel';
    nav.id = PANEL_ID;
    nav.hidden = true;
    nav.setAttribute('aria-label', 'Main');

    const items = availableNav().map(
      item => `
        <li class="bc-header__nav-item">
          <a class="bc-header__link" href="${BC.esc(item.href)}">
            ${BC.esc(item.label)}
          </a>
        </li>
      `
    ).join('');

    nav.innerHTML = `<ul class="bc-header__nav">${items}</ul>`;

    return nav;
  };

  const isOpen = () => toggle.getAttribute('aria-expanded') === 'true';

  const setOpen = open => {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');

    panel.hidden = !open;
    document.documentElement.classList.toggle('bc-menu-open', open);

    if (open) {
      lastFocus = document.activeElement;
      const first = panel.querySelector(FOCUSABLE);
      if (first) first.focus();
    } else if (lastFocus) {
      lastFocus.focus();
      lastFocus = null;
    }
  };

  /** Keep Tab inside the open menu; include the toggle so it stays reachable. */
  const trapFocus = event => {
    const items = [toggle, ...panel.querySelectorAll(FOCUSABLE)];
    if (!items.length) return;

    const first = items[0];
    const last = items[items.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const bindMenu = () => {
    toggle.addEventListener('click', () => setOpen(!isOpen()));

    document.addEventListener('keydown', event => {
      if (!isOpen()) return;

      if (event.key === 'Escape') {
        setOpen(false);
      } else if (event.key === 'Tab') {
        trapFocus(event);
      }
    });

    // Clicking anywhere outside the header closes the menu.
    document.addEventListener('click', event => {
      if (isOpen() && !header.contains(event.target)) setOpen(false);
    });
  };

  /* ------------------------------------------------------------------ *
   * Anchors
   * ------------------------------------------------------------------ */

  const prefersReducedMotion = () =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /**
   * Scroll to a section without writing #id into the address bar.
   *
   * The default anchor behaviour appends the fragment and pushes a history
   * entry; scrolling by hand keeps the URL clean. scroll-margin-top on the
   * target still keeps it clear of the sticky bar.
   *
   * Returns false when there is nothing to scroll to, so the caller can let
   * the browser handle it normally.
   */
  const scrollToTarget = href => {
    const id = (href || '').slice(1);
    const target = id && document.getElementById(id);

    if (!target) return false;

    target.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start',
    });

    // Move keyboard and screen-reader users along with the visual jump.
    if (!target.hasAttribute('tabindex')) {
      target.setAttribute('tabindex', '-1');
    }

    target.focus({ preventScroll: true });

    return true;
  };

  const bindAnchors = () => {
    header.addEventListener('click', event => {
      const link = event.target.closest('a[href^="#"]');

      if (!link || !header.contains(link)) return;

      // Always prevent, never conditionally. A bare "#", or a link whose
      // section has not been built yet, would otherwise fall through to the
      // browser and write the fragment into the address bar.
      event.preventDefault();

      // Close first: setOpen(false) restores focus to the toggle, which would
      // otherwise undo the focus move onto the target section.
      if (toggle && isOpen()) setOpen(false);

      scrollToTarget(link.getAttribute('href'));
    });
  };

  /* ------------------------------------------------------------------ *
   * Layout
   * ------------------------------------------------------------------ */

  /** Anchor targets use this as scroll-margin-top so the bar never covers them. */
  const measure = () => {
    document.documentElement.style.setProperty(
      '--bc-header-height',
      `${header.offsetHeight}px`
    );
  };

  /**
   * position: sticky fails silently when any ancestor establishes a scroll
   * container. Squarespace templates set overflow-x on wrappers often enough
   * that this is worth catching locally rather than on the live site.
   *
   * overflow: clip is fine — it does not create a scroll container.
   */
  const warnIfStickyBroken = () => {
    if (!BC.config.debug) return;
    if (getComputedStyle(header).position !== 'sticky') return;

    for (let node = header.parentElement; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      const values = [style.overflow, style.overflowX, style.overflowY];

      if (values.some(value => value && !['visible', 'clip'].includes(value))) {
        console.warn(
          `${MODULE} position: sticky is being blocked by an ancestor with ` +
            `overflow ${style.overflowX}/${style.overflowY}.`,
          node
        );
        return;
      }
    }
  };

  const bindMeasure = () => {
    measure();

    let frame = null;

    window.addEventListener('resize', () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });

    // Webfonts can change the bar height after first paint.
    if (document.fonts?.ready) document.fonts.ready.then(measure);
  };

  /* ------------------------------------------------------------------ *
   * Sheet content
   * ------------------------------------------------------------------ */

  const applyCenterText = text => {
    const center = header.querySelector('.bc-header__cta');
    if (!center) return;

    center.textContent = text;
    center.hidden = !text;
  };

  const applyButton = ({ buttonText, buttonUrl, buttonTarget }) => {
    const button = header.querySelector('.bc-header__tickets');
    if (!button) return;

    // A row exists and the client cleared the fields — that is a deliberate
    // "hide the button", so honour it. A missing row or failed fetch is not,
    // and is handled by leaving the markup fallback alone (see init).
    // Either field blanked is a deliberate "no button" per the sheet spec.
    if (!buttonText.trim() || !buttonUrl.trim()) {
      button.hidden = true;
      return;
    }

    // Normalized, not raw: a bare hostname in the cell must not become a
    // path on this site.
    const url = BC.normalizeUrl(buttonUrl);

    // Filled in but unusable is a typo, not an intent — keep the markup
    // fallback rather than removing the site's primary call to action.
    if (!url) {
      console.warn(
        `${MODULE} BUTTON URL is not a usable link, keeping the markup ` +
          'default:',
        buttonUrl
      );
      return;
    }

    // "#" is a placeholder the sheet is entitled to hold. It is applied as
    // authored — bindAnchors keeps it out of the address bar — but say so
    // while debugging, so it cannot ship unnoticed.
    if (url === '#' && BC.config.debug) {
      console.warn(
        `${MODULE} BUTTON URL is still the placeholder "#" — the ticket ` +
          'button will not go anywhere.'
      );
    }

    button.textContent = buttonText;
    button.href = url;
    button.hidden = false;

    if (buttonTarget.trim().toLowerCase() === 'blank') {
      button.target = '_blank';
      button.rel = 'noopener noreferrer';
    } else {
      button.removeAttribute('target');
      button.removeAttribute('rel');
    }
  };

  /* ------------------------------------------------------------------ *
   * Init
   * ------------------------------------------------------------------ */

  const init = async () => {
    header = document.querySelector(SELECTOR);

    if (!header) {
      console.warn(
        `${MODULE} No ${SELECTOR} found. Add the header markup to ` +
          'Squarespace Code Injection -> Header.'
      );
      return;
    }

    if (!window.BC) return;

    toggle = header.querySelector('.bc-header__menu');

    if (toggle) {
      panel = buildPanel();
      header.appendChild(panel);

      toggle.setAttribute('aria-controls', PANEL_ID);
      toggle.setAttribute('aria-expanded', 'false');

      bindMenu();
    }

    bindAnchors();
    bindMeasure();
    warnIfStickyBroken();

    // Everything above works offline. Only the copy below needs the network,
    // and the markup already renders a usable header without it.
    try {
      const row = await BC.getRow(TAB);

      if (!row) {
        console.warn(
          `${MODULE} The ${TAB} tab has no configuration row. ` +
            'Keeping the markup defaults.'
        );
        return;
      }

      applyCenterText(row.centerCallToAction || '');
      applyButton({
        buttonText: row.buttonText || '',
        buttonUrl: row.buttonUrl || '',
        buttonTarget: row.buttonTarget || '',
      });
    } catch (error) {
      // Deliberately non-fatal: the baked-in ticket link stays on screen.
      console.error(`${MODULE} Keeping markup defaults.`, error);
    }
  };

  window.BCHeader = { init };
})();
