/**
 * BC Core — shared layer for the Billy Crystal 860 site.
 *
 * Every component reads its content from one Google Sheets workbook. Core owns
 * that relationship so the component modules only deal with rendering:
 *
 *   - one batched request for all tabs, memoized for the page lifetime
 *   - rows normalized from positional arrays into keyed objects
 *   - shared escaping / URL / boolean helpers
 *   - setup-failure diagnostics that say what to actually go fix
 *
 * Public API (window.BC):
 *   BC.load()               -> Promise<{ [tab]: Row[] }>   warm/await the fetch
 *   BC.getSheet(tab)        -> Promise<Row[]>
 *   BC.getRow(tab, index=0) -> Promise<Row|null>           single-config tabs
 *   BC.esc(value)           -> HTML-escaped string
 *   BC.normalizeUrl(value)  -> href-safe string, or '' if unusable
 *   BC.isValidUrl(value)    -> boolean
 *   BC.bool(value)          -> boolean
 *
 * Rows also carry `$html` for any cell the client formatted in the sheet.
 * A link, bold or italic applied in Google Sheets lives in the cell's format,
 * not its value, so `values.batchGet` returns only the visible text and the
 * URLs vanish. This reads textFormatRuns instead and rebuilds them as markup.
 */
(() => {
  'use strict';

  const MODULE = '[BC Core]';

  const CONFIG = {
    spreadsheetId: '1vuJLzSrn-1lCG93ZPIV0qaQq_dMGwG6P0II9DDNOzGM',

    // Browser-visible by design. Restrict it to the Sheets API and to this
    // site's referrers in Google Cloud Console. See notes: the key plus the
    // spreadsheet ID grants read access to EVERY tab in the workbook, so the
    // workbook must contain nothing private.
    apiKey: 'AIzaSyB2bGN781PqOayJLrn1BDqsnWoPEy-A66A',

    // Tab name -> only the columns that tab actually uses. Keep these tight;
    // A:Z fetches 26 columns to use five.
    ranges: {
      Header: 'A:D',
      Calendar: 'A:E',
      FAQs: 'A:B',
      Creative: 'A:D',
    },

    // Set false before pinning the launch commit.
    debug: true,
  };

  const log = (...args) => {
    if (CONFIG.debug) console.log(MODULE, ...args);
  };

  const warn = (...args) => console.warn(MODULE, ...args);

  /* ------------------------------------------------------------------ *
   * Helpers
   * ------------------------------------------------------------------ */

  const ESCAPES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };

  /**
   * Escape a Sheet value for insertion into generated HTML. The client can
   * type anything into a cell, so every interpolated value goes through this.
   */
  const esc = value =>
    String(value ?? '').replace(/[&<>"']/g, ch => ESCAPES[ch]);

  const HOSTNAME_LIKE = /^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#]|$)/i;

  // mailto: and tel: are real destinations in FAQ copy — an accessibility
  // contact address, a group-sales phone number. They cannot execute anything,
  // unlike javascript: and data:, which stay rejected.
  const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

  /**
   * Turn a Sheet cell into a string that is safe to put in an href, or '' if
   * it cannot be one.
   *
   * Anchors (#tickets) and site paths (/tickets) are returned as authored.
   * A bare hostname gets https:// — clients type "telecharge.com/860"
   * constantly, and resolving that against the page would silently produce
   * billycrystal860.com/telecharge.com/860. The protocol check still rejects
   * javascript: and data:.
   */
  const normalizeUrl = value => {
    const raw = String(value ?? '').trim();
    if (!raw) return '';

    // Anything that isn't an anchor, a path, an explicit http(s) URL, or a
    // hostname is not a link — "TBD" must not resolve to a page on this site.
    const linkable =
      /^[#/]/.test(raw) ||
      /^https?:\/\//i.test(raw) ||
      /^(mailto|tel):/i.test(raw) ||
      HOSTNAME_LIKE.test(raw);

    if (!linkable) return '';

    const candidate = HOSTNAME_LIKE.test(raw) ? `https://${raw}` : raw;

    try {
      const url = new URL(candidate, window.location.href);

      if (!SAFE_PROTOCOLS.has(url.protocol)) return '';

      return /^[#/]/.test(candidate) ? candidate : url.href;
    } catch {
      return '';
    }
  };

  const isValidUrl = value => normalizeUrl(value) !== '';

  const TRUTHY = new Set(['true', 'yes', 'y', 'x', '1', '✓', 'checked']);

  /** Tolerant flag reader for columns like MAT BEST AVAILABLE. */
  const bool = value => TRUTHY.has(String(value ?? '').trim().toLowerCase());

  /** "MAT BEST AVAILABLE" -> "matBestAvailable" */
  const camelKey = heading =>
    String(heading ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+(.)?/g, (_, ch) => (ch ? ch.toUpperCase() : ''));

  const cellValue = cell => String(cell?.formattedValue ?? '');

  /**
   * Rebuild a cell's links, bold and italic from its textFormatRuns.
   *
   * Each run marks where a format starts; it ends where the next run begins.
   * Returns '' when the cell carries no formatting, so callers can fall back
   * to the plain value and nothing pays for this unless it is used.
   *
   * NOTE: run indices address the UNTRIMMED value. Slicing a trimmed string
   * would shift every run by the leading whitespace and mangle the output.
   */
  const runsToHtml = (raw, runs) => {
    if (!raw || !Array.isArray(runs) || !runs.length) return '';

    const decorated = runs.some(run => {
      const format = run.format || {};
      return Boolean(format.link?.uri || format.bold || format.italic);
    });

    if (!decorated) return '';

    let html = esc(raw.slice(0, runs[0].startIndex || 0));

    runs.forEach((run, i) => {
      const start = run.startIndex || 0;
      const end = i + 1 < runs.length ? runs[i + 1].startIndex : raw.length;

      let piece = esc(raw.slice(start, end));
      if (!piece) return;

      const format = run.format || {};

      if (format.italic) piece = `<em>${piece}</em>`;
      if (format.bold) piece = `<strong>${piece}</strong>`;

      const href = normalizeUrl(format.link?.uri);

      if (href) {
        piece = `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${piece}</a>`;
      }

      html += piece;
    });

    return html;
  };

  /**
   * Sheets returns positional cells. Keying rows by their heading means a
   * client inserting a column doesn't silently shift every field by one.
   *
   * Any cell the client formatted also lands on `row.$html` under the same
   * key, so a module can prefer the marked-up version and fall back to plain
   * text without knowing anything about the sheet.
   */
  const toObjects = rows => {
    if (!Array.isArray(rows) || rows.length < 2) return [];

    const keys = (rows[0].values || []).map(cell => camelKey(cellValue(cell)));

    return rows
      .slice(1)
      .map(row => {
        const cells = row.values || [];
        const obj = {};
        const html = {};

        keys.forEach((key, i) => {
          if (!key) return;

          const raw = cellValue(cells[i]);
          obj[key] = raw.trim();

          const rich = runsToHtml(raw, cells[i]?.textFormatRuns);
          if (rich) html[key] = rich;
        });

        if (Object.keys(html).length) obj.$html = html;

        return obj;
      })
      .filter(obj => Object.entries(obj).some(([key, value]) => key !== '$html' && value));
  };

  /* ------------------------------------------------------------------ *
   * Fetch
   * ------------------------------------------------------------------ */

  const buildUrl = () => {
    const params = new URLSearchParams();

    Object.entries(CONFIG.ranges).forEach(([tab, columns]) => {
      params.append('ranges', `${tab}!${columns}`);
    });

    params.set('includeGridData', 'true');

    // Without this mask the response carries every formatting property for
    // every cell. Restricted to the two fields we use it is ~0.8KB more than
    // values:batchGet over the wire, for the same single request.
    params.set(
      'fields',
      'sheets(properties.title,data.rowData.values(formattedValue,textFormatRuns))'
    );

    params.set('key', CONFIG.apiKey);

    return (
      'https://sheets.googleapis.com/v4/spreadsheets/' +
      `${encodeURIComponent(CONFIG.spreadsheetId)}?${params}`
    );
  };

  const diagnose = status => {
    switch (status) {
      case 400:
        return 'A tab name in CONFIG.ranges does not match the workbook exactly.';
      case 403:
        return 'Either the API key restrictions block this referrer, or the ' +
          'workbook is not shared. An API key cannot read a private sheet — ' +
          'set it to "Anyone with the link -> Viewer".';
      case 404:
        return 'CONFIG.spreadsheetId does not resolve.';
      case 429:
        return 'Google Sheets read quota exceeded.';
      default:
        return '';
    }
  };

  const fetchAll = async () => {
    const response = await fetch(buildUrl(), { credentials: 'omit' });

    if (!response.ok) {
      const hint = diagnose(response.status);
      throw new Error(
        `Google Sheets request failed: ${response.status}.${hint ? ` ${hint}` : ''}`
      );
    }

    const data = await response.json();
    const sheets = {};

    // One entry per sheet, in the order the ranges were requested.
    (data.sheets || []).forEach(sheet => {
      const tab = sheet.properties?.title;
      if (tab) sheets[tab] = toObjects(sheet.data?.[0]?.rowData || []);
    });

    return sheets;
  };

  // Memoized: every component awaits the same single request. A failure stays
  // failed for the page lifetime rather than having each module retry.
  let pending = null;

  const load = () => {
    if (!pending) {
      pending = fetchAll();

      // Two arguments, not .then().catch(): a success-only .then() would spawn
      // a derived promise whose rejection nobody owns, and the browser reports
      // that as an uncaught error on top of the ones callers already handle.
      pending.then(
        sheets => log('Loaded tabs:', Object.keys(sheets).join(', ')),
        () => {}
      );
    }

    return pending;
  };

  const getSheet = async tab => {
    const sheets = await load();

    if (!(tab in sheets)) {
      warn(`Tab "${tab}" was not returned. Add it to CONFIG.ranges.`);
      return [];
    }

    return sheets[tab];
  };

  const getRow = async (tab, index = 0) => {
    const rows = await getSheet(tab);
    return rows[index] || null;
  };

  window.BC = {
    config: CONFIG,
    load,
    getSheet,
    getRow,
    esc,
    normalizeUrl,
    isValidUrl,
    bool,
  };
})();
