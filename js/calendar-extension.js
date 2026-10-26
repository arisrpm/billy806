/**
 * BC Calendar Extension
 *
 * Separate calendar for Billy Crystal 860 extension performances.
 *
 * Google Sheets:
 *   Calendar Extension
 *
 * 
 * HTML:
 *   #bc-calendar-extension
 *
 * Uses BC Core for Google Sheets data.
 *
 * Does not affect the original Calendar module.
 */

(() => {
  'use strict';

  const MODULE = '[BC Calendar Extension]';

  const SELECTOR = '#bc-calendar-extension';

  const TAB = 'Calendar Extension';

  const CONFIG = {

    baseUrl: 'https://www.telecharge.com/Billy-Crystal-860-tickets',

    aid: 'BWY001492800',
    

    utm: {
      utm_source: 'show_site',
      utm_campaign: 'BillyCrystal860SS',
      utm_medium: 'web',
    },

    // Fallback if no extension performances exist.
    // Update when the extension dates are finalized.
    startYear: 2027,
    startMonth: 0,

    legendPerMonth: false,

    legendText:
      'Click on the date and time below for tickets.',

    legendBestAvailableText:
      ' Best Availability =',

    listBelow: '(max-width: 680px)',

    fixedSixRows: false,
  };

  const MONTH_NAMES = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  const WEEKDAYS = [
    { full: 'Sunday', short: 'Sun' },
    { full: 'Monday', short: 'Mon' },
    { full: 'Tuesday', short: 'Tue' },
    { full: 'Wednesday', short: 'Wed' },
    { full: 'Thursday', short: 'Thu' },
    { full: 'Friday', short: 'Fri' },
    { full: 'Saturday', short: 'Sat' },
  ];

  const WEEK = 7;
  const SIX_ROWS = 42;

  let root = null;
  let media = null;
  let eventsByDate = {};
  let months = [];
  let index = 0;
  let bound = false;

  /* ============================================================
     HELPERS
     ============================================================ */

  const pad = value =>
    String(value).padStart(2, '0');

  const monthKey = (year, month) =>
    `${year}-${pad(month + 1)}`;

  const dateKey = (year, month, day) =>
    `${year}-${pad(month + 1)}-${pad(day)}`;

  const todayKey = () => {
    const now = new Date();

    return dateKey(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );
  };

  const toKey = value => {

    const [month, day, year] =
      String(value || '').split('/');

    if (!month || !day || !year) {
      return '';
    }

    return `${year}-${pad(month)}-${pad(day)}`;
  };

  /* ============================================================
     PERFORMANCE DATA
     ============================================================ */

  const addPerformance = (
    list,
    time,
    flag,
    type
  ) => {

    const label =
      String(time || '').trim();

    if (!label) {
      return;
    }

    list.push({

      label,

      urlTime:
        label.replace(/\s+/g, ''),

      bestAvailable:
        BC.bool(flag),

      type,
    });
  };

  const buildEventMap = rows => {

    const map = {};

    rows.forEach(row => {

      const key =
        toKey(row.date);

      if (!key) {
        return;
      }

      const list = [];

      addPerformance(
        list,
        row.matineeTime,
        row.matBestAvailable,
        'matinee'
      );

      addPerformance(
        list,
        row.eveningTime,
        row.eveBestAvailable,
        'evening'
      );

      if (list.length) {
        map[key] = list;
      }

    });

    return map;
  };

  const collectMonths = () => {

    return [
      ...new Set(
        Object.keys(eventsByDate)
          .map(key => key.slice(0, 7))
      )
    ].sort();

  };

  /* ============================================================
     MONTH NAVIGATION
     ============================================================ */

  const startingIndex = () => {

    if (!months.length) {
      return 0;
    }

    const now = new Date();

    const currentMonth =
      monthKey(
        now.getFullYear(),
        now.getMonth()
      );

    const found =
      months.findIndex(
        key => key >= currentMonth
      );

    return found === -1
      ? months.length - 1
      : found;
  };

  const visibleMonth = () => {

    if (!months.length) {

      return {
        year: CONFIG.startYear,
        month: CONFIG.startMonth,
      };

    }

    const [year, month] =
      months[index].split('-');

    return {
      year: Number(year),
      month: Number(month) - 1,
    };
  };

  /* ============================================================
     TICKET LINKS
     ============================================================ */

  const ticketUrl = (
    key,
    performance
  ) => {

    const [year, month, day] =
      key.split('-');

    const params = [

      `PerformanceDateTime=${month}/${day}/${year}%20${performance.urlTime}`

    ];

    if (CONFIG.aid) {

      params.push(
        `AID=${CONFIG.aid}`
      );

    }

    Object.entries(CONFIG.utm)
      .forEach(([name, value]) => {

        if (value) {

          params.push(
            `${name}=${value}`
          );

        }

      });

    if (CONFIG.aid) {

      params.push(
        `utm_id=${CONFIG.aid}`
      );

    }

    return `${CONFIG.baseUrl}?${params.join('&')}`;
  };

  const longDate = key => {

    const [year, month, day] =
      key.split('-').map(Number);

    return new Date(
      year,
      month - 1,
      day
    ).toLocaleDateString(
      'en-US',
      {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }
    );
  };

  /* ============================================================
     PERFORMANCE HTML
     ============================================================ */

  const performanceHtml = (
    key,
    performance
  ) => `

    <li class="bc-calendar__performance${
      performance.bestAvailable
        ? ' is-best-available'
        : ''
    }">

      <a
        class="bc-calendar__link"
        href="${BC.esc(ticketUrl(key, performance))}"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Buy tickets, ${BC.esc(longDate(key))} at ${BC.esc(performance.label)}"
      >
        ${BC.esc(performance.label)}
      </a>

    </li>

  `;

  /* ============================================================
     DAY HTML
     ============================================================ */

  const dayHtml = (
    key,
    day,
    today
  ) => {

    const performances =
      eventsByDate[key] || [];

    const classes = [
      'bc-calendar__day'
    ];

    if (!performances.length) {
      classes.push('is-dark');
    }

    if (key < today) {
      classes.push('is-past');
    }

    if (key === today) {
      classes.push('is-today');
    }

    return `

      <div class="${classes.join(' ')}">

        <time
          class="bc-calendar__date"
          datetime="${key}"
        >
          ${day}
        </time>

        ${
          performances.length
            ? `
              <ul class="bc-calendar__times">

                ${
                  performances
                    .map(p =>
                      performanceHtml(key, p)
                    )
                    .join('')
                }

              </ul>
            `
            : ''
        }

      </div>

    `;
  };

  /* ============================================================
     DESKTOP GRID
     ============================================================ */

  const gridHtml = (
    year,
    month
  ) => {

    const today =
      todayKey();

    const firstWeekday =
      new Date(
        year,
        month,
        1
      ).getDay();

    const daysInMonth =
      new Date(
        year,
        month + 1,
        0
      ).getDate();

    const cells =
      WEEKDAYS.map(day => `

        <div
          class="bc-calendar__weekday"
          aria-hidden="true"
        >

          <span class="bc-calendar__weekday-full">
            ${day.full}
          </span>

          <span class="bc-calendar__weekday-short">
            ${day.short}
          </span>

        </div>

      `);

    const days = [];

    for (
      let i = 0;
      i < firstWeekday;
      i += 1
    ) {

      days.push(
        '<div class="bc-calendar__day is-empty"></div>'
      );

    }

    for (
      let day = 1;
      day <= daysInMonth;
      day += 1
    ) {

      days.push(

        dayHtml(
          dateKey(year, month, day),
          day,
          today
        )

      );

    }

    const target =
      CONFIG.fixedSixRows
        ? SIX_ROWS
        : Math.ceil(
            days.length / WEEK
          ) * WEEK;

    while (
      days.length < target
    ) {

      days.push(
        '<div class="bc-calendar__day is-empty"></div>'
      );

    }

    return cells
      .concat(days)
      .join('');
  };

  /* ============================================================
     MOBILE LIST
     ============================================================ */

  const listHtml = (
    year,
    month
  ) => {

    const prefix =
      monthKey(year, month);

    const today =
      todayKey();

    const keys =
      Object.keys(eventsByDate)
        .filter(key =>
          key.startsWith(prefix)
        )
        .sort();

    if (!keys.length) {

      return `
        <p class="bc-calendar__empty">
          No performances this month.
        </p>
      `;

    }

    const rows =
      keys.map(key => {

        const [
          year_,
          month_,
          day_
        ] = key
          .split('-')
          .map(Number);

        const date =
          new Date(
            year_,
            month_ - 1,
            day_
          );

        return `

          <li class="bc-calendar__list-day${
            key < today
              ? ' is-past'
              : ''
          }">

            <div class="bc-calendar__list-date">

              <span class="bc-calendar__list-weekday">

                ${
                  date.toLocaleDateString(
                    'en-US',
                    {
                      weekday: 'short'
                    }
                  )
                }

              </span>

              <time datetime="${key}">

                ${
                  date.toLocaleDateString(
                    'en-US',
                    {
                      month: 'short',
                      day: 'numeric'
                    }
                  )
                }

              </time>

            </div>

            <ul class="bc-calendar__times">

              ${
                eventsByDate[key]
                  .map(p =>
                    performanceHtml(key, p)
                  )
                  .join('')
              }

            </ul>

          </li>

        `;

      });

    return `

      <ol class="bc-calendar__list">
        ${rows.join('')}
      </ol>

    `;
  };

  /* ============================================================
     LEGEND
     ============================================================ */

  const useList = () =>
    Boolean(CONFIG.listBelow) &&
    Boolean(
      media &&
      media.matches
    );

  const monthHasBestAvailable = (
    year,
    month
  ) => {

    const prefix =
      monthKey(year, month);

    return Object
      .entries(eventsByDate)
      .some(([key, list]) =>

        key.startsWith(prefix) &&
        list.some(
          p => p.bestAvailable
        )

      );
  };

  const showLegend = (
    year,
    month
  ) => {

    if (!CONFIG.legendPerMonth) {

      return Object
        .values(eventsByDate)
        .some(list =>
          list.some(
            p => p.bestAvailable
          )
        );

    }

    return monthHasBestAvailable(
      year,
      month
    );
  };

  /* ============================================================
     RENDER
     ============================================================ */

  const render = () => {

    const {
      year,
      month
    } = visibleMonth();

    const hasPrev =
      index > 0;

    const hasNext =
      index < months.length - 1;

    root.innerHTML = `

      <div class="bc-calendar">

        <div class="bc-calendar__nav">

          <button
            class="bc-calendar__prev"
            type="button"
            aria-label="Previous month"
            ${hasPrev ? '' : 'disabled'}
          ></button>

          <h2
            class="bc-calendar__month"
            aria-live="polite"
          >
            ${MONTH_NAMES[month]}
          </h2>

          <button
            class="bc-calendar__next"
            type="button"
            aria-label="Next month"
            ${hasNext ? '' : 'disabled'}
          ></button>

        </div>

        <p
          class="bc-calendar__legend"
          ${showLegend(year, month) ? '' : 'hidden'}
        >

          ${BC.esc(CONFIG.legendText)}

          ${
            CONFIG.legendBestAvailableText
              ? `<br>${BC.esc(CONFIG.legendBestAvailableText)}`
              : ''
          }

          <span
            class="bc-calendar__swatch"
            aria-hidden="true"
          ></span>

          <span class="bc-calendar__sr">
            highlighted showtimes
          </span>

        </p>

        ${
          useList()
            ? listHtml(year, month)
            : `
              <div class="bc-calendar__grid">

                ${
                  gridHtml(
                    year,
                    month
                  )
                }

              </div>
            `
        }

      </div>

    `;
  };

  /* ============================================================
     NAVIGATION
     ============================================================ */

  const go = (
    step,
    selector
  ) => {

    const next =
      index + step;

    if (
      next < 0 ||
      next > months.length - 1
    ) {
      return;
    }

    index = next;

    render();

    const button =
      root.querySelector(selector);

    if (
      button &&
      !button.disabled
    ) {

      button.focus();

    } else {

      root
        .querySelector(
          '.bc-calendar__month'
        )
        ?.focus?.();

    }
  };

  const bindEvents = () => {

    if (bound) {
      return;
    }

    bound = true;

    root.addEventListener(
      'click',
      event => {

        if (
          event.target.closest(
            '.bc-calendar__prev'
          )
        ) {

          go(
            -1,
            '.bc-calendar__prev'
          );

        }

        if (
          event.target.closest(
            '.bc-calendar__next'
          )
        ) {

          go(
            1,
            '.bc-calendar__next'
          );

        }

      }
    );
  };

  /* ============================================================
     INITIALIZATION
     ============================================================ */

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
        await BC.getSheet(TAB);

      eventsByDate =
        buildEventMap(rows);

      months =
        collectMonths();

      index =
        startingIndex();

      if (
        !months.length &&
        BC.config.debug
      ) {

        console.warn(
          `${MODULE} No extension performances found.`
        );

      }

      if (
        CONFIG.listBelow &&
        !media
      ) {

        media =
          window.matchMedia(
            CONFIG.listBelow
          );

        media.addEventListener(
          'change',
          render
        );

      }

      render();

      bindEvents();

      if (
        BC.config.debug
      ) {

        console.log(
          `${MODULE} Initialized`,
          {
            tab: TAB,
            months: months.length,
            performances:
              Object.keys(eventsByDate).length
          }
        );

      }

    } catch (error) {

      console.error(
        `${MODULE} Unable to load extension calendar.`,
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

  /* ============================================================
     PUBLIC API
     ============================================================ */

  window.BCCalendarExtension = {
    init
  };

})();
