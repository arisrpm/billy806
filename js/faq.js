/**
 * BC FAQ — accessible accordion built from the FAQs sheet tab.
 *
 * Row order in the sheet is display order. Questions are plain text.
 * Answers are escaped, then given back the two things clients actually use:
 * line breaks and links.
 */
(() => {
  'use strict';

  const MODULE = '[BC FAQ]';
  const SELECTOR = '#bc-faq';
  const TAB = 'FAQs';

  // Heading level for each question. Should sit one below the section's own
  // heading in the page outline.
  const HEADING = 'h3';

  // false = opening one answer closes the others.
  const ALLOW_MULTIPLE = false;

  // Client request: the accordion is visible from the start and the buckle is
  // not clickable for now. Set PANEL_TOGGLE to true to hand the open/close
  // behaviour back — everything for it is still here.
  const PANEL_STARTS_OPEN = true;
  const PANEL_TOGGLE = false;

  // Torn-paper graphic that closes off the bottom of the panel. Set to '' to
  // drop it. Rendered by JS rather than sitting in the Code Block so it always
  // lands directly after the accordion, however many questions there are.
  const BOTTOM_IMAGE =
    'https://images.squarespace-cdn.com/content/69ced95badea255402fe4b3b/af7338cf-9ed5-426f-84e0-3ebdf4c8098a/bc-faq-bottom2.png';

  const LINK = /((?:https?:\/\/|www\.)[^\s<]+[^\s<.,;:!?)])/gi;

  let bound = false;
  let panelBound = false;

  /* ------------------------------------------------------------------ *
   * Rendering
   * ------------------------------------------------------------------ */

  /**
   * Escape first, then re-introduce only what we chose to allow. Doing it in
   * this order means a cell containing markup is inert no matter what.
   */
  const linkify = html =>
    html.replace(
      LINK,
      match =>
        `<a href="${BC.normalizeUrl(match)}" target="_blank" rel="noopener noreferrer">${match}</a>`
    );

  /** Blank lines become paragraphs, single newlines become breaks. */
  const paragraphs = html =>
    html
      .split(/\n{2,}/)
      .map(block => `<p>${block.trim().replace(/\n/g, '<br>')}</p>`)
      .join('');

  /**
   * Prefers the marked-up cell that core rebuilt from the sheet's formatting,
   * so a link the client added with Insert -> Link survives. That HTML is
   * already escaped, so it must not be escaped or linkified again — doing so
   * would double-escape the anchors into visible text.
   *
   * Falls back to the plain value: escape, then linkify bare URLs last, since
   * rewriting newlines after the anchors exist injects <br> inside the tags.
   */
  const formatAnswer = (row) => {
    const rich = row.$html?.answer;

    if (rich) return paragraphs(rich);

    return paragraphs(BC.esc(row.answer)).replace(
      /<p>([\s\S]*?)<\/p>/g,
      (_, inner) => `<p>${linkify(inner)}</p>`
    );
  };

  const renderItem = (row, index) => {
    const questionId = `bc-faq-q-${index}`;
    const answerId = `bc-faq-a-${index}`;

    return `
      <div class="bc-faq__item">

        <${HEADING} class="bc-faq__heading">
          <button
            class="bc-faq__question"
            type="button"
            id="${questionId}"
            aria-expanded="false"
            aria-controls="${answerId}"
          >
            <span class="bc-faq__label">${BC.esc(row.question)}</span>
            <span class="bc-faq__icon" aria-hidden="true"></span>
          </button>
        </${HEADING}>

        <div
          class="bc-faq__answer"
          id="${answerId}"
          role="region"
          aria-labelledby="${questionId}"
          hidden
        >
          <div class="bc-faq__answer-inner">
            ${formatAnswer(row)}
          </div>
        </div>

      </div>
    `;
  };

  /* ------------------------------------------------------------------ *
   * Interaction
   * ------------------------------------------------------------------ */

  const setItemOpen = (button, open) => {
    const answer = document.getElementById(
      button.getAttribute('aria-controls')
    );

    if (!answer) return;

    button.setAttribute('aria-expanded', String(open));
    answer.hidden = !open;
  };

  const bindEvents = container => {
    // Delegated, so re-rendering the list never needs re-binding.
    if (bound) return;
    bound = true;

    container.addEventListener('click', event => {
      const button = event.target.closest('.bc-faq__question');
      if (!button) return;

      const open = button.getAttribute('aria-expanded') === 'true';

      if (!ALLOW_MULTIPLE && !open) {
        container
          .querySelectorAll('.bc-faq__question[aria-expanded="true"]')
          .forEach(other => setItemOpen(other, false));
      }

      setItemOpen(button, !open);
    });
  };

  /**
   * Sits after #bc-faq, not inside it — the accordion's innerHTML is rewritten
   * on render, so anything within would be wiped. Decorative, hence alt="".
   */
  const addBottomImage = container => {
    if (!BOTTOM_IMAGE) return;

    const parent = container.parentElement;
    if (!parent || parent.querySelector(':scope > .bc-faq-bottom')) return;

    const img = document.createElement('img');
    img.className = 'bc-faq-bottom';
    img.src = BOTTOM_IMAGE;
    img.alt = '';

    container.after(img);
  };

  /* ------------------------------------------------------------------ *
   * Outer panel
   * ------------------------------------------------------------------ */

  /**
   * The section starts as just the FAQ plate; clicking it reveals the
   * accordion. A disclosure, not a dialog — so focus deliberately stays on the
   * trigger rather than being moved into the panel.
   *
   * Optional: if the Code Block has no toggle, the accordion simply renders
   * open, which is what the dev page and any simpler placement want.
   */
  const bindPanel = () => {
    const toggle = document.querySelector('.bc-faq__toggle');
    const panel = document.querySelector('.bc-faq__panel');

    if (!toggle || !panel || panelBound) return;
    panelBound = true;

    if (!panel.id) panel.id = 'bc-faq-panel';
    toggle.setAttribute('aria-controls', panel.id);

    // The slide collapses a single grid row, so the panel needs exactly one
    // child. With two or more, everything after the first lands in an implicit
    // auto row and keeps its height — the panel silently never closes.
    // Wrapping here rather than in the markup means the Code Block stays
    // simple and cannot get this wrong.
    if (!panel.querySelector(':scope > .bc-faq__panel-inner')) {
      const inner = document.createElement('div');
      inner.className = 'bc-faq__panel-inner';

      while (panel.firstChild) inner.appendChild(panel.firstChild);
      panel.appendChild(inner);
    }

    // `inert` rather than `hidden`. hidden is display:none, which cannot be
    // transitioned — and the panel has to slide. inert keeps the collapsed
    // panel out of the tab order and the accessibility tree just as hidden
    // would, while leaving CSS free to animate its height.
    const setOpen = open => {
      toggle.setAttribute('aria-expanded', String(open));
      panel.classList.toggle('is-open', open);
      panel.inert = !open;
    };

    // Apply the starting state with the transition suppressed, so an
    // already-open panel does not slide itself down on page load. Later
    // toggles animate normally.
    panel.style.transition = 'none';
    setOpen(PANEL_STARTS_OPEN);
    void panel.offsetHeight;
    panel.style.transition = '';

    if (!PANEL_TOGGLE) {
      // Not a disclosure any more, so it must not present as one. Swapping the
      // <button> for a <div> keeps the artwork and the CSS while taking it out
      // of the tab order — a focusable control that does nothing is worse than
      // no control. The visually-hidden label goes too: it exists to name a
      // button, and there is no longer a button to name.
      const still = document.createElement('div');
      still.className = toggle.className;
      still.innerHTML = toggle.innerHTML;
      still.querySelector('.bc-faq__toggle-label')?.remove();

      toggle.replaceWith(still);
      return;
    }

    toggle.addEventListener('click', () => {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });
  };

  /** Nothing to show: take the plate with it, not just the empty panel. */
  const hideSection = container => {
    const section = container.closest('.bc-faq') || container;
    section.hidden = true;
  };

  /* ------------------------------------------------------------------ *
   * Init
   * ------------------------------------------------------------------ */

  const init = async () => {
    const container = document.querySelector(SELECTOR);

    if (!container || !window.BC) return;

    container.setAttribute('aria-busy', 'true');

    try {
      const rows = await BC.getSheet(TAB);
      const faqs = rows.filter(row => row.question && row.answer);

      if (!faqs.length) {
        // Nothing to show and nothing broken — leave no empty furniture.
        hideSection(container);
        return;
      }

      container.innerHTML = faqs.map(renderItem).join('');
      bindEvents(container);
      addBottomImage(container);
      bindPanel();
    } catch (error) {
      console.error(`${MODULE} Unable to load FAQs.`, error);
      hideSection(container);
    } finally {
      container.removeAttribute('aria-busy');
      container.classList.remove('is-loading');
    }
  };

  window.BCFAQ = { init };
})();
