import { AuditService } from './audit.service';

describe('AuditService', () => {
  const originalEnv = process.env;

  let service: AuditService;
  let prisma: {
    user: {
      findUnique: jest.Mock;
    };
    auditLog: {
      create: jest.Mock;
      aggregate: jest.Mock;
      deleteMany: jest.Mock;
    };
    auditArchiveHistory: {
      create: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let tx: {
    auditLog: {
      deleteMany: jest.Mock;
      create: jest.Mock;
    };
    auditArchiveHistory: {
      create: jest.Mock;
    };
  };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'development',
    };

    tx = {
      auditLog: {
        deleteMany: jest.fn(),
        create: jest.fn(),
      },
      auditArchiveHistory: {
        create: jest.fn(),
      },
    };

    prisma = {
      user: {
        findUnique: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
        aggregate: jest.fn(),
        deleteMany: jest.fn(),
      },
      auditArchiveHistory: {
        create: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation(async (arg: unknown) => {
        if (typeof arg === 'function') {
          return arg(tx);
        }

        return arg;
      }),
    };

    service = new AuditService(prisma as never);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.useRealTimers();
  });

  it('skips audit writes when audit logging is disabled', async () => {
    process.env.AUDIT_LOGS_ENABLED = 'false';
    process.env.AUDIT_LOG_LEVEL = 'verbose';

    await service.log({
      entityType: 'AttendanceSession',
      action: 'UPDATE',
      summary: 'Updated attendance session',
    });

    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('logs critical actions when audit level is critical', async () => {
    process.env.AUDIT_LOGS_ENABLED = 'true';
    process.env.AUDIT_LOG_LEVEL = 'critical';

    await service.log({
      entityType: 'AttendanceSession',
      action: 'UPDATE',
      summary: 'Updated attendance session',
    });

    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('skips non-critical actions when audit level is critical', async () => {
    process.env.AUDIT_LOGS_ENABLED = 'true';
    process.env.AUDIT_LOG_LEVEL = 'critical';

    await service.log({
      entityType: 'Class',
      action: 'UPDATE',
      summary: 'Updated class title',
    });

    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('retention cleanup deletes audit rows older than configured retention days', async () => {
    jest
      .useFakeTimers()
      .setSystemTime(new Date('2026-04-27T00:00:00.000Z').getTime());

    process.env.AUDIT_LOGS_ENABLED = 'true';
    process.env.AUDIT_LOG_LEVEL = 'critical';
    process.env.AUDIT_LOG_RETENTION_DAYS = '30';

    prisma.auditLog.aggregate.mockResolvedValue({
      _count: { _all: 2 },
      _min: { createdAt: new Date('2026-03-01T00:00:00.000Z') },
      _max: { createdAt: new Date('2026-03-15T00:00:00.000Z') },
    });
    tx.auditLog.deleteMany.mockResolvedValue({ count: 2 });
    tx.auditArchiveHistory.create.mockResolvedValue({});
    tx.auditLog.create.mockResolvedValue({});

    await service.cleanupExpiredLogs();

    expect(tx.auditLog.deleteMany).toHaveBeenCalledWith({
      where: {
        createdAt: {
          lt: new Date('2026-03-28T00:00:00.000Z'),
        },
      },
    });
    expect(tx.auditArchiveHistory.create).toHaveBeenCalled();
  });
});
