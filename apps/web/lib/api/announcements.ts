import { apiFetch } from './client';

export type AnnouncementTargetType =
  | 'SCHOOL'
  | 'GRADE_LEVEL'
  | 'CLASS'
  | 'STUDENT';

export type AnnouncementAudience =
  | 'PARENTS'
  | 'STUDENTS'
  | 'PARENTS_AND_STUDENTS';

export type AnnouncementStatusFilter = 'ACTIVE' | 'EXPIRED' | 'ALL';

export type AnnouncementTarget = {
  id: string;
  targetType: AnnouncementTargetType;
  gradeLevelId: string | null;
  classId: string | null;
  studentId: string | null;
};

export type AnnouncementAuthor = {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
};

export type Announcement = {
  id: string;
  schoolId: string;
  authorId: string;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  isPinned: boolean;
  publishedAt: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  author: AnnouncementAuthor;
  targets: AnnouncementTarget[];
};

export type AnnouncementUpsertInput = {
  title: string;
  body: string;
  audience: AnnouncementAudience;
  isPinned?: boolean;
  expiresAt?: string | null;
  includeWholeSchool?: boolean;
  gradeLevelIds?: string[];
  classIds?: string[];
  studentIds?: string[];
};

export type CreateAnnouncementInput = AnnouncementUpsertInput & {
  schoolId?: string;
};

export type UpdateAnnouncementInput = Partial<AnnouncementUpsertInput>;

export function createAnnouncement(input: CreateAnnouncementInput) {
  return apiFetch<Announcement>('/announcements', {
    method: 'POST',
    json: input,
  });
}

export function listAnnouncements(options?: {
  schoolId?: string;
  audience?: AnnouncementAudience;
  classId?: string;
  gradeLevelId?: string;
  pinned?: boolean;
  status?: AnnouncementStatusFilter;
  limit?: number;
}) {
  const query = new URLSearchParams();

  if (options?.schoolId) {
    query.set('schoolId', options.schoolId);
  }

  if (options?.audience) {
    query.set('audience', options.audience);
  }

  if (options?.classId) {
    query.set('classId', options.classId);
  }

  if (options?.gradeLevelId) {
    query.set('gradeLevelId', options.gradeLevelId);
  }

  if (options?.pinned !== undefined) {
    query.set('pinned', options.pinned ? 'true' : 'false');
  }

  if (options?.status) {
    query.set('status', options.status);
  }

  if (options?.limit) {
    query.set('limit', String(options.limit));
  }

  return apiFetch<Announcement[]>(
    `/announcements${query.size ? `?${query.toString()}` : ''}`,
  );
}

export function getAnnouncementById(announcementId: string) {
  return apiFetch<Announcement>(`/announcements/${announcementId}`);
}

export function updateAnnouncement(
  announcementId: string,
  input: UpdateAnnouncementInput,
) {
  return apiFetch<Announcement>(`/announcements/${announcementId}`, {
    method: 'PATCH',
    json: input,
  });
}

export function deleteAnnouncement(announcementId: string) {
  return apiFetch<{ success: boolean; id: string }>(
    `/announcements/${announcementId}`,
    {
      method: 'DELETE',
    },
  );
}
