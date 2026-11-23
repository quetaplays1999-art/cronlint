export const MACROS = Object.freeze({
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
});

export const MONTH_NAMES = Object.freeze({
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12,
});

export const WEEKDAY_NAMES = Object.freeze({
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
});

const FIELD_SPECS = [
  { key: 'minute', label: 'minute', min: 0, max: 59, names: null },
  { key: 'hour', label: 'hour', min: 0, max: 23, names: null },
  { key: 'dayOfMonth', label: 'day-of-month', min: 1, max: 31, names: null },
  { key: 'month', label: 'month', min: 1, max: 12, names: MONTH_NAMES },
  { key: 'dayOfWeek', label: 'day-of-week', min: 0, max: 7, names: WEEKDAY_NAMES, normalizeSeven: true },
];

export class CronParseError extends Error {
  /**
   * @param {string} message
   * @param {{ field?: string | null, value?: string | null, expression?: string | null }} [details]
   */
  constructor(message, details = {}) {
    super(message);
    this.name = 'CronParseError';
    this.field = details.field ?? null;
    this.value = details.value ?? null;
    this.expression = details.expression ?? null;
  }
}

/**
 * Parse a single atomic value (integer or allowed name) for a field.
 * @param {string} token
 * @param {typeof FIELD_SPECS[number]} spec
 * @param {string} expression
 * @returns {{ value: number, isNamedSunday: boolean }}
 */
function parseAtom(token, spec, expression) {
  if (!token) {
    throw new CronParseError(`Empty value in ${spec.label} field`, {
      field: spec.key,
      value: token,
      expression,
    });
  }

  if (/^\d+$/.test(token)) {
    const num = Number.parseInt(token, 10);
    if (num < spec.min || num > spec.max) {
      const rangeHint = spec.normalizeSeven ? '0-7 (0 or 7 = Sunday)' : `${spec.min}-${spec.max}`;
      throw new CronParseError(
        `Value "${token}" out of range in ${spec.label} field (expected ${rangeHint})`,
        { field: spec.key, value: token, expression },
      );
    }
    return { value: num, isNamedSunday: false };
  }

  const upper = token.toUpperCase();
  if (spec.names && Object.prototype.hasOwnProperty.call(spec.names, upper)) {
    return {
      value: spec.names[upper],
      isNamedSunday: spec.key === 'dayOfWeek' && upper === 'SUN',
    };
  }

  const extra = spec.names
    ? ` or ${Object.keys(spec.names)[0]}-${Object.keys(spec.names)[Object.keys(spec.names).length - 1]}`
    : '';
  const rangeHint = spec.normalizeSeven ? '0-7' : `${spec.min}-${spec.max}`;
  throw new CronParseError(
    `Invalid token "${token}" in ${spec.label} field (expected ${rangeHint}${extra})`,
    { field: spec.key, value: token, expression },
  );
}

/**
 * Parse a single cron field string into sorted unique values and structured segments.
 * @param {string} rawField
 * @param {typeof FIELD_SPECS[number]} spec
 * @param {string} expression
 */
function parseField(rawField, spec, expression) {
  if (!rawField) {
    throw new CronParseError(`Empty ${spec.label} field`, {
      field: spec.key,
      value: rawField,
      expression,
    });
  }

  const items = rawField.split(',');
  const valuesSet = new Set();
  const segments = [];
  const effectiveMax = spec.normalizeSeven ? 6 : spec.max;

  for (const item of items) {
    if (item === '') {
      throw new CronParseError(`Empty list item in ${spec.label} field "${rawField}"`, {
        field: spec.key,
        value: rawField,
        expression,
      });
    }

    const slashParts = item.split('/');
    if (slashParts.length > 2) {
      throw new CronParseError(`Invalid step syntax "${item}" in ${spec.label} field`, {
        field: spec.key,
        value: item,
        expression,
      });
    }

    const [rangePart, stepPart] = slashParts;
    let step = null;

    if (stepPart !== undefined) {
      if (!/^\d+$/.test(stepPart)) {
        throw new CronParseError(
          `Invalid step "${stepPart}" in ${spec.label} field (must be a positive integer)`,
          { field: spec.key, value: item, expression },
        );
      }
      step = Number.parseInt(stepPart, 10);
      if (step <= 0) {
        throw new CronParseError(
          `Step value must be greater than 0 in ${spec.label} field "${item}"`,
          { field: spec.key, value: item, expression },
        );
      }
      if (step > (spec.normalizeSeven ? 7 : spec.max)) {
        throw new CronParseError(
          `Step "${step}" exceeds maximum (${spec.normalizeSeven ? 7 : spec.max}) in ${spec.label} field`,
          { field: spec.key, value: item, expression },
        );
      }
    }

    if (rangePart === '') {
      throw new CronParseError(`Missing base expression before "/" in ${spec.label} field "${item}"`, {
        field: spec.key,
        value: item,
        expression,
      });
    }

    if (rangePart === '*') {
      const increment = step ?? 1;
      for (let v = spec.min; v <= effectiveMax; v += increment) {
        valuesSet.add(v);
      }
      segments.push(
        step === null
          ? { type: 'wildcard' }
          : { type: 'step', start: spec.min, end: effectiveMax, step, wildcardBase: true },
      );
      continue;
    }

    if (rangePart.includes('-')) {
      const bounds = rangePart.split('-');
      if (bounds.length !== 2 || bounds[0] === '' || bounds[1] === '') {
        throw new CronParseError(`Invalid range "${rangePart}" in ${spec.label} field`, {
          field: spec.key,
          value: item,
          expression,
        });
      }

      const startAtom = parseAtom(bounds[0], spec, expression);
      const endAtom = parseAtom(bounds[1], spec, expression);
      let start = startAtom.value;
      let end = endAtom.value;

      // Allow named FRI-SUN (5-0 -> 5-7) in day-of-week while still rejecting reversed numeric ranges like 5-2.
      if (spec.normalizeSeven && endAtom.isNamedSunday && start > 0 && end === 0) {
        end = 7;
      }

      if (start > end) {
        throw new CronParseError(
          `Range start (${bounds[0]}) cannot exceed range end (${bounds[1]}) in ${spec.label} field`,
          { field: spec.key, value: item, expression },
        );
      }

      const increment = step ?? 1;
      for (let v = start; v <= end; v += increment) {
        valuesSet.add(spec.normalizeSeven && v === 7 ? 0 : v);
      }

      segments.push(
        step === null
          ? { type: 'range', start: spec.normalizeSeven && start === 7 ? 0 : start, end: spec.normalizeSeven && end === 7 ? 0 : end, rawEnd: end }
          : { type: 'step', start: spec.normalizeSeven && start === 7 ? 0 : start, end: spec.normalizeSeven && end === 7 ? 0 : end, rawEnd: end, step, wildcardBase: false },
      );
      continue;
    }

    // Single value (possibly with a step, e.g. 5/15 -> 5..max step 15)
    const atom = parseAtom(rangePart, spec, expression);
    const normalizedVal = spec.normalizeSeven && atom.value === 7 ? 0 : atom.value;

    if (step !== null) {
      const start = normalizedVal;
      for (let v = start; v <= effectiveMax; v += step) {
        valuesSet.add(v);
      }
      segments.push({
        type: 'step',
        start,
        end: effectiveMax,
        step,
        wildcardBase: false,
      });
    } else {
      valuesSet.add(normalizedVal);
      segments.push({ type: 'value', value: normalizedVal });
    }
  }

  const values = Array.from(valuesSet).sort((a, b) => a - b);
  const wildcard = rawField === '*';

  return {
    raw: rawField,
    values,
    wildcard,
    segments,
  };
}

/**
 * Parse and validate a standard 5-field cron expression or macro.
 * @param {string} expression
 */
export function parseCron(expression) {
  if (typeof expression !== 'string') {
    throw new CronParseError('Cron expression must be a string', {
      expression: String(expression),
    });
  }

  const trimmed = expression.trim();
  if (!trimmed) {
    throw new CronParseError('Cron expression cannot be empty', {
      expression: trimmed,
    });
  }

  let macro = null;
  let normalized = trimmed;

  if (trimmed.startsWith('@')) {
    const lower = trimmed.toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(MACROS, lower)) {
      const supported = Object.keys(MACROS).join(', ');
      throw new CronParseError(
        `Unknown cron macro "${trimmed}" (supported macros: ${supported})`,
        { field: 'macro', value: trimmed, expression: trimmed },
      );
    }
    macro = lower;
    normalized = MACROS[lower];
  }

  const parts = normalized.split(/\s+/);
  if (parts.length !== 5) {
    throw new CronParseError(
      `Expected 5 space-separated fields (minute hour day-of-month month day-of-week), got ${parts.length}`,
      { expression: trimmed },
    );
  }

  const normalizedExpr = parts.join(' ');
  const fields = {
    minute: parseField(parts[0], FIELD_SPECS[0], trimmed),
    hour: parseField(parts[1], FIELD_SPECS[1], trimmed),
    dayOfMonth: parseField(parts[2], FIELD_SPECS[2], trimmed),
    month: parseField(parts[3], FIELD_SPECS[3], trimmed),
    dayOfWeek: parseField(parts[4], FIELD_SPECS[4], trimmed),
  };

  return {
    expression: trimmed,
    macro,
    normalized: normalizedExpr,
    fields,
  };
}

/**
 * Validate a cron expression without throwing.
 * @param {string} expression
 */
export function validateCron(expression) {
  try {
    const parsed = parseCron(expression);
    return { valid: true, parsed };
  } catch (err) {
    if (err instanceof CronParseError) {
      return {
        valid: false,
        error: err.message,
        field: err.field,
      };
    }
    return {
      valid: false,
      error: err instanceof Error ? err.message : String(err),
      field: null,
    };
  }
}
