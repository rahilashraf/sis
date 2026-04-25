export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function getDisplayText(value: unknown, fallback = "—") {
  if (typeof value === "string") {
    const trimmedValue = value.trim();
    return trimmedValue || fallback;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return fallback;
}

export function roundDisplayedPercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }

  return Math.round(value);
}

export function formatDisplayedPercent(
  value: number | null | undefined,
  fallback = "—",
) {
  const rounded = roundDisplayedPercent(value);
  return rounded === null ? fallback : `${rounded}%`;
}

function formatWords(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((segment) => segment[0]?.toUpperCase() + segment.slice(1))
    .join(" ");
}

export function formatRoleLabel(role: string) {
  return formatWords(role);
}

export function formatAttendanceStatusLabel(status: string) {
  return formatWords(status);
}

export function getInitials(firstName?: string, lastName?: string) {
  const initials = `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.trim();

  return initials || "U";
}

function parseDateValue(value: unknown) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value !== "string") {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day, 12);
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

export function getLocalDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function formatDateLabel(
  value: unknown,
  options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  },
  fallback = "—",
) {
  const parsed = parseDateValue(value);

  if (!parsed) {
    return fallback;
  }

  return new Intl.DateTimeFormat(undefined, options).format(parsed);
}

export function formatTimeLabel(
  value: unknown,
  options: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
  },
  fallback = "—",
) {
  const parsed = parseDateValue(value);

  if (!parsed) {
    return fallback;
  }

  return new Intl.DateTimeFormat(undefined, options).format(parsed);
}

export function formatDateTimeLabel(
  value: unknown,
  options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  },
  fallback = "—",
) {
  const parsed = parseDateValue(value);

  if (!parsed) {
    return fallback;
  }

  return new Intl.DateTimeFormat(undefined, options).format(parsed);
}
