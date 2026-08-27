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
  const ALLOW_MULTIPLE = true;

  const LINK = /((?:https?:\/\/|www\.)[^\s<]+[^\s<.,;:!?)])/gi;

  let bound = false;

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

  const formatAnswer = value =>
    // Order matters: linkify LAST. Rewriting newlines after the anchors exist
    // injects <br> into the middle of the tags we just built.
    BC.esc(value)
      .split(/\n{2,}/)
      .map(block => `<p>${linkify(block.trim().replace(/\n/g, '<br>'))}</p>`)
      .join('');

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
            ${formatAnswer(row.answer)}
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
        container.hidden = true;
        return;
      }

      container.innerHTML = faqs.map(renderItem).join('');
      bindEvents(container);
    } catch (error) {
      console.error(`${MODULE} Unable to load FAQs.`, error);
      container.hidden = true;
    } finally {
      container.removeAttribute('aria-busy');
      container.classList.remove('is-loading');
    }
  };

  window.BCFAQ = { init };
})();
