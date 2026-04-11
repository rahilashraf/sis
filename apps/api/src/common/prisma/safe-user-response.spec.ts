import { sanitizeResponse } from './safe-user-response';

describe('sanitizeResponse', () => {
  it('preserves Date values while stripping password hashes', () => {
    const startDate = new Date('2025-09-01T00:00:00.000Z');
    const endDate = new Date('2026-06-30T00:00:00.000Z');

    const sanitized = sanitizeResponse({
      id: 'year-1',
      startDate,
      endDate,
      nested: {
        passwordHash: 'secret',
        createdAt: startDate,
      },
    });

    expect(sanitized).toEqual({
      id: 'year-1',
      startDate,
      endDate,
      nested: {
        createdAt: startDate,
      },
    });
    expect(sanitized.startDate).toBeInstanceOf(Date);
    expect(sanitized.endDate).toBeInstanceOf(Date);
  });
});
