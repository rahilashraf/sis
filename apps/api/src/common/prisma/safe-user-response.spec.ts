import { Prisma } from '@prisma/client';
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

  it('serializes Prisma Decimal values to strings', () => {
    const sanitized = sanitizeResponse({
      id: 'uniform-1',
      price: new Prisma.Decimal('24.50'),
      nested: {
        amount: new Prisma.Decimal('12.00'),
      },
    });

    expect(sanitized).toEqual({
      id: 'uniform-1',
      price: '24.5',
      nested: {
        amount: '12',
      },
    });
  });
});
