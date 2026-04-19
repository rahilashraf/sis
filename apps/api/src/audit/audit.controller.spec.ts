import { ForbiddenException } from '@nestjs/common';
import { AuditLogSeverity, UserRole } from '@prisma/client';
import { AuditController } from './audit.controller';
import type { AuthenticatedUser } from '../common/auth/auth-user';

describe('AuditController', () => {
  let controller: AuditController;
  let auditService: {
    list: jest.Mock;
    summary: jest.Mock;
    exportPdf: jest.Mock;
    exportCsv: jest.Mock;
    purge: jest.Mock;
  };

  beforeEach(() => {
    auditService = {
      list: jest.fn(),
      summary: jest.fn(),
      exportPdf: jest.fn(),
      exportCsv: jest.fn(),
      purge: jest.fn(),
    };

    controller = new AuditController(auditService as any);
  });

  describe('list', () => {
    it('should allow OWNER role', async () => {
      const user: AuthenticatedUser = {
        id: 'user-123',
        role: UserRole.OWNER,
        memberships: [],
      };
      const query = { page: '1', pageSize: '50' };

      auditService.list.mockResolvedValue({
        rows: [],
        total: 0,
        page: 1,
        pageSize: 50,
        fromDate: new Date(),
        toDate: new Date(),
      });

      const result = await controller.list({ user } as any, query as any);

      expect(auditService.list).toHaveBeenCalledWith(user, query);
      expect(result.rows).toEqual([]);
    });

    it('should call audit service with correct parameters', async () => {
      const user: AuthenticatedUser = {
        id: 'user-123',
        role: UserRole.OWNER,
        memberships: [],
      };
      const query = {
        page: '1',
        pageSize: '50',
        fromDate: '2024-01-01',
        toDate: '2024-01-31',
      };

      auditService.list.mockResolvedValue({
        rows: [],
        total: 0,
        page: 1,
        pageSize: 50,
        fromDate: new Date(),
        toDate: new Date(),
      });

      await controller.list({ user } as any, query as any);

      expect(auditService.list).toHaveBeenCalledWith(user, query);
    });
  });

  describe('summary', () => {
    it('should return summary counts', async () => {
      const user: AuthenticatedUser = {
        id: 'user-123',
        role: UserRole.OWNER,
        memberships: [],
      };
      const query = {};

      auditService.summary.mockResolvedValue({
        total: 100,
        byAction: { CREATE: 50, UPDATE: 30, DELETE: 20 },
        byEntity: { User: 40, Attendance: 60 },
        bySeverity: {
          INFO: 70,
          WARNING: 20,
          HIGH: 8,
          CRITICAL: 2,
        },
      });

      const result = await controller.summary({ user } as any, query as any);

      expect(result.total).toBe(100);
      expect(result.byAction.CREATE).toBe(50);
    });
  });

  describe('exportPdf', () => {
    it('should export logs as PDF', async () => {
      const user: AuthenticatedUser = {
        id: 'user-123',
        role: UserRole.OWNER,
        memberships: [],
      };
      const query = {};

      auditService.exportPdf.mockResolvedValue({
        data: Buffer.from('pdf-content'),
        contentType: 'application/pdf',
        fileName: 'audit-logs.pdf',
      });

      const res = {
        setHeader: jest.fn(),
        send: jest.fn().mockReturnValue('pdf-sent'),
      };

      const result = await controller.exportPdf(
        { user } as any,
        query as any,
        res as any,
      );

      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/pdf',
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="audit-logs.pdf"',
      );
      expect(res.send).toHaveBeenCalled();
    });
  });

  describe('exportCsv', () => {
    it('should export logs as CSV', async () => {
      const user: AuthenticatedUser = {
        id: 'user-123',
        role: UserRole.OWNER,
        memberships: [],
      };
      const query = {};

      auditService.exportCsv.mockResolvedValue({
        data: Buffer.from('csv-content'),
        contentType: 'text/csv',
        fileName: 'audit-logs.csv',
      });

      const res = {
        setHeader: jest.fn(),
        send: jest.fn().mockReturnValue('csv-sent'),
      };

      const result = await controller.exportCsv(
        { user } as any,
        query as any,
        res as any,
      );

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="audit-logs.csv"',
      );
      expect(res.send).toHaveBeenCalled();
    });
  });

  describe('purge', () => {
    it('should purge logs with confirmation', async () => {
      const user: AuthenticatedUser = {
        id: 'user-123',
        role: UserRole.OWNER,
        memberships: [],
      };
      const body = {
        fromDate: '2024-01-01',
        toDate: '2024-01-31',
        confirmation: 'PURGE AUDIT LOGS',
      };

      auditService.purge.mockResolvedValue({
        success: true,
        purgedCount: 50,
      });

      const result = await controller.purge({ user } as any, body);

      expect(auditService.purge).toHaveBeenCalledWith(user, body);
      expect(result.success).toBe(true);
      expect(result.purgedCount).toBe(50);
    });
  });
});
