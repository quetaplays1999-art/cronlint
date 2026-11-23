import { parseCron } from './parser.js';

const MAX_YEAR_SPAN = 100;

function daysInUtcMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function findNextOrEqual(sortedValues, target) {
  for (let i = 0; i < sortedValues.length; i++) {
    if (sortedValues[i] >= target) {
      return sortedValues[i];
    }
  }
  return null;
}

function resolveDate(fromDate) {
  if (fromDate === undefined) {
    return new Date();
  }
  const date = fromDate instanceof Date ? new Date(fromDate.getTime()) : new Date(fromDate);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`Invalid date: "${fromDate}"`);
  }
  return date;
}

function dayMatches(fields, year, month, day) {
  const domField = fields.dayOfMonth;
  const dowField = fields.dayOfWeek;

  if (domField.wildcard && dowField.wildcard) {
    return true;
  }

  const domMatch = domField.values.includes(day);
  if (dowField.wildcard) {
    return domMatch;
  }

  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const dowMatch = dowField.values.includes(dow);
  if (domField.wildcard) {
    return dowMatch;
  }

  // Standard Vixie cron: if both day-of-month and day-of-week are restricted, match either (OR).
  return domMatch || dowMatch;
}

/**
 * Check whether a given UTC Date matches the cron expression (ignoring seconds/milliseconds).
 * @param {string | ReturnType<typeof parseCron>} expr
 * @param {Date | string | number} dateInput
 * @returns {boolean}
 */
export function matchesDate(expr, dateInput) {
  const parsed = typeof expr === 'string' ? parseCron(expr) : expr;
  const date = resolveDate(dateInput);
  const { minute, hour, month } = parsed.fields;

  const year = date.getUTCFullYear();
  const utcMonth = date.getUTCMonth() + 1;
  const utcDay = date.getUTCDate();
  const utcHour = date.getUTCHours();
  const utcMinute = date.getUTCMinutes();

  return (
    month.values.includes(utcMonth) &&
    hour.values.includes(utcHour) &&
    minute.values.includes(utcMinute) &&
    dayMatches(parsed.fields, year, utcMonth, utcDay)
  );
}

/**
 * Compute the next N execution UTC timestamps strictly after `fromDate`.
 * @param {string | ReturnType<typeof parseCron>} expr
 * @param {number} [count=5]
 * @param {Date | string | number} [fromDate=new Date()]
 * @returns {Date[]}
 */
export function nextRuns(expr, count = 5, fromDate = new Date()) {
  const parsed = typeof expr === 'string' ? parseCron(expr) : expr;

  if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
    throw new RangeError(`"count" must be a non-negative integer, got ${count}`);
  }

  const startDate = resolveDate(fromDate);
  if (count === 0) {
    return [];
  }

  const { minute: minField, hour: hourField, month: monthField } = parsed.fields;

  // Strictly after startDate, aligned to the next whole UTC minute.
  const firstCandidateMs = Math.floor(startDate.getTime() / 60000) * 60000 + 60000;
  const cursor = new Date(firstCandidateMs);

  let year = cursor.getUTCFullYear();
  let month = cursor.getUTCMonth() + 1;
  let day = cursor.getUTCDate();
  let hour = cursor.getUTCHours();
  let minute = cursor.getUTCMinutes();

  const maxYear = year + MAX_YEAR_SPAN;
  const results = [];

  while (results.length < count && year <= maxYear) {
    const nextMonth = findNextOrEqual(monthField.values, month);
    if (nextMonth === null) {
      year += 1;
      month = monthField.values[0];
      day = 1;
      hour = 0;
      minute = 0;
      continue;
    }
    if (nextMonth !== month) {
      month = nextMonth;
      day = 1;
      hour = 0;
      minute = 0;
    }

    const maxDay = daysInUtcMonth(year, month);
    while (day <= maxDay && !dayMatches(parsed.fields, year, month, day)) {
      day += 1;
      hour = 0;
      minute = 0;
    }
    if (day > maxDay) {
      month += 1;
      if (month > 12) {
        year += 1;
        month = 1;
      }
      day = 1;
      hour = 0;
      minute = 0;
      continue;
    }

    const nextHour = findNextOrEqual(hourField.values, hour);
    if (nextHour === null) {
      day += 1;
      hour = 0;
      minute = 0;
      continue;
    }
    if (nextHour !== hour) {
      hour = nextHour;
      minute = 0;
    }

    const nextMinute = findNextOrEqual(minField.values, minute);
    if (nextMinute === null) {
      hour += 1;
      if (hour > 23) {
        day += 1;
        hour = 0;
      }
      minute = 0;
      continue;
    }

    minute = nextMinute;
    results.push(new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0)));

    // Advance by 1 minute for the next search iteration
    minute += 1;
    if (minute > 59) {
      minute = 0;
      hour += 1;
      if (hour > 23) {
        hour = 0;
        day += 1;
      }
    }
  }

  return results;
}

/**
 * Compute the single next execution UTC timestamp strictly after `fromDate`, or `null` if none exists.
 * @param {string | ReturnType<typeof parseCron>} expr
 * @param {Date | string | number} [fromDate=new Date()]
 * @returns {Date | null}
 */
export function nextRun(expr, fromDate = new Date()) {
  const runs = nextRuns(expr, 1, fromDate);
  return runs.length > 0 ? runs[0] : null;
}
