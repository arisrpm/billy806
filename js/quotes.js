/**
 * BC Quotes — rotating press quotes from the Quotes sheet tab.
 *
 * Columns: A QUOTE, B PUBLICATION.
 *
 * Quotes are typed by hand, so they go through the same treatment as the FAQ
 * answers: links and emphasis applied IN the sheet arrive as row.$html, and
 * tags typed into the cell (<em>, <strong>, <i>, <b>, <br>, <u>, <sup>,
 * <sub>) are honoured via BC.allowInline. Anything else is escaped.
 */
(() => {
  'use strict';

  const MODULE = '[BC Quotes]';
  const SELECTOR = '#bc-quotes';
  const TAB = 'Quotes';

  const CONFIG = {
    // Milliseconds each quote is held. Brief is 5.5–6s.
    interval: 5750,

    // Length of the crossfade, in step with the CSS transition.
    fade: 600,
  };

  let root = null;
  let items = [];
  let index = 0;
  let timer = null;

  /* ------------------------------------------------------------------ *
   * Rendering
   * ------------------------------------------------------------------ */

  /** Sheet formatting first, then any tags typed into the cell. */
  const rich = (row, key) =>
    BC.allowInline(row.$html?.[key] || BC.esc(row[key] || ''));

  const itemHtml = (row, i) => `
    <li class="bc-quotes__item${i === 0 ? ' is-current' : ''}">
      <blockquote class="bc-quotes__quote">${rich(row, 'quote')}</blockquote>
      ${
        row.publication
          ? `<cite class="bc-quotes__publication">${rich(row, 'publication')}</cite>`
          : ''
      }
    </li>
  `;

  /* ------------------------------------------------------------------ *
   * Rotation
   * ------------------------------------------------------------------ */

  const show = next => {
    items[index].classList.remove('is-current');
    items[next].classList.add('is-current');

    // Only the visible quote is exposed. Without this a screen reader reads
    // every quote in sequence, and links inside hidden ones stay tabbable.
    items[index].inert = true;
    items[index].setAttribute('aria-hidden', 'true');
    items[next].inert = false;
    items[next].removeAttribute('aria-hidden');

    index = next;
  };

  const advance = () => show((index + 1) % items.length);

  const start = () => {
    if (timer || items.length < 2) return;
    timer = setInterval(advance, CONFIG.interval);
  };

  const stop = () => {
    clearInterval(timer);
    timer = null;
  };

  const bindEvents = () => {
    // WCAG 2.2.2: content that moves for more than five seconds needs a way to
    // stop it. Hover and keyboard focus both pause; a visible pause button
    // would be the strict reading if this ever needs to pass a formal audit.
    root.addEventListener('mouseenter', stop);
    root.addEventListener('mouseleave', start);
    root.addEventListener('focusin', stop);
    root.addEventListener('focusout', start);

    // No point animating to a background tab, and it keeps the timing honest
    // when the visitor comes back.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stop();
      else start();
    });
  };

  /* ------------------------------------------------------------------ *
   * Init
   * ------------------------------------------------------------------ */

  const init = async () => {
    root = document.querySelector(SELECTOR);

    if (!root || !window.BC) return;

    root.setAttribute('aria-busy', 'true');

    try {
      const rows = await BC.getSheet(TAB);
      const quotes = rows.filter(row => row.quote);

      if (!quotes.length) {
        root.hidden = true;
        return;
      }

      root.innerHTML = `
        <div class="bc-quotes">
          <ul class="bc-quotes__list">
            ${quotes.map(itemHtml).join('')}
          </ul>
        </div>
      `;

      items = [...root.querySelectorAll('.bc-quotes__item')];

      items.forEach((item, i) => {
        if (i === 0) return;
        item.inert = true;
        item.setAttribute('aria-hidden', 'true');
      });

      root.style.setProperty('--bc-quote-fade', `${CONFIG.fade}ms`);

      bindEvents();

      // One quote is not a rotator, and reduced motion means no auto-advance.
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        start();
      }
    } catch (error) {
      console.error(`${MODULE} Unable to load quotes.`, error);
      root.hidden = true;
    } finally {
      root.removeAttribute('aria-busy');
      root.classList.remove('is-loading');
    }
  };

  window.BCQuotes = { init };
})();
