const REDACTED_VALUE = '[REDACTED]';

export type AuditFieldChange = {
  field: string;
  from: unknown;
  to: unknown;
};

export type AuditDiff = {
  fields: AuditFieldChange[];
};

function normalize(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalize(entry));
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, child]) => [key, normalize(child)] as const)
      .sort(([left], [right]) => left.localeCompare(right));

    return Object.fromEntries(entries);
  }

  return value;
}

function areEqual(left: unknown, right: unknown) {
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

export function buildAuditDiff(options: {
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  fields?: string[];
  redactedFields?: string[];
  maxFields?: number;
}): AuditDiff | null {
  const before = options.before ?? {};
  const after = options.after ?? {};
  const fieldSet = options.fields
    ? [...options.fields]
    : [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const redactedFields = new Set(options.redactedFields ?? []);
  const maxFields = options.maxFields ?? 25;

  const changes: AuditFieldChange[] = [];

  for (const field of fieldSet) {
    const fromValue = before[field];
    const toValue = after[field];

    if (areEqual(fromValue, toValue)) {
      continue;
    }

    if (redactedFields.has(field)) {
      changes.push({
        field,
        from: REDACTED_VALUE,
        to: REDACTED_VALUE,
      });
    } else {
      changes.push({
        field,
        from: normalize(fromValue),
        to: normalize(toValue),
      });
    }

    if (changes.length >= maxFields) {
      break;
    }
  }

  if (changes.length === 0) {
    return null;
  }

  return {
    fields: changes,
  };
}
