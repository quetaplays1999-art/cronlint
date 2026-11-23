export declare const MACROS: Readonly<{
  '@yearly': '0 0 1 1 *';
  '@annually': '0 0 1 1 *';
  '@monthly': '0 0 1 * *';
  '@weekly': '0 0 * * 0';
  '@daily': '0 0 * * *';
  '@midnight': '0 0 * * *';
  '@hourly': '0 * * * *';
}>;

export declare const MONTH_NAMES: Readonly<Record<string, number>>;
export declare const WEEKDAY_NAMES: Readonly<Record<string, number>>;

export type CronFieldName = 'minute' | 'hour' | 'dayOfMonth' | 'month' | 'dayOfWeek';

export type CronSegment =
  | { type: 'wildcard' }
  | { type: 'value'; value: number }
  | { type: 'range'; start: number; end: number; rawEnd?: number }
  | { type: 'step'; start: number; end: number; step: number; wildcardBase: boolean; rawEnd?: number };

export interface ParsedCronField {
  raw: string;
  values: number[];
  wildcard: boolean;
  segments: CronSegment[];
}

export interface ParsedCron {
  expression: string;
  macro: string | null;
  normalized: string;
  fields: {
    minute: ParsedCronField;
    hour: ParsedCronField;
    dayOfMonth: ParsedCronField;
    month: ParsedCronField;
    dayOfWeek: ParsedCronField;
  };
}

export type ValidationResult =
  | { valid: true; parsed: ParsedCron }
  | { valid: false; error: string; field: string | null };

export declare class CronParseError extends Error {
  readonly field: string | null;
  readonly value: string | null;
  readonly expression: string | null;

  constructor(
    message: string,
    details?: {
      field?: string | null;
      value?: string | null;
      expression?: string | null;
    },
  );
}

/**
 * Parse and validate a standard 5-field cron expression or macro.
 * Throws `CronParseError` on invalid input.
 */
export declare function parseCron(expression: string): ParsedCron;

/**
 * Validate a cron expression without throwing.
 */
export declare function validateCron(expression: string): ValidationResult;

/**
 * Return a human-readable English description of a valid cron expression.
 */
export declare function explainCron(input: string | ParsedCron): string;

/**
 * Compute the next `count` UTC execution timestamps strictly after `fromDate`.
 */
export declare function nextRuns(
  expr: string | ParsedCron,
  count?: number,
  fromDate?: Date | string | number,
): Date[];

/**
 * Compute the next single UTC execution timestamp strictly after `fromDate`, or `null` if none exists.
 */
export declare function nextRun(
  expr: string | ParsedCron,
  fromDate?: Date | string | number,
): Date | null;

/**
 * Return true if the given UTC date matches the cron expression (ignoring seconds/milliseconds).
 */
export declare function matchesDate(
  expr: string | ParsedCron,
  date: Date | string | number,
): boolean;
