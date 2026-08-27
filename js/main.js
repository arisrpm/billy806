/**
 * BC Main — entry point.
 *
 * Warms the batched Sheets request as soon as the bundle evaluates, then
 * initializes each component once the DOM is ready. Every module is isolated:
 * one failing component cannot stop the others from rendering.
 *
 * Source order in the bundle must be: core.js -> components -> main.js
 */
(() => {
  'use strict';

  const MODULE = '[BC]';

  // Global names, not bare identifiers — see start() below.
  const MODULES = ['BCHeader', 'BCCalendar', 'BCFAQ', 'BCCreative'];

  /**
   * Look modules up on `window` rather than referencing them directly.
   *
   *   BCHeader?.init?.()          // ReferenceError if BCHeader is undeclared
   *   window.BCHeader?.init?.()   // safe
   *
   * Optional chaining guards null/undefined *values*, not undeclared
   * identifiers. A bare reference to a module that was dropped from the
   * bundle throws and takes down every module after it in this loop.
   */
  const start = name => {
    const mod = window[name];

    if (!mod || typeof mod.init !== 'function') return;

    try {
      const result = mod.init();

      // init() is async — a rejection surfaces here, not in the catch below.
      if (result && typeof result.catch === 'function') {
        result.catch(error =>
          console.error(`${MODULE} ${name} failed while loading.`, error)
        );
      }
    } catch (error) {
      console.error(`${MODULE} ${name} failed to initialize.`, error);
    }
  };

  const init = () => {
    if (!window.BC) {
      console.error(
        `${MODULE} Core did not load — no components will render. ` +
          'Check the bundle order (core.js must come first).'
      );
      return;
    }

    MODULES.forEach(start);

    if (window.BC.config?.debug) console.log(`${MODULE} Site initialized.`);
  };

  // Kick the fetch off now so it overlaps with the rest of DOM parsing rather
  // than starting at DOMContentLoaded. Components await the same promise;
  // this catch only keeps the warm-up from logging an unhandled rejection.
  window.BC?.load?.().catch(() => {});

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
