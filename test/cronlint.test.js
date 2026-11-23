import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  CronParseError,
  MACROS,
  explainCron,
  matchesDate,
  nextRun,
  nextRuns,
  parseCron,
  validateCron,
} from '../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.resolve(__dirname, '../bin/cronlint.js');

function runCli(args) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    encoding: 'utf8',
  });
}

describe('parseCron and validateCron', () => {
  it('parses wildcards across all 5 fields', () => {
    const parsed = parseCron('* * * * *');
    assert.equal(parsed.normalized, '* * * * *');
    assert.equal(parsed.macro, null);
    assert.equal(parsed.fields.minute.values.length, 60);
    assert.equal(parsed.fields.hour.values.length, 24);
    assert.equal(parsed.fields.dayOfMonth.values.length, 31);
    assert.equal(parsed.fields.month.values.length, 12);
    assert.equal(parsed.fields.dayOfWeek.values.length, 7);
    assert.equal(parsed.fields.minute.wildcard, true);
  });

  it('parses macros case-insensitively', () => {
    for (const [macro, expanded] of Object.entries(MACROS)) {
      const parsed = parseCron(macro.toUpperCase());
      assert.equal(parsed.macro, macro);
      assert.equal(parsed.normalized, expanded);
    }
  });

  it('parses lists, ranges, steps, and combined segments', () => {
    const parsed = parseCron('0,15,30-45/5 9-17/2 1,15 JAN-MAR,DEC MON-FRI');
    assert.deepEqual(parsed.fields.minute.values, [0, 15, 30, 35, 40, 45]);
    assert.deepEqual(parsed.fields.hour.values, [9, 11, 13, 15, 17]);
    assert.deepEqual(parsed.fields.dayOfMonth.values, [1, 15]);
    assert.deepEqual(parsed.fields.month.values, [1, 2, 3, 12]);
    assert.deepEqual(parsed.fields.dayOfWeek.values, [1, 2, 3, 4, 5]);
  });

  it('supports starting-value step syntax (N/S)', () => {
    const parsed = parseCron('5/15 2/6 * * *');
    assert.deepEqual(parsed.fields.minute.values, [5, 20, 35, 50]);
    assert.deepEqual(parsed.fields.hour.values, [2, 8, 14, 20]);
  });

  it('supports month and weekday names (case-insensitive) and weekday 7 as Sunday', () => {
    const p1 = parseCron('0 0 * jan-dec sun,wed,fri');
    assert.deepEqual(p1.fields.month.values, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    assert.deepEqual(p1.fields.dayOfWeek.values, [0, 3, 5]);

    const p2 = parseCron('0 0 * * 7');
    assert.deepEqual(p2.fields.dayOfWeek.values, [0]);

    const p3 = parseCron('0 0 * * 5-7');
    assert.deepEqual(p3.fields.dayOfWeek.values, [0, 5, 6]);

    const p4 = parseCron('0 0 * * FRI-SUN');
    assert.deepEqual(p4.fields.dayOfWeek.values, [0, 5, 6]);
  });

  it('normalizes extra whitespace and tabs', () => {
    const parsed = parseCron('  */10\t  0   1  *   *  ');
    assert.equal(parsed.normalized, '*/10 0 1 * *');
    assert.deepEqual(parsed.fields.minute.values, [0, 10, 20, 30, 40, 50]);
  });

  it('rejects invalid expressions with clear CronParseError messages', () => {
    const invalidCases = [
      ['', /empty/i],
      ['   ', /empty/i],
      ['* * * *', /Expected 5 space-separated fields/i],
      ['* * * * * *', /Expected 5 space-separated fields/i],
      ['@every5m', /Unknown cron macro/i],
      ['60 * * * *', /out of range.*minute/i],
      ['0 24 * * *', /out of range.*hour/i],
      ['0 0 0 * *', /out of range.*day-of-month/i],
      ['0 0 32 * *', /out of range.*day-of-month/i],
      ['0 0 * 0 *', /out of range.*month/i],
      ['0 0 * 13 *', /out of range.*month/i],
      ['0 0 * * 8', /out of range.*day-of-week/i],
      ['10-5 * * * *', /cannot exceed range end/i],
      ['0 0 * * 5-2', /cannot exceed range end/i],
      ['*/0 * * * *', /greater than 0/i],
      ['*/-2 * * * *', /Invalid step/i],
      ['*/abc * * * *', /Invalid step/i],
      ['*/2/3 * * * *', /Invalid step syntax/i],
      ['*/60 * * * *', /exceeds maximum/i],
      ['1,,2 * * * *', /Empty list item/i],
      [',1 * * * *', /Empty list item/i],
      ['1, * * * *', /Empty list item/i],
      ['0 0 * FOO *', /Invalid token "FOO"/i],
      ['0 0 * * JAN', /Invalid token "JAN"/i],
      ['1- * * * *', /Invalid range/i],
      ['-5 * * * *', /Invalid range/i],
      ['/5 * * * *', /Missing base expression/i],
    ];

    for (const [expr, pattern] of invalidCases) {
      assert.throws(
        () => parseCron(expr),
        (err) => err instanceof CronParseError && pattern.test(err.message),
        `Expected "${expr}" to fail matching ${pattern}`,
      );

      const res = validateCron(expr);
      assert.equal(res.valid, false);
      assert.match(res.error, pattern);
    }
  });

  it('rejects non-string input cleanly', () => {
    const res = validateCron(null);
    assert.equal(res.valid, false);
    assert.match(res.error, /must be a string/i);
  });

  it('returns parsed object on valid validateCron call', () => {
    const res = validateCron('@daily');
    assert.equal(res.valid, true);
    assert.equal(res.parsed.normalized, '0 0 * * *');
  });
});

describe('explainCron', () => {
  it('produces readable English for standard patterns and macros', () => {
    assert.equal(explainCron('* * * * *'), 'Every minute');
    assert.equal(explainCron('*/5 * * * *'), 'Every 5 minutes');
    assert.equal(explainCron('@hourly'), 'Every hour');
    assert.equal(explainCron('15 * * * *'), 'At minute 15 past every hour');
    assert.equal(explainCron('@daily'), 'At 00:00, every day');
    assert.equal(explainCron('@weekly'), 'At 00:00, on Sunday');
    assert.equal(explainCron('@monthly'), 'At 00:00, on day 1 of the month');
    assert.equal(explainCron('@yearly'), 'At 00:00, on January 1');
  });

  it('describes weekdays, lists, ranges, steps, and months accurately', () => {
    assert.equal(explainCron('30 9 * * MON-FRI'), 'At 09:30, Monday through Friday');
    assert.equal(explainCron('0 8,12,18 * * *'), 'At 08:00, 12:00, and 18:00, every day');
    assert.equal(
      explainCron('*/15 9-17 * * 1-5'),
      'Every 15 minutes, between 09:00 and 17:59, Monday through Friday',
    );
    assert.equal(
      explainCron('0 0 1,15 JAN,JUL *'),
      'At 00:00, on days 1 and 15 of the month, in January and July',
    );
    assert.equal(
      explainCron('0 */3 * * *'),
      'Every 3 hours',
    );
  });

  it('explains OR semantics when both day-of-month and day-of-week are set', () => {
    assert.equal(
      explainCron('0 9 13 * FRI'),
      'At 09:00, on day 13 of the month or on Friday',
    );
  });

  it('throws CronParseError for invalid expressions', () => {
    assert.throws(() => explainCron('bad cron'), CronParseError);
  });
});

describe('nextRuns, nextRun, and matchesDate', () => {
  it('computes exact next UTC runs strictly after fromDate', () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    const runs = nextRuns('*/15 * * * *', 4, from);
    assert.deepEqual(
      runs.map((d) => d.toISOString()),
      [
        '2026-01-01T00:15:00.000Z',
        '2026-01-01T00:30:00.000Z',
        '2026-01-01T00:45:00.000Z',
        '2026-01-01T01:00:00.000Z',
      ],
    );
  });

  it('handles sub-minute timestamps without re-triggering the current minute', () => {
    const from = new Date('2026-01-01T00:00:30.500Z');
    const runs = nextRuns('* * * * *', 2, from);
    assert.deepEqual(
      runs.map((d) => d.toISOString()),
      ['2026-01-01T00:01:00.000Z', '2026-01-01T00:02:00.000Z'],
    );
  });

  it('handles macros and year rollovers', () => {
    const from = new Date('2026-12-31T23:59:00.000Z');
    const yearly = nextRuns('@yearly', 2, from);
    assert.deepEqual(
      yearly.map((d) => d.toISOString()),
      ['2027-01-01T00:00:00.000Z', '2028-01-01T00:00:00.000Z'],
    );
  });

  it('handles leap day (Feb 29) including century non-leap year 2100', () => {
    const runs = nextRuns('0 12 29 2 *', 3, '2095-01-01T00:00:00Z');
    assert.deepEqual(
      runs.map((d) => d.toISOString()),
      [
        '2096-02-29T12:00:00.000Z',
        '2104-02-29T12:00:00.000Z',
        '2108-02-29T12:00:00.000Z',
      ],
    );
  });

  it('applies standard Vixie OR semantics when both day-of-month and day-of-week are restricted', () => {
    // Jan 2026: Jan 1 is Thursday, Jan 2 is Friday, Jan 9 is Friday, Jan 15 is Thursday
    const runs = nextRuns('0 9 15 * FRI', 4, '2026-01-01T00:00:00Z');
    assert.deepEqual(
      runs.map((d) => d.toISOString()),
      [
        '2026-01-02T09:00:00.000Z', // Friday
        '2026-01-09T09:00:00.000Z', // Friday
        '2026-01-15T09:00:00.000Z', // 15th (Thursday)
        '2026-01-16T09:00:00.000Z', // Friday
      ],
    );
  });

  it('terminates quickly and returns empty array for impossible calendar dates (Feb 31)', () => {
    const runs = nextRuns('0 0 31 2 *', 3, '2026-01-01T00:00:00Z');
    assert.deepEqual(runs, []);
    assert.equal(nextRun('0 0 31 2 *', '2026-01-01T00:00:00Z'), null);
  });

  it('handles count = 0 and validates count and fromDate', () => {
    assert.deepEqual(nextRuns('* * * * *', 0, '2026-01-01T00:00:00Z'), []);
    assert.throws(() => nextRuns('* * * * *', -1), RangeError);
    assert.throws(() => nextRuns('* * * * *', 1.5), RangeError);
    assert.throws(() => nextRuns('* * * * *', 3, 'not-a-date'), RangeError);
  });

  it('supports pre-parsed expressions and matchesDate()', () => {
    const parsed = parseCron('30 9 * * MON-FRI');
    const first = nextRun(parsed, '2026-01-02T09:30:00Z'); // Friday 09:30 -> next is Monday Jan 5
    assert.equal(first.toISOString(), '2026-01-05T09:30:00.000Z');
    assert.equal(matchesDate(parsed, first), true);
    assert.equal(matchesDate(parsed, '2026-01-03T09:30:00Z'), false); // Saturday
  });
});

describe('CLI (bin/cronlint.js)', () => {
  it('prints help and version', () => {
    const helpRes = runCli(['--help']);
    assert.equal(helpRes.status, 0);
    assert.match(helpRes.stdout, /Usage:/);

    const verRes = runCli(['--version']);
    assert.equal(verRes.status, 0);
    assert.match(verRes.stdout.trim(), /^\d+\.\d+\.\d+$/);
  });

  it('runs validate in text and JSON modes for valid and invalid inputs', () => {
    const okText = runCli(['validate', '*/5 * * * *']);
    assert.equal(okText.status, 0);
    assert.match(okText.stdout, /Valid cron expression/);

    const okJson = runCli(['validate', '@daily', '--json']);
    assert.equal(okJson.status, 0);
    const parsedOk = JSON.parse(okJson.stdout);
    assert.equal(parsedOk.valid, true);
    assert.equal(parsedOk.macro, '@daily');
    assert.equal(parsedOk.normalized, '0 0 * * *');

    const badText = runCli(['validate', '99 * * * *']);
    assert.equal(badText.status, 1);
    assert.match(badText.stderr, /out of range/i);

    const badJson = runCli(['--json', 'validate', '99 * * * *']);
    assert.equal(badJson.status, 1);
    const parsedBad = JSON.parse(badJson.stdout);
    assert.equal(parsedBad.valid, false);
    assert.equal(parsedBad.field, 'minute');
  });

  it('runs explain in text and JSON modes', () => {
    const textRes = runCli(['explain', '0 9 * * MON-FRI']);
    assert.equal(textRes.status, 0);
    assert.equal(textRes.stdout.trim(), 'At 09:00, Monday through Friday');

    const jsonRes = runCli(['explain', '@monthly', '--json']);
    assert.equal(jsonRes.status, 0);
    const data = JSON.parse(jsonRes.stdout);
    assert.equal(data.normalized, '0 0 1 * *');
    assert.equal(data.description, 'At 00:00, on day 1 of the month');
  });

  it('runs next with --count, --from, and --json', () => {
    const res = runCli([
      'next',
      '0 0 * * *',
      '--count',
      '3',
      '--from',
      '2026-06-01T00:00:00Z',
    ]);
    assert.equal(res.status, 0);
    assert.deepEqual(res.stdout.trim().split(/\r?\n/), [
      '2026-06-02T00:00:00.000Z',
      '2026-06-03T00:00:00.000Z',
      '2026-06-04T00:00:00.000Z',
    ]);

    const jsonRes = runCli([
      'next',
      '*/30 * * * *',
      '--count=2',
      '--from=2026-06-01T10:00:00Z',
      '--json',
    ]);
    assert.equal(jsonRes.status, 0);
    const payload = JSON.parse(jsonRes.stdout);
    assert.equal(payload.count, 2);
    assert.deepEqual(payload.runs, [
      '2026-06-01T10:30:00.000Z',
      '2026-06-01T11:00:00.000Z',
    ]);
  });

  it('exits with code 1 on unknown commands, missing expressions, or invalid flags', () => {
    assert.equal(runCli(['unknown', '* * * * *']).status, 1);
    assert.equal(runCli(['validate']).status, 1);
    assert.equal(runCli(['next', '* * * * *', '--count', 'abc']).status, 1);
    assert.equal(runCli(['next', '* * * * *', '--from', 'invalid-date']).status, 1);
    assert.equal(runCli(['validate', '*', '*', '*', '*', '*']).status, 1);
  });
});
