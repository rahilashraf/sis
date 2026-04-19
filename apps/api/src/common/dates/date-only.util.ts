import { BadRequestException } from '@nestjs/common';

const dateOnlyPattern = /^(\d{4})-(\d{2})-(\d{2})$/;

function formatDateOnlyFromParts(parts: { year: number; month: number; day: number }) {
  const month = `${parts.month}`.padStart(2, '0');
  const day = `${parts.day}`.padStart(2, '0');
  return `${parts.year}-${month}-${day}`;
}

function parseDateOnlyParts(value: string) {
  const match = dateOnlyPattern.exec(value);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function toUtcDate(parts: { year: number; month: number; day: number }) {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

function extractDateOnlyFromDate(value: Date) {
  return {
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    day: value.getUTCDate(),
  };
}

export function parseDateOnlyOrThrow(value: string, fieldLabel: string) {
  const normalized = value.trim();
  const dateOnlyParts = parseDateOnlyParts(normalized);
  if (dateOnlyParts) {
    return toUtcDate(dateOnlyParts);
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`${fieldLabel} must be a valid date`);
  }

  return toUtcDate(extractDateOnlyFromDate(parsed));
}

export function parseDateOnlyOrNull(value: string | null | undefined, fieldLabel: string) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  return parseDateOnlyOrThrow(normalized, fieldLabel);
}

export function formatDateOnly(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null;
    }

    return formatDateOnlyFromParts(extractDateOnlyFromDate(value));
  }

  const parsedDateOnly = parseDateOnlyParts(value.trim());
  if (parsedDateOnly) {
    return formatDateOnlyFromParts(parsedDateOnly);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return formatDateOnlyFromParts(extractDateOnlyFromDate(parsed));
}
