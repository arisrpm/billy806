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
    { label: 'Calendar', href: '#calendar' },
    { label: 'Tickets', href: '#tickets' },
    { label: 'Creative Team', href: '#creative' },
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

  const buildPanel = () => {
    const nav = document.createElement('nav');

    nav.className = 'bc-header__panel';
    nav.id = PANEL_ID;
    nav.hidden = true;
    nav.setAttribute('aria-label', 'Main');

    const items = NAV.map(
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

    // Jumping to a section should not leave the panel covering it.
    panel.addEventListener('click', event => {
      if (event.target.closest('a[href^="#"]')) setOpen(false);
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

    bindMeasure();

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
