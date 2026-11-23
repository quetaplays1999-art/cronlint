import { parseCron } from './parser.js';

const MONTHS = [
  '',
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
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatTime(hour, minute) {
  return `${pad2(hour)}:${pad2(minute)}`;
}

function joinList(items, conjunction = 'and') {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, ${conjunction} ${items[items.length - 1]}`;
}

function plural(n, singular, pluralWord = `${singular}s`) {
  return n === 1 ? singular : pluralWord;
}

function formatMinuteSegment(seg) {
  if (seg.type === 'wildcard') return 'every minute';
  if (seg.type === 'value') return `minute ${seg.value}`;
  if (seg.type === 'range') return `every minute from ${seg.start} through ${seg.end}`;
  if (seg.type === 'step') {
    if (seg.wildcardBase) {
      return seg.step === 1 ? 'every minute' : `every ${seg.step} minutes`;
    }
    if (seg.end === 59 && seg.start > 0) {
      return `every ${seg.step} ${plural(seg.step, 'minute')} starting at minute ${seg.start}`;
    }
    return `every ${seg.step} ${plural(seg.step, 'minute')} from minute ${seg.start} through ${seg.end}`;
  }
  return '';
}

function formatHourSegment(seg, minuteVal = null) {
  if (seg.type === 'wildcard') return 'every hour';
  if (seg.type === 'value') {
    return minuteVal !== null ? formatTime(seg.value, minuteVal) : `${pad2(seg.value)}:00`;
  }
  if (seg.type === 'range') {
    const startStr = `${pad2(seg.start)}:00`;
    const endStr = minuteVal !== null ? formatTime(seg.end, minuteVal) : `${pad2(seg.end)}:59`;
    return `between ${startStr} and ${endStr}`;
  }
  if (seg.type === 'step') {
    if (seg.wildcardBase) {
      return seg.step === 1 ? 'every hour' : `every ${seg.step} hours`;
    }
    if (seg.end === 23 && seg.start > 0) {
      return `every ${seg.step} ${plural(seg.step, 'hour')} starting at ${pad2(seg.start)}:00`;
    }
    return `every ${seg.step} ${plural(seg.step, 'hour')} from ${pad2(seg.start)}:00 through ${pad2(seg.end)}:59`;
  }
  return '';
}

function describeTime(minuteField, hourField) {
  const mSegs = minuteField.segments;
  const hSegs = hourField.segments;

  // * *
  if (minuteField.wildcard && hourField.wildcard) {
    return { text: 'Every minute', impliesDaily: true };
  }

  // Single minute + wildcard hour
  if (hourField.wildcard && mSegs.length === 1) {
    const m = mSegs[0];
    if (m.type === 'value') {
      return {
        text: m.value === 0 ? 'Every hour' : `At minute ${m.value} past every hour`,
        impliesDaily: true,
      };
    }
    if (m.type === 'step' && m.wildcardBase) {
      return {
        text: m.step === 1 ? 'Every minute' : `Every ${m.step} minutes`,
        impliesDaily: true,
      };
    }
    if (m.type === 'range') {
      return {
        text: `Every minute from minute ${m.start} through ${m.end} past every hour`,
        impliesDaily: true,
      };
    }
    if (m.type === 'step') {
      return {
        text: `${capitalize(formatMinuteSegment(m))} past every hour`,
        impliesDaily: true,
      };
    }
  }

  // Multiple minute segments + wildcard hour
  if (hourField.wildcard) {
    if (mSegs.every((s) => s.type === 'value')) {
      return {
        text: `At minutes ${joinList(mSegs.map((s) => String(s.value)))} past every hour`,
        impliesDaily: true,
      };
    }
    return {
      text: `At ${joinList(mSegs.map(formatMinuteSegment))} past every hour`,
      impliesDaily: true,
    };
  }

  // Single minute value + various hour patterns
  if (mSegs.length === 1 && mSegs[0].type === 'value') {
    const m = mSegs[0].value;

    if (hSegs.length === 1) {
      const h = hSegs[0];
      if (h.type === 'value') {
        return { text: `At ${formatTime(h.value, m)}`, impliesDaily: false };
      }
      if (h.type === 'step' && h.wildcardBase) {
        const base = h.step === 1 ? 'every hour' : `every ${h.step} hours`;
        return {
          text: m === 0 ? capitalize(base) : `At minute ${m} past ${base}`,
          impliesDaily: true,
        };
      }
      if (h.type === 'range') {
        const rangeText = `from ${formatTime(h.start, m)} through ${formatTime(h.end, m)}`;
        return {
          text: m === 0 ? `Every hour ${rangeText}` : `At minute ${m} past every hour ${rangeText}`,
          impliesDaily: false,
        };
      }
      if (h.type === 'step') {
        return {
          text: m === 0
            ? capitalize(formatHourSegment(h))
            : `At minute ${m} past ${formatHourSegment(h)}`,
          impliesDaily: false,
        };
      }
    }

    if (hSegs.every((s) => s.type === 'value')) {
      const times = hSegs.map((s) => formatTime(s.value, m));
      return { text: `At ${joinList(times)}`, impliesDaily: false };
    }

    const hourDesc = joinList(hSegs.map((s) => formatHourSegment(s, m)));
    return {
      text: m === 0 ? `On the hour, ${hourDesc}` : `At minute ${m} past ${hourDesc}`,
      impliesDaily: false,
    };
  }

  // General minute description + hour description
  let minutePhrase;
  if (minuteField.wildcard) {
    minutePhrase = 'Every minute';
  } else if (mSegs.length === 1) {
    minutePhrase = capitalize(formatMinuteSegment(mSegs[0]));
  } else if (mSegs.every((s) => s.type === 'value')) {
    minutePhrase = `At minutes ${joinList(mSegs.map((s) => String(s.value)))}`;
  } else {
    minutePhrase = `At ${joinList(mSegs.map(formatMinuteSegment))}`;
  }

  let hourPhrase;
  if (hSegs.length === 1) {
    const h = hSegs[0];
    if (h.type === 'value') {
      hourPhrase = `between ${pad2(h.value)}:00 and ${pad2(h.value)}:59`;
    } else {
      hourPhrase = formatHourSegment(h);
    }
  } else if (hSegs.every((s) => s.type === 'value')) {
    hourPhrase = `during hours ${joinList(hSegs.map((s) => `${pad2(s.value)}:00`))}`;
  } else {
    hourPhrase = joinList(hSegs.map((s) => formatHourSegment(s)));
  }

  return { text: `${minutePhrase}, ${hourPhrase}`, impliesDaily: false };
}

function describeDayOfMonth(field) {
  const segs = field.segments;
  if (segs.length === 1) {
    const s = segs[0];
    if (s.type === 'value') return `on day ${s.value} of the month`;
    if (s.type === 'range') return `on days ${s.start} through ${s.end} of the month`;
    if (s.type === 'step') {
      if (s.wildcardBase) {
        return s.step === 1 ? 'every day' : `every ${s.step} days`;
      }
      if (s.end === 31) {
        return `every ${s.step} ${plural(s.step, 'day')} starting on day ${s.start} of the month`;
      }
      return `every ${s.step} ${plural(s.step, 'day')} from day ${s.start} through ${s.end} of the month`;
    }
  }

  if (segs.every((s) => s.type === 'value')) {
    return `on days ${joinList(segs.map((s) => String(s.value)))} of the month`;
  }

  const parts = segs.map((s) => {
    if (s.type === 'value') return `day ${s.value}`;
    if (s.type === 'range') return `days ${s.start} through ${s.end}`;
    if (s.type === 'step') {
      return s.wildcardBase
        ? `every ${s.step} ${plural(s.step, 'day')}`
        : `every ${s.step} ${plural(s.step, 'day')} from day ${s.start} through ${s.end}`;
    }
    return 'every day';
  });
  return `on ${joinList(parts)} of the month`;
}

function describeMonth(field) {
  const segs = field.segments;
  if (segs.length === 1) {
    const s = segs[0];
    if (s.type === 'value') return `in ${MONTHS[s.value]}`;
    if (s.type === 'range') return `${MONTHS[s.start]} through ${MONTHS[s.end]}`;
    if (s.type === 'step') {
      if (s.wildcardBase) {
        return s.step === 1 ? 'every month' : `every ${s.step} months`;
      }
      if (s.end === 12) {
        return `every ${s.step} ${plural(s.step, 'month')} starting in ${MONTHS[s.start]}`;
      }
      return `every ${s.step} ${plural(s.step, 'month')} from ${MONTHS[s.start]} through ${MONTHS[s.end]}`;
    }
  }

  if (segs.every((s) => s.type === 'value')) {
    return `in ${joinList(segs.map((s) => MONTHS[s.value]))}`;
  }

  const parts = segs.map((s) => {
    if (s.type === 'value') return MONTHS[s.value];
    if (s.type === 'range') return `${MONTHS[s.start]} through ${MONTHS[s.end]}`;
    if (s.type === 'step') {
      return s.wildcardBase
        ? `every ${s.step} ${plural(s.step, 'month')}`
        : `every ${s.step} ${plural(s.step, 'month')} from ${MONTHS[s.start]} through ${MONTHS[s.end]}`;
    }
    return 'every month';
  });
  return `in ${joinList(parts)}`;
}

function describeDayOfWeek(field) {
  const segs = field.segments;
  if (segs.length === 1) {
    const s = segs[0];
    if (s.type === 'value') return `on ${WEEKDAYS[s.value]}`;
    if (s.type === 'range') return `${WEEKDAYS[s.start]} through ${WEEKDAYS[s.end]}`;
    if (s.type === 'step') {
      if (s.wildcardBase) {
        return s.step === 1 ? 'every day of the week' : `every ${s.step} days of the week`;
      }
      const endName = WEEKDAYS[s.end];
      return `every ${s.step} ${plural(s.step, 'day')} from ${WEEKDAYS[s.start]} through ${endName}`;
    }
  }

  if (segs.every((s) => s.type === 'value')) {
    return `on ${joinList(segs.map((s) => WEEKDAYS[s.value]))}`;
  }

  const parts = segs.map((s) => {
    if (s.type === 'value') return WEEKDAYS[s.value];
    if (s.type === 'range') return `${WEEKDAYS[s.start]} through ${WEEKDAYS[s.end]}`;
    if (s.type === 'step') {
      return s.wildcardBase
        ? `every ${s.step} ${plural(s.step, 'day')} of the week`
        : `every ${s.step} ${plural(s.step, 'day')} from ${WEEKDAYS[s.start]} through ${WEEKDAYS[s.end]}`;
    }
    return 'every day of the week';
  });
  return `on ${joinList(parts)}`;
}

function capitalize(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Produce a human-readable English description of any valid cron expression.
 * @param {string | ReturnType<typeof parseCron>} input
 * @returns {string}
 */
export function explainCron(input) {
  const parsed = typeof input === 'string' ? parseCron(input) : input;
  const { minute, hour, dayOfMonth, month, dayOfWeek } = parsed.fields;

  const { text: timeText, impliesDaily } = describeTime(minute, hour);
  const clauses = [timeText];

  const domRestricted = !dayOfMonth.wildcard;
  const monthRestricted = !month.wildcard;
  const dowRestricted = !dayOfWeek.wildcard;

  // Special clean phrasing for a single calendar date (e.g. "on January 1")
  if (
    domRestricted &&
    monthRestricted &&
    !dowRestricted &&
    dayOfMonth.segments.length === 1 &&
    dayOfMonth.segments[0].type === 'value' &&
    month.segments.length === 1 &&
    month.segments[0].type === 'value'
  ) {
    clauses.push(`on ${MONTHS[month.segments[0].value]} ${dayOfMonth.segments[0].value}`);
    return capitalize(clauses.join(', '));
  }

  if (domRestricted && dowRestricted) {
    // Standard Vixie cron uses OR when both day-of-month and day-of-week are restricted
    clauses.push(`${describeDayOfMonth(dayOfMonth)} or ${describeDayOfWeek(dayOfWeek)}`);
  } else if (domRestricted) {
    clauses.push(describeDayOfMonth(dayOfMonth));
  } else if (dowRestricted) {
    clauses.push(describeDayOfWeek(dayOfWeek));
  } else if (!monthRestricted && !impliesDaily) {
    clauses.push('every day');
  }

  if (monthRestricted) {
    clauses.push(describeMonth(month));
  }

  return capitalize(clauses.join(', '));
}
