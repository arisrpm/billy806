/**
 * BC Creative — polaroid grid of the creative team; each opens a modal with
 * the photo, name, role and bio.
 *
 * Bios come from the Creative tab two ways:
 *   typed into the cell    — blank lines become paragraphs, and a small set of
 *                            inline tags (<em>, <strong>, <i>, <b>, <br>) is
 *                            honoured. Everything else is escaped.
 *   a Google Doc share URL — fetched on first open and converted to real <p>
 *                            tags, keeping italics, bold and links.
 *
 * The doc fetch is lazy and cached: the grid paints immediately, and a bio is
 * only pulled when someone actually opens that person.
 *
 * The bio uses a custom scrollbar so its visual track/thumb remain visible
 * regardless of macOS/browser native scrollbar preferences.
 */
(() => {
  'use strict';

  const MODULE = '[BC Creative]';
  const SELECTOR = '#bc-creative';
  const TAB = 'Creative';

  // A Google Docs share link, in any of the shapes people paste.
  const DOC_URL = /docs\.google\.com\/document\/d\/(?:e\/)?([\w-]{16,})/;

  let root = null;
  let dialog = null;
  let people = [];

  const bioCache = new Map();

  /* ------------------------------------------------------------------ *
   * Bio: typed into the cell
   * ------------------------------------------------------------------ */

  const richText = value =>
    BC.allowInline(BC.esc(value))
      .split(/\n{2,}/)
      .map(block => block.trim().replace(/\n/g, '<br>'))
      .filter(Boolean)
      .map(block => `<p>${block}</p>`)
      .join('');

  /* ------------------------------------------------------------------ *
   * Bio: pulled from a Google Doc
   * ------------------------------------------------------------------ */

  /**
   * Docs wraps every link as google.com/url?q=REAL.
   * Unwrap to the real one.
   */
  const unwrapLink = href => {
    if (!href) return '';

    try {
      const url = new URL(href, 'https://docs.google.com');

      if (
        url.hostname.endsWith('google.com') &&
        url.pathname === '/url'
      ) {
        return url.searchParams.get('q') || href;
      }
    } catch {
      /* fall through */
    }

    return href;
  };

  /**
   * Google Docs does not export <em> or <strong>. It exports <span class="c3">
   * and puts font-style in a <style> block, so emphasis has to be recovered
   * from the class names before the markup means anything.
   */
  const emphasisClasses = doc => {
    const italic = new Set();
    const bold = new Set();

    doc.querySelectorAll('style').forEach(style => {
      style.textContent.replace(
        /\.([\w-]+)\s*\{([^}]*)\}/g,
        (_, name, body) => {
          if (/font-style\s*:\s*italic/i.test(body)) {
            italic.add(name);
          }

          if (/font-weight\s*:\s*(bold|[6-9]00)/i.test(body)) {
            bold.add(name);
          }

          return '';
        }
      );
    });

    return {
      italic,
      bold,
    };
  };

  const convertNode = (node, sets) => {
    if (node.nodeType === Node.TEXT_NODE) {
      return BC.esc(node.nodeValue);
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }

    let inner = Array.from(node.childNodes)
      .map(child => convertNode(child, sets))
      .join('');

    if (!inner.trim()) {
      return '';
    }

    const classes = Array.from(node.classList || []);
    const style = node.getAttribute('style') || '';

    const isItalic =
      node.tagName === 'EM' ||
      node.tagName === 'I' ||
      /font-style\s*:\s*italic/i.test(style) ||
      classes.some(name => sets.italic.has(name));

    const isBold =
      node.tagName === 'STRONG' ||
      node.tagName === 'B' ||
      /font-weight\s*:\s*(bold|[6-9]00)/i.test(style) ||
      classes.some(name => sets.bold.has(name));

    if (node.tagName === 'A') {
      const href = BC.normalizeUrl(
        unwrapLink(node.getAttribute('href'))
      );

      if (href) {
        inner = `
          <a
            href="${BC.esc(href)}"
            target="_blank"
            rel="noopener noreferrer"
          >${inner}</a>
        `;
      }
    }

    if (isItalic) {
      inner = `<em>${inner}</em>`;
    }

    if (isBold) {
      inner = `<strong>${inner}</strong>`;
    }

    return inner;
  };

  const parseDoc = html => {
    const doc = new DOMParser().parseFromString(
      html,
      'text/html'
    );

    const sets = emphasisClasses(doc);

    return Array.from(
      doc.body.querySelectorAll('p')
    )
      .map(p => convertNode(p, sets).trim())
      .filter(Boolean)
      .map(p => `<p>${p}</p>`)
      .join('');
  };

  const fetchDocBio = async id => {
    if (bioCache.has(id)) {
      return bioCache.get(id);
    }

    const pending = (async () => {
      const url =
        `https://docs.google.com/document/d/${id}/export?format=html`;

      const response = await fetch(url, {
        credentials: 'omit',
      });

      if (!response.ok) {
        throw new Error(
          `Doc request failed: ${response.status}. ` +
          'The document must be shared ' +
          '"Anyone with the link -> Viewer".'
        );
      }

      return parseDoc(
        await response.text()
      );
    })();

    bioCache.set(id, pending);

    return pending;
  };

  /* ------------------------------------------------------------------ *
   * Rendering
   * ------------------------------------------------------------------ */

  const photoHtml = person =>
    person.img
      ? `
        <img
          class="bc-creative__photo"
          src="${BC.esc(person.img)}"
          alt="${BC.esc(person.name)}"
          loading="lazy"
        >
      `
      : '';

  const captionHtml = (person, interactive) => {
    // A static card's name is already announced by the image's alt text, so a
    // second copy here would have a screen reader say it twice. A button needs
    // it: without a text child it is announced as an unlabelled button.
    if (person.img && !interactive) {
      return '';
    }

    return `
      <span class="bc-creative__caption${person.img ? ' is-sr-only' : ''}">
        <span class="bc-creative__caption-name">
          ${BC.esc(person.name)}
        </span>

        ${
          person.role
            ? `
              <span class="bc-creative__caption-role">
                ${BC.esc(person.role)}
              </span>
            `
            : ''
        }
      </span>
    `;
  };

  /**
   * Only someone with a bio gets a button. With nothing to show, a modal that
   * opens on an empty panel is worse than no modal — and a <button> that does
   * nothing is a broken promise to anyone tabbing through, so the card renders
   * as plain markup instead of a disabled control.
   */
  const cardHtml = (person, index) => {
    const interactive = Boolean(person.bio);

    const inner =
      photoHtml(person) +
      captionHtml(person, interactive);

    return `
      <li class="bc-creative__item">
        ${
          interactive
            ? `
              <button
                class="bc-creative__card"
                type="button"
                data-index="${index}"
                aria-haspopup="dialog"
              >
                ${inner}
              </button>
            `
            : `
              <div class="bc-creative__card is-static">
                ${inner}
              </div>
            `
        }
      </li>
    `;
  };

  const render = () => {
    root.innerHTML = `
      <ul class="bc-creative__grid">
        ${people.map(cardHtml).join('')}
      </ul>

      <dialog
        class="bc-creative__dialog"
        aria-labelledby="bc-creative-name"
      >
        <button
          class="bc-creative__close"
          type="button"
          aria-label="Close"
        ></button>

        <div class="bc-creative__detail">

          <div class="bc-creative__detail-photo"></div>

          <div class="bc-creative__detail-text">

            <h3
              class="bc-creative__name"
              id="bc-creative-name"
            ></h3>

            <p class="bc-creative__role"></p>

            <div class="bc-creative__bio-wrap">

              <div
                class="bc-creative__bio"
                tabindex="0"
              ></div>

              <div
                class="bc-creative__scrollbar"
                aria-hidden="true"
              >
                <div
                  class="bc-creative__scrollbar-thumb"
                ></div>
              </div>

            </div>

          </div>
        </div>
      </dialog>
    `;

    dialog = root.querySelector(
      '.bc-creative__dialog'
    );

    initScrollbar();
  };

  /* ------------------------------------------------------------------ *
   * Custom scrollbar
   * ------------------------------------------------------------------ */

  const getScrollbarElements = () => {
    if (!dialog) {
      return {};
    }

    return {
      bio: dialog.querySelector(
        '.bc-creative__bio'
      ),

      track: dialog.querySelector(
        '.bc-creative__scrollbar'
      ),

      thumb: dialog.querySelector(
        '.bc-creative__scrollbar-thumb'
      ),
    };
  };

  /**
   * Calculate thumb size and position from the native scrolling element.
   * The content itself still uses normal browser scrolling; only the visual
   * scrollbar has been replaced.
   */
  const updateScrollbar = () => {
    const {
      bio,
      track,
      thumb,
    } = getScrollbarElements();

    if (!bio || !track || !thumb) {
      return;
    }

    const scrollable =
      bio.scrollHeight > bio.clientHeight + 1;

    track.classList.toggle(
      'is-disabled',
      !scrollable
    );

    if (!scrollable) {
      thumb.style.height = '100%';
      thumb.style.transform =
        'translateY(0)';
      return;
    }

    const trackHeight =
      track.clientHeight;

    if (!trackHeight) {
      return;
    }

    const ratio =
      bio.clientHeight /
      bio.scrollHeight;

    const thumbHeight =
      Math.max(
        20,
        trackHeight * ratio
      );

    const maxThumbTravel =
      trackHeight - thumbHeight;

    const maxScroll =
      bio.scrollHeight -
      bio.clientHeight;

    const thumbTop =
      maxScroll > 0
        ? (
            bio.scrollTop /
            maxScroll
          ) * maxThumbTravel
        : 0;

    thumb.style.height =
      `${thumbHeight}px`;

    thumb.style.transform =
      `translateY(${thumbTop}px)`;
  };

  /**
   * Convert a requested thumb position into the equivalent content scroll.
   */
  const scrollFromThumbPosition = thumbTop => {
    const {
      bio,
      track,
      thumb,
    } = getScrollbarElements();

    if (!bio || !track || !thumb) {
      return;
    }

    const trackHeight =
      track.clientHeight;

    const thumbHeight =
      thumb.offsetHeight;

    const maxThumbTravel =
      trackHeight - thumbHeight;

    const maxScroll =
      bio.scrollHeight -
      bio.clientHeight;

    if (
      maxThumbTravel <= 0 ||
      maxScroll <= 0
    ) {
      bio.scrollTop = 0;
      return;
    }

    const clampedTop =
      Math.max(
        0,
        Math.min(
          thumbTop,
          maxThumbTravel
        )
      );

    bio.scrollTop =
      (
        clampedTop /
        maxThumbTravel
      ) * maxScroll;
  };

  const initScrollbar = () => {
    const {
      bio,
      track,
      thumb,
    } = getScrollbarElements();

    if (!bio || !track || !thumb) {
      return;
    }

    /* -------------------------------------------------------------- *
     * Normal scrolling
     * -------------------------------------------------------------- */

    bio.addEventListener(
      'scroll',
      updateScrollbar,
      {
        passive: true,
      }
    );

    /* -------------------------------------------------------------- *
     * Clicking the yellow track
     * -------------------------------------------------------------- */

    track.addEventListener(
      'pointerdown',
      event => {
        // Thumb dragging is handled separately below.
        if (
          event.target === thumb
        ) {
          return;
        }

        if (
          track.classList.contains(
            'is-disabled'
          )
        ) {
          return;
        }

        const trackRect =
          track.getBoundingClientRect();

        const thumbHeight =
          thumb.offsetHeight;

        // Center the thumb around the clicked point.
        const targetTop =
          event.clientY -
          trackRect.top -
          thumbHeight / 2;

        scrollFromThumbPosition(
          targetTop
        );
      }
    );

    /* -------------------------------------------------------------- *
     * Dragging the navy thumb
     * -------------------------------------------------------------- */

    thumb.addEventListener(
      'pointerdown',
      event => {
        event.preventDefault();
        event.stopPropagation();

        if (
          track.classList.contains(
            'is-disabled'
          )
        ) {
          return;
        }

        const trackRect =
          track.getBoundingClientRect();

        const thumbRect =
          thumb.getBoundingClientRect();

        // Where inside the thumb the visitor grabbed it.
        const grabOffset =
          event.clientY -
          thumbRect.top;

        thumb.setPointerCapture(
          event.pointerId
        );

        thumb.classList.add(
          'is-dragging'
        );

        const onMove = moveEvent => {
          const targetTop =
            moveEvent.clientY -
            trackRect.top -
            grabOffset;

          scrollFromThumbPosition(
            targetTop
          );
        };

        const onEnd = endEvent => {
          thumb.classList.remove(
            'is-dragging'
          );

          if (
            thumb.hasPointerCapture(
              endEvent.pointerId
            )
          ) {
            thumb.releasePointerCapture(
              endEvent.pointerId
            );
          }

          thumb.removeEventListener(
            'pointermove',
            onMove
          );

          thumb.removeEventListener(
            'pointerup',
            onEnd
          );

          thumb.removeEventListener(
            'pointercancel',
            onEnd
          );
        };

        thumb.addEventListener(
          'pointermove',
          onMove
        );

        thumb.addEventListener(
          'pointerup',
          onEnd
        );

        thumb.addEventListener(
          'pointercancel',
          onEnd
        );
      }
    );

    /* -------------------------------------------------------------- *
     * Responsive recalculation
     * -------------------------------------------------------------- */

    window.addEventListener(
      'resize',
      updateScrollbar
    );
  };

  /* ------------------------------------------------------------------ *
   * Bio
   * ------------------------------------------------------------------ */

  const setBio = async person => {
    const target =
      dialog.querySelector(
        '.bc-creative__bio'
      );

    const raw =
      person.bio || '';

    const match =
      raw.match(DOC_URL);

    // Always start each person at the top.
    target.scrollTop = 0;

    /* -------------------------------------------------------------- *
     * Typed bio
     * -------------------------------------------------------------- */

    if (!match) {
      target.innerHTML =
        richText(raw);

      requestAnimationFrame(
        updateScrollbar
      );

      return;
    }

    /* -------------------------------------------------------------- *
     * Google Doc bio
     * -------------------------------------------------------------- */

    target.innerHTML = `
      <p class="bc-creative__bio-loading">
        Loading…
      </p>
    `;

    requestAnimationFrame(
      updateScrollbar
    );

    try {
      const html =
        await fetchDocBio(
          match[1]
        );

      // The visitor may have moved on while the doc was in flight.
      if (
        dialog.dataset.name !==
        person.name
      ) {
        return;
      }

      target.innerHTML =
        html || '';

      target.scrollTop = 0;

      requestAnimationFrame(
        updateScrollbar
      );
    } catch (error) {
      console.error(
        `${MODULE} Could not load the bio for ${person.name}.`,
        error
      );

      if (
        dialog.dataset.name ===
        person.name
      ) {
        target.innerHTML = '';
        target.scrollTop = 0;

        requestAnimationFrame(
          updateScrollbar
        );
      }
    }
  };

  /* ------------------------------------------------------------------ *
   * Modal
   * ------------------------------------------------------------------ */

  const open = person => {
    if (
      !person ||
      !person.bio
    ) {
      return;
    }

    dialog.dataset.name =
      person.name;

    dialog.querySelector(
      '.bc-creative__detail-photo'
    ).innerHTML =
      person.img
        ? `
          <img
            src="${BC.esc(person.img)}"
            alt="${BC.esc(person.name)}"
          >
        `
        : '';

    dialog.querySelector(
      '.bc-creative__name'
    ).textContent =
      person.name;

    const role =
      dialog.querySelector(
        '.bc-creative__role'
      );

    role.textContent =
      person.role;

    role.hidden =
      !person.role;

    // Native <dialog>: focus trap, Escape, backdrop and focus restoration on
    // close all come free, so there is no hand-rolled trap to get wrong.
    dialog.showModal();

    // Paint the scrollbar after the dialog has dimensions.
    requestAnimationFrame(
      updateScrollbar
    );

    setBio(person);
  };

  /* ------------------------------------------------------------------ *
   * Events
   * ------------------------------------------------------------------ */

  const bindEvents = () => {
    root.addEventListener(
      'click',
      event => {
        const card =
          event.target.closest(
            '.bc-creative__card'
          );

        // Static cards carry no data-index and are not clickable.
        if (
          card &&
          card.dataset.index !==
            undefined
        ) {
          open(
            people[
              Number(
                card.dataset.index
              )
            ]
          );

          return;
        }

        if (
          event.target.closest(
            '.bc-creative__close'
          )
        ) {
          dialog.close();
        }
      }
    );

    /**
     * Clicking the backdrop closes.
     * The dialog's own box is the hit area, so anything outside its bounds
     * is the backdrop.
     */
    root.addEventListener(
      'click',
      event => {
        if (
          event.target !== dialog
        ) {
          return;
        }

        const box =
          dialog.getBoundingClientRect();

        const outside =
          event.clientX < box.left ||
          event.clientX > box.right ||
          event.clientY < box.top ||
          event.clientY > box.bottom;

        if (outside) {
          dialog.close();
        }
      }
    );
  };

  /* ------------------------------------------------------------------ *
   * Init
   * ------------------------------------------------------------------ */

  const init = async () => {
    root =
      document.querySelector(
        SELECTOR
      );

    if (
      !root ||
      !window.BC
    ) {
      return;
    }

    root.setAttribute(
      'aria-busy',
      'true'
    );

    try {
      const rows =
        await BC.getSheet(
          TAB
        );

      people = rows
        .filter(row => row.name)
        .map(row => ({
          name: row.name,
          role: row.role || '',
          img: BC.normalizeUrl(
            row.img
          ),
          bio: row.bio || '',
        }));

      if (!people.length) {
        root.hidden = true;
        return;
      }

      render();
      bindEvents();
    } catch (error) {
      console.error(
        `${MODULE} Unable to load the creative team.`,
        error
      );

      root.hidden = true;
    } finally {
      root.removeAttribute(
        'aria-busy'
      );

      root.classList.remove(
        'is-loading'
      );
    }
  };

  window.BCCreative = {
    init,
  };
})();