import { FormFieldType, NotificationType, UserRole } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { FormsService } from './forms.service';

describe('FormsService reminders', () => {
  let service: FormsService;
  let prisma: {
    form: { create: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    formField: { deleteMany: jest.Mock; createMany: jest.Mock };
    formResponse: { findFirst: jest.Mock };
    studentParentLink: { findMany: jest.Mock };
    notification: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let auditService: { log: jest.Mock };
  let notificationsService: { createMany: jest.Mock };

  beforeEach(() => {
    prisma = {
      form: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      formField: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      formResponse: {
        findFirst: jest.fn(),
      },
      studentParentLink: {
        findMany: jest.fn(),
      },
      notification: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    auditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };
    notificationsService = {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    };

    service = new FormsService(
      prisma as never,
      auditService as unknown as AuditService,
      notificationsService as unknown as NotificationsService,
    );
  });

  it('creates FORM_REMINDER notifications for open forms without duplicate recipients', async () => {
    prisma.form.create.mockResolvedValue({
      id: 'form-1',
      schoolId: 'school-1',
      title: 'Medical Consent',
      description: null,
      isActive: true,
      opensAt: null,
      closesAt: null,
      requiresStudentContext: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      fields: [],
    });
    prisma.studentParentLink.findMany.mockResolvedValue([
      { parentId: 'parent-1' },
      { parentId: 'parent-2' },
      { parentId: 'parent-2' },
    ]);
    prisma.notification.findMany.mockResolvedValue([
      { recipientUserId: 'parent-1' },
    ]);

    await service.create(
      { id: 'owner-1', role: UserRole.OWNER, memberships: [] } as never,
      {
        schoolId: 'school-1',
        title: 'Medical Consent',
        fields: [
          {
            key: 'SIGNATURE',
            label: 'Signature',
            type: FormFieldType.SHORT_TEXT,
          },
        ],
      },
    );

    expect(notificationsService.createMany).toHaveBeenCalledWith([
      expect.objectContaining({
        recipientUserId: 'parent-2',
        type: NotificationType.FORM_REMINDER,
        entityType: 'Form',
        entityId: 'form-1',
      }),
    ]);
  });

  it('sends reminder when update transitions form from closed to open', async () => {
    prisma.form.findUnique
      .mockResolvedValueOnce({
        id: 'form-1',
        schoolId: 'school-1',
        title: 'Emergency Contacts',
        description: null,
        isActive: true,
        opensAt: new Date('2099-01-01T00:00:00.000Z'),
        closesAt: null,
        requiresStudentContext: false,
        _count: { responses: 0 },
      })
      .mockResolvedValueOnce({
        id: 'form-1',
        schoolId: 'school-1',
        title: 'Emergency Contacts',
        description: null,
        isActive: true,
        opensAt: new Date('2020-01-01T00:00:00.000Z'),
        closesAt: null,
        requiresStudentContext: false,
        fields: [],
      });

    prisma.$transaction.mockImplementation(async (callback: any) => callback(prisma));
    prisma.studentParentLink.findMany.mockResolvedValue([{ parentId: 'parent-1' }]);
    prisma.notification.findMany.mockResolvedValue([]);

    await service.update(
      { id: 'owner-1', role: UserRole.OWNER, memberships: [] } as never,
      'form-1',
      {
        opensAt: '2020-01-01T00:00:00.000Z',
      },
    );

    expect(notificationsService.createMany).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          recipientUserId: 'parent-1',
          type: NotificationType.FORM_REMINDER,
          entityId: 'form-1',
        }),
      ]),
    );
  });
});
