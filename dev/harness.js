/**
 * BC Dev Harness — local development only. Never bundled, never uploaded.
 *
 * Loads AFTER core.js and BEFORE main.js, so it can read BC.config and stub
 * the Sheets response before anything fetches.
 *
 * Data source:
 *   automatic          mock until CONFIG.apiKey is filled in, then live
 *   ?data=mock         force the stub
 *   ?data=live         force the real Google Sheets request
 *
 * CSS test scenarios (mock only):
 *   ?scenario=empty    tabs return headings and no rows
 *   ?scenario=error    the request fails
 *   ?scenario=long     overlong copy, for wrapping and overflow
 *
 * Layout:
 *   ?sticky=broken     put overflow on an ancestor, reproducing the
 *                      Squarespace wrapper that silently kills position:sticky
 */
(() => {
  'use strict';

  const params = new URLSearchParams(window.location.search);
  const scenario = params.get('scenario') || 'default';
  const forced = params.get('data');

  const keyMissing =
    !window.BC?.config?.apiKey || BC.config.apiKey === 'YOUR_API_KEY';

  const useMock = forced === 'mock' || (forced !== 'live' && keyMissing);

  /* ------------------------------------------------------------------ *
   * Mock data
   * ------------------------------------------------------------------ */

  const HEADER_ROWS = {
    // Mirrors the live Header tab as it currently stands, placeholders and all.
    default: [['CENTER CALL TO ACTION', 'GET TICKETS TODAY', '#', 'None']],
    real: [['A NEW PLAY. BROADWAY. OCTOBER 2026', 'GET TICKETS TODAY', 'telecharge.com/860', 'Blank']],
    long: [[
      'AN EXTRAORDINARY NEW PLAY BY BILLY CRYSTAL, DIRECT FROM ITS ACCLAIMED PRE-BROADWAY ENGAGEMENT',
      'GET TICKETS FOR THE LIMITED BROADWAY ENGAGEMENT NOW',
      'telecharge.com/860',
      'Blank',
    ]],
    empty: [],
  };

  const FAQ_ROWS = {
    default: [
      ['What is the run time?', '90 minutes with no intermission.'],
      ['Where is the theatre?', 'Nederlander Theatre, 208 W 41st St.\nDoors open 30 minutes before curtain.\n\nDirections and transit: www.mta.info'],
      ['Is there an age restriction?', 'Recommended for ages 12 and up. Everyone entering the theatre must have a ticket.'],
      ['What is the exchange policy?', 'Exchanges are available through the point of purchase up to 24 hours before the performance.'],
    ],
    long: [[
      'What should I know about accessibility, latecomer seating, and the theatre’s bag policy before I arrive for my performance?',
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(12),
    ]],
    empty: [],
  };

  /** A realistic Broadway week: dark Monday, matinees Wed / Sat / Sun. */
  const calendarRows = () => {
    if (scenario === 'empty') return [];

    const SCHEDULE = {
      0: { evening: '', matinee: '3:00 PM' },   // Sun
      1: null,                                   // Mon dark
      2: { evening: '7:00 PM', matinee: '' },   // Tue
      3: { evening: '8:00 PM', matinee: '2:00 PM' },
      4: { evening: '7:00 PM', matinee: '' },
      5: { evening: '8:00 PM', matinee: '' },
      6: { evening: '8:00 PM', matinee: '2:00 PM' },
    };

    const rows = [];
    const day = new Date(2026, 9, 1);
    const end = new Date(2027, 0, 31);

    while (day <= end) {
      const slot = SCHEDULE[day.getDay()];

      const date = [
        String(day.getMonth() + 1).padStart(2, '0'),
        String(day.getDate()).padStart(2, '0'),
        day.getFullYear(),
      ].join('/');

      // Deterministic rather than random so screenshots stay comparable.
      const best = day.getDate() % 7 === 0;

      rows.push(
        slot
          ? [date, slot.matinee, slot.matinee && best ? 'TRUE' : 'FALSE',
             slot.evening, slot.evening && best ? 'TRUE' : 'FALSE']
          : [date, '', 'FALSE', '', 'FALSE']
      );

      day.setDate(day.getDate() + 1);
    }

    return rows;
  };

  const pick = (table, key) => table[key] ?? table.default;

  const mockResponse = () => ({
    valueRanges: [
      {
        range: 'Header!A1:D2',
        values: [
          ['CENTER CALL TO ACTION', 'BUTTON TEXT', 'BUTTON URL', 'BUTTON TARGET'],
          ...pick(HEADER_ROWS, scenario),
        ],
      },
      {
        range: 'Calendar!A1:E124',
        values: [
          ['DATE', 'MATINEE TIME', 'MAT BEST AVAILABLE', 'EVENING TIME', 'EVE BEST AVAILABLE'],
          ...calendarRows(),
        ],
      },
      {
        range: 'FAQs!A1:B5',
        values: [['QUESTION', 'ANSWER'], ...pick(FAQ_ROWS, scenario)],
      },
    ],
  });

  if (useMock) {
    window.fetch = async () => {
      if (scenario === 'error') {
        return { ok: false, status: 403, json: async () => ({}) };
      }

      // A beat of latency, so loading states are actually visible.
      await new Promise(resolve => setTimeout(resolve, 350));

      return { ok: true, json: async () => mockResponse() };
    };
  }

  // Reproduce the one condition that silently breaks a sticky header, so the
  // warning in header.js can be seen working before it matters on the live site.
  if (params.get('sticky') === 'broken') {
    const style = document.createElement('style');
    style.textContent = 'body { overflow-x: hidden; }';
    document.head.appendChild(style);
  }

  /* ------------------------------------------------------------------ *
   * Status bar
   * ------------------------------------------------------------------ */

  const link = (label, query, active) =>
    `<a class="dev-bar__link${active ? ' is-active' : ''}" href="?${query}">${label}</a>`;

  const render = () => {
    const bar = document.createElement('div');
    bar.className = 'dev-bar';

    const source = useMock ? 'MOCK' : 'LIVE';
    const base = useMock ? 'data=mock&' : 'data=live&';

    bar.innerHTML = `
      <span class="dev-bar__badge dev-bar__badge--${source.toLowerCase()}">${source}</span>

      <span class="dev-bar__group">
        ${link('mock', 'data=mock', useMock)}
        ${link('live', 'data=live', !useMock)}
      </span>

      <span class="dev-bar__group">
        ${['default', 'real', 'empty', 'error', 'long']
          .map(name => link(name, `${base}scenario=${name}`, scenario === name))
          .join('')}
      </span>

      <span class="dev-bar__note">
        ${useMock
          ? 'Stubbed data — add CONFIG.apiKey in js/core.js for live'
          : 'Hitting the real workbook'}
      </span>
    `;

    document.body.appendChild(bar);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render, { once: true });
  } else {
    render();
  }

  window.BCDev = { source: useMock ? 'mock' : 'live', scenario };
})();
