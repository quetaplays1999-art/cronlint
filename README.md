# cronlint

[![CI](https://github.com/quetaplays1999-art/cronlint/actions/workflows/ci.yml/badge.svg)](https://github.com/quetaplays1999-art/cronlint/actions/workflows/ci.yml)
[![Node.js >= 18.18.0](https://img.shields.io/badge/node-%3E%3D18.18.0-brightgreen.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

A zero-dependency Node.js ESM CLI and library to **validate**, **explain in plain English**, and **preview upcoming UTC run times** for standard 5-field cron expressions and macros.

## Features

- **Zero dependencies** — pure modern Node.js ESM (`>=18.18.0`), no runtime packages.
- **Strict validation** — clear, field-specific error messages for out-of-range values, bad steps, reversed ranges, and typos.
- **Full 5-field syntax + macros** — wildcards (`*`), lists (`,`), ranges (`-`), steps (`/`), month names (`JAN`–`DEC`), weekday names (`SUN`–`SAT`, plus `7` for Sunday), and `@yearly`, `@annually`, `@monthly`, `@weekly`, `@daily`, `@midnight`, `@hourly`.
- **Human-readable explanations** — turns cryptic schedules into clear English (including Vixie cron day-of-month OR day-of-week semantics).
- **Fast UTC schedule calculator** — computes upcoming UTC execution timestamps cleanly across month rollovers, leap years, and impossible calendar dates (e.g. Feb 31).
- **CLI & Programmatic API** — supports `--json` output for scripting and ships with TypeScript declarations (`.d.ts`).

## Installation

### Global CLI

```bash
npm install -g cronlint-cli
```

Or run without installing:

```bash
npx cronlint-cli explain "*/15 9-17 * * MON-FRI"
```

### As a library

```bash
npm install cronlint-cli
```

## CLI Usage

```text
cronlint validate "<expr>" [--json]
cronlint explain "<expr>" [--json]
cronlint next "<expr>" [--count <n>] [--from <iso-date>] [--json]
```

### Examples

```bash
# Validate an expression (exit code 0 if valid, 1 if invalid)
cronlint validate "*/15 9-17 * * MON-FRI"
# Valid cron expression: */15 9-17 * * MON-FRI

# Validate with structured JSON output
cronlint validate "@daily" --json

# Explain a cron expression in plain English
cronlint explain "30 9 * * MON-FRI"
# At 09:30, Monday through Friday

# Preview the next 5 UTC execution times
cronlint next "0 9 * * MON-FRI" --count 5

# Preview from a fixed UTC reference timestamp in JSON
cronlint next "0 0 1 * *" --count 3 --from 2026-01-01T00:00:00Z --json
```

## Library API

```js
import {
  parseCron,
  validateCron,
  explainCron,
  nextRuns,
  nextRun,
  matchesDate,
} from 'cronlint-cli';

// Validate without throwing
const check = validateCron('*/15 9-17 * * MON-FRI');
if (check.valid) {
  console.log(check.parsed.fields.hour.values); // [9, 10, 11, 12, 13, 14, 15, 16, 17]
}

// Parse (throws CronParseError on invalid input)
const parsed = parseCron('@weekly');
console.log(parsed.normalized); // "0 0 * * 0"

// Human-readable English description
console.log(explainCron('0 9 13 * FRI'));
// "At 09:00, on day 13 of the month or on Friday"

// Compute next N UTC timestamps strictly after a reference date
const runs = nextRuns('0 12 29 2 *', 2, new Date('2026-01-01T00:00:00Z'));
console.log(runs.map((d) => d.toISOString()));
// ["2028-02-29T12:00:00.000Z", "2032-02-29T12:00:00.000Z"]

// Check whether a specific UTC Date matches an expression
console.log(matchesDate('@daily', new Date('2026-05-01T00:00:00Z'))); // true

// Single next run helper (returns Date | null)
console.log(nextRun('0 0 31 2 *')); // null (February 31 never occurs)
```

## Supported Syntax

| Field | Allowed Values | Special Characters |
| --- | --- | --- |
| Minute | `0`–`59` | `*` `,` `-` `/` |
| Hour | `0`–`23` | `*` `,` `-` `/` |
| Day of Month | `1`–`31` | `*` `,` `-` `/` |
| Month | `1`–`12` or `JAN`–`DEC` | `*` `,` `-` `/` |
| Day of Week | `0`–`7` (`0` and `7` = Sunday) or `SUN`–`SAT` | `*` `,` `-` `/` |

### Macros

| Macro | Equivalent | Description |
| --- | --- | --- |
| `@yearly` / `@annually` | `0 0 1 1 *` | Once a year at 00:00 on January 1 |
| `@monthly` | `0 0 1 * *` | Once a month at 00:00 on day 1 |
| `@weekly` | `0 0 * * 0` | Once a week at 00:00 on Sunday |
| `@daily` / `@midnight` | `0 0 * * *` | Once a day at 00:00 |
| `@hourly` | `0 * * * *` | Once an hour at minute 0 |

## Development

```bash
git clone https://github.com/quetaplays1999-art/cronlint.git
cd cronlint
npm test
```

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening an issue or pull request.

## License

MIT © 2026 [quetaplays1999-art](https://github.com/quetaplays1999-art)
