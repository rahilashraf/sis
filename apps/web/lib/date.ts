const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function toUtcDateParts(date: Date) {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function toDateOnlyString(parts: { year: number; month: number; day: number }) {
  const month = `${parts.month}`.padStart(2, "0");
  const day = `${parts.day}`.padStart(2, "0");
  return `${parts.year}-${month}-${day}`;
}

function parseDateOnlyParts(value: string) {
  const match = DATE_ONLY_PATTERN.exec(value);
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

export function normalizeDateOnlyPayload(
  value: string | Date | null | undefined,
) {
  if (!value) {
    return "";
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return "";
    }

    return toDateOnlyString(toUtcDateParts(value));
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const dateOnlyParts = parseDateOnlyParts(trimmed);
  if (dateOnlyParts) {
    return toDateOnlyString(dateOnlyParts);
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return toDateOnlyString(toUtcDateParts(parsed));
}

export function parseDateOnly(value: string | Date | null | undefined) {
  const normalized = normalizeDateOnlyPayload(value);
  if (!normalized) {
    return null;
  }

  const [year, month, day] = normalized.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

export function formatDateOnly(
  value: string | Date | null | undefined,
  fallback = "—",
) {
  const parsed = parseDateOnly(value);
  if (!parsed) {
    return fallback;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

export function dateOnlyFromDate(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}
