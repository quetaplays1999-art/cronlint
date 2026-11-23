#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { CronParseError, explainCron, nextRuns, parseCron } from '../src/index.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const HELP_TEXT = `cronlint v${pkg.version} — Validate, explain, and preview cron schedules

Usage:
  cronlint validate "<expr>" [--json]
  cronlint explain "<expr>" [--json]
  cronlint next "<expr>" [--count <n>] [--from <iso-date>] [--json]

Options:
  -n, --count <n>      Number of upcoming runs to compute (default: 5)
  --from <iso-date>    Reference UTC timestamp for "next" (default: now)
  --json               Output machine-readable JSON
  -h, --help           Show this help message
  -v, --version        Show version number

Examples:
  cronlint validate "*/15 9-17 * * MON-FRI"
  cronlint explain "0 9 * * 1-5"
  cronlint next "@daily" --count 3 --json
`;

function parseArgs(argv) {
  const positionals = [];
  let json = false;
  let help = false;
  let version = false;
  let count = 5;
  let from = undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg === '--version' || arg === '-v') {
      version = true;
    } else if (arg === '--json') {
      json = true;
    } else if (arg === '--count' || arg === '-n') {
      const nextVal = argv[++i];
      if (nextVal === undefined) {
        return { error: `Missing value for ${arg}` };
      }
      if (!/^\d+$/.test(nextVal)) {
        return { error: `Invalid count "${nextVal}" (must be a non-negative integer)` };
      }
      count = Number.parseInt(nextVal, 10);
    } else if (arg.startsWith('--count=')) {
      const val = arg.slice('--count='.length);
      if (!/^\d+$/.test(val)) {
        return { error: `Invalid count "${val}" (must be a non-negative integer)` };
      }
      count = Number.parseInt(val, 10);
    } else if (arg.startsWith('-n=')) {
      const val = arg.slice('-n='.length);
      if (!/^\d+$/.test(val)) {
        return { error: `Invalid count "${val}" (must be a non-negative integer)` };
      }
      count = Number.parseInt(val, 10);
    } else if (arg === '--from') {
      const nextVal = argv[++i];
      if (nextVal === undefined) {
        return { error: 'Missing value for --from' };
      }
      from = nextVal;
    } else if (arg.startsWith('--from=')) {
      from = arg.slice('--from='.length);
    } else if (arg.startsWith('-') && positionals.length === 0) {
      return { error: `Unknown option "${arg}"` };
    } else if (arg.startsWith('--')) {
      return { error: `Unknown option "${arg}"` };
    } else {
      positionals.push(arg);
    }
  }

  return { positionals, json, help, version, count, from };
}

function outputError(message, { json, extra = {} }) {
  if (json) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: message, ...extra }, null, 2)}\n`);
  } else {
    process.stderr.write(`Error: ${message}\n`);
  }
  process.exitCode = 1;
}

function main() {
  const parsedArgs = parseArgs(process.argv.slice(2));
  if (parsedArgs.error) {
    outputError(parsedArgs.error, { json: process.argv.includes('--json') });
    return;
  }

  const { positionals, json, help, version, count, from } = parsedArgs;

  if (version) {
    process.stdout.write(`${pkg.version}\n`);
    return;
  }

  if (help || positionals.length === 0 || positionals[0] === 'help') {
    process.stdout.write(HELP_TEXT);
    return;
  }

  const [command, expression, ...rest] = positionals;

  if (!['validate', 'explain', 'next'].includes(command)) {
    outputError(`Unknown command "${command}". Run "cronlint --help" for usage.`, { json });
    return;
  }

  if (expression === undefined) {
    outputError(`Missing cron expression for "${command}" command.`, { json });
    return;
  }

  if (rest.length > 0) {
    outputError(
      `Unexpected extra arguments (${rest.join(' ')}). Quote your cron expression, e.g. cronlint ${command} "*/5 * * * *".`,
      { json },
    );
    return;
  }

  try {
    if (command === 'validate') {
      const parsed = parseCron(expression);
      if (json) {
        process.stdout.write(
          `${JSON.stringify(
            {
              valid: true,
              expression: parsed.expression,
              macro: parsed.macro,
              normalized: parsed.normalized,
              fields: {
                minute: parsed.fields.minute.values,
                hour: parsed.fields.hour.values,
                dayOfMonth: parsed.fields.dayOfMonth.values,
                month: parsed.fields.month.values,
                dayOfWeek: parsed.fields.dayOfWeek.values,
              },
            },
            null,
            2,
          )}\n`,
        );
      } else {
        const suffix = parsed.macro ? ` (${parsed.normalized})` : '';
        process.stdout.write(`Valid cron expression: ${parsed.expression}${suffix}\n`);
      }
      return;
    }

    if (command === 'explain') {
      const parsed = parseCron(expression);
      const description = explainCron(parsed);
      if (json) {
        process.stdout.write(
          `${JSON.stringify(
            {
              expression: parsed.expression,
              normalized: parsed.normalized,
              description,
            },
            null,
            2,
          )}\n`,
        );
      } else {
        process.stdout.write(`${description}\n`);
      }
      return;
    }

    if (command === 'next') {
      const parsed = parseCron(expression);
      const refDate = from !== undefined ? new Date(from) : new Date();
      if (Number.isNaN(refDate.getTime())) {
        outputError(`Invalid --from date "${from}"`, { json });
        return;
      }
      const runs = nextRuns(parsed, count, refDate);
      const isoRuns = runs.map((d) => d.toISOString());

      if (json) {
        process.stdout.write(
          `${JSON.stringify(
            {
              expression: parsed.expression,
              normalized: parsed.normalized,
              from: refDate.toISOString(),
              count,
              runs: isoRuns,
            },
            null,
            2,
          )}\n`,
        );
      } else if (isoRuns.length === 0) {
        process.stdout.write('No upcoming runs found.\n');
      } else {
        process.stdout.write(`${isoRuns.join('\n')}\n`);
      }
    }
  } catch (err) {
    if (err instanceof CronParseError) {
      if (command === 'validate' && json) {
        process.stdout.write(
          `${JSON.stringify(
            {
              valid: false,
              expression,
              error: err.message,
              field: err.field,
            },
            null,
            2,
          )}\n`,
        );
        process.exitCode = 1;
        return;
      }
      outputError(err.message, {
        json,
        extra: { expression, field: err.field },
      });
      return;
    }
    outputError(err instanceof Error ? err.message : String(err), { json });
  }
}

main();
