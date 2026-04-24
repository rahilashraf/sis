import { apiFetch } from './client';

export type InterviewSlotStatus = 'AVAILABLE' | 'BOOKED' | 'CANCELLED';

export type InterviewEvent = {
  id: string;
  schoolId: string;
  title: string;
  description: string | null;
  bookingOpensAt: string | null;
  bookingClosesAt: string | null;
  startsAt: string;
  endsAt: string;
  isPublished: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  school: {
    id: string;
    name: string;
    shortName: string | null;
  };
  _count: {
    slots: number;
  };
};

export type InterviewSlotAdmin = {
  id: string;
  interviewEventId: string;
  schoolId: string;
  teacherId: string;
  classId: string | null;
  startTime: string;
  endTime: string;
  location: string | null;
  meetingMode: string | null;
  notes: string | null;
  status: InterviewSlotStatus;
  bookedParentId: string | null;
  bookedStudentId: string | null;
  bookedAt: string | null;
  bookingNotes: string | null;
  createdAt: string;
  updatedAt: string;
  interviewEvent: {
    id: string;
    title: string;
    bookingOpensAt: string | null;
    bookingClosesAt: string | null;
    startsAt: string;
    endsAt: string;
    isPublished: boolean;
    isActive: boolean;
  };
  teacher: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    username: string;
    role: string;
  };
  class: {
    id: string;
    name: string;
    subject: string | null;
    isActive: boolean;
  } | null;
  bookedParent: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    username: string;
  } | null;
  bookedStudent: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    username: string;
  } | null;
};

export type InterviewSlotParent = {
  id: string;
  interviewEventId: string;
  schoolId: string;
  teacherId: string;
  classId: string | null;
  startTime: string;
  endTime: string;
  location: string | null;
  meetingMode: string | null;
  notes: string | null;
  status: InterviewSlotStatus;
  bookedParentId: string | null;
  bookedStudentId: string | null;
  bookedAt: string | null;
  bookingNotes: string | null;
  createdAt: string;
  updatedAt: string;
  interviewEvent: {
    id: string;
    title: string;
    bookingOpensAt: string | null;
    bookingClosesAt: string | null;
    startsAt: string;
    endsAt: string;
    isPublished: boolean;
    isActive: boolean;
  };
  teacher: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    username: string;
  };
  class: {
    id: string;
    name: string;
    subject: string | null;
  } | null;
};

export type InterviewSlotTeacher = {
  id: string;
  interviewEventId: string;
  schoolId: string;
  teacherId: string;
  classId: string | null;
  startTime: string;
  endTime: string;
  location: string | null;
  meetingMode: string | null;
  notes: string | null;
  status: InterviewSlotStatus;
  bookedParentId: string | null;
  bookedStudentId: string | null;
  bookedAt: string | null;
  bookingNotes: string | null;
  createdAt: string;
  updatedAt: string;
  interviewEvent: {
    id: string;
    title: string;
    startsAt: string;
    endsAt: string;
    isPublished: boolean;
    isActive: boolean;
  };
  class: {
    id: string;
    name: string;
    subject: string | null;
  } | null;
  bookedParent: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
  } | null;
  bookedStudent: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
  } | null;
};

export type CreateInterviewEventInput = {
  schoolId: string;
  title: string;
  description?: string | null;
  bookingOpensAt?: string;
  bookingClosesAt?: string;
  startsAt: string;
  endsAt: string;
  isPublished?: boolean;
  isActive?: boolean;
};

export type UpdateInterviewEventInput = {
  title?: string;
  description?: string | null;
  bookingOpensAt?: string | null;
  bookingClosesAt?: string | null;
  startsAt?: string;
  endsAt?: string;
  isPublished?: boolean;
  isActive?: boolean;
};

export type CreateInterviewSlotInput = {
  interviewEventId: string;
  teacherId: string;
  classId?: string | null;
  startTime: string;
  endTime: string;
  location?: string | null;
  meetingMode?: string | null;
  notes?: string | null;
};

export type UpdateInterviewSlotInput = {
  teacherId?: string;
  classId?: string | null;
  startTime?: string;
  endTime?: string;
  location?: string | null;
  meetingMode?: string | null;
  notes?: string | null;
  status?: InterviewSlotStatus;
};

export type BulkGenerateInterviewSlotsInput = {
  interviewEventId: string;
  teacherId: string;
  classId?: string | null;
  windowStart: string;
  windowEnd: string;
  slotDurationMinutes: number;
  breakMinutes?: number;
  location?: string | null;
  meetingMode?: string | null;
  notes?: string | null;
};

export type BookInterviewSlotInput = {
  studentId: string;
  bookingNotes?: string | null;
};

export function formatInterviewSlotStatusLabel(status: InterviewSlotStatus) {
  const labels: Record<InterviewSlotStatus, string> = {
    AVAILABLE: 'Available',
    BOOKED: 'Booked',
    CANCELLED: 'Cancelled',
  };

  return labels[status] ?? status;
}

export function listInterviewEvents(options?: {
  schoolId?: string;
  includeInactive?: boolean;
  includeUnpublished?: boolean;
}) {
  const query = new URLSearchParams();

  if (options?.schoolId) {
    query.set('schoolId', options.schoolId);
  }

  if (options?.includeInactive !== undefined) {
    query.set('includeInactive', options.includeInactive ? 'true' : 'false');
  }

  if (options?.includeUnpublished !== undefined) {
    query.set('includeUnpublished', options.includeUnpublished ? 'true' : 'false');
  }

  return apiFetch<InterviewEvent[]>(
    `/interview-events${query.size ? `?${query.toString()}` : ''}`,
  );
}

export function getInterviewEvent(eventId: string) {
  return apiFetch<InterviewEvent>(`/interview-events/${eventId}`);
}

export function createInterviewEvent(input: CreateInterviewEventInput) {
  return apiFetch<InterviewEvent>('/interview-events', {
    method: 'POST',
    json: input,
  });
}

export function updateInterviewEvent(eventId: string, input: UpdateInterviewEventInput) {
  return apiFetch<InterviewEvent>(`/interview-events/${eventId}`, {
    method: 'PATCH',
    json: input,
  });
}

export function listParentInterviewEvents(studentId?: string) {
  const query = new URLSearchParams();

  if (studentId) {
    query.set('studentId', studentId);
  }

  return apiFetch<InterviewEvent[]>(
    `/interview-events/parent${query.size ? `?${query.toString()}` : ''}`,
  );
}

export function listParentInterviewEventSlots(eventId: string, studentId: string) {
  const query = new URLSearchParams();
  query.set('studentId', studentId);

  return apiFetch<InterviewSlotParent[]>(
    `/interview-events/${eventId}/parent-slots?${query.toString()}`,
  );
}

export function listInterviewSlots(options?: {
  schoolId?: string;
  interviewEventId?: string;
  teacherId?: string;
  status?: InterviewSlotStatus;
  booked?: boolean;
}) {
  const query = new URLSearchParams();

  if (options?.schoolId) {
    query.set('schoolId', options.schoolId);
  }

  if (options?.interviewEventId) {
    query.set('interviewEventId', options.interviewEventId);
  }

  if (options?.teacherId) {
    query.set('teacherId', options.teacherId);
  }

  if (options?.status) {
    query.set('status', options.status);
  }

  if (options?.booked !== undefined) {
    query.set('booked', options.booked ? 'true' : 'false');
  }

  return apiFetch<InterviewSlotAdmin[]>(
    `/interview-slots${query.size ? `?${query.toString()}` : ''}`,
  );
}

export function createInterviewSlot(input: CreateInterviewSlotInput) {
  return apiFetch<InterviewSlotAdmin>('/interview-slots', {
    method: 'POST',
    json: input,
  });
}

export function bulkGenerateInterviewSlots(input: BulkGenerateInterviewSlotsInput) {
  return apiFetch<{ createdCount: number }>('/interview-slots/bulk-generate', {
    method: 'POST',
    json: input,
  });
}

export function updateInterviewSlot(slotId: string, input: UpdateInterviewSlotInput) {
  return apiFetch<InterviewSlotAdmin>(`/interview-slots/${slotId}`, {
    method: 'PATCH',
    json: input,
  });
}

export function deleteInterviewSlot(slotId: string) {
  return apiFetch<{ success: boolean }>(`/interview-slots/${slotId}`, {
    method: 'DELETE',
  });
}

export function unbookInterviewSlot(slotId: string) {
  return apiFetch<InterviewSlotAdmin>(`/interview-slots/${slotId}/unbook`, {
    method: 'POST',
  });
}

export function bookInterviewSlot(slotId: string, input: BookInterviewSlotInput) {
  return apiFetch<InterviewSlotParent>(`/interview-slots/${slotId}/book`, {
    method: 'POST',
    json: input,
  });
}

export function cancelMyInterviewBooking(slotId: string) {
  return apiFetch<InterviewSlotParent>(`/interview-slots/${slotId}/cancel-booking`, {
    method: 'POST',
  });
}

export function listParentInterviewBookings(options?: {
  studentId?: string;
  interviewEventId?: string;
}) {
  const query = new URLSearchParams();

  if (options?.studentId) {
    query.set('studentId', options.studentId);
  }

  if (options?.interviewEventId) {
    query.set('interviewEventId', options.interviewEventId);
  }

  return apiFetch<InterviewSlotParent[]>(
    `/interview-slots/parent-bookings${query.size ? `?${query.toString()}` : ''}`,
  );
}

export function listTeacherInterviewSlots(options?: { interviewEventId?: string }) {
  const query = new URLSearchParams();

  if (options?.interviewEventId) {
    query.set('interviewEventId', options.interviewEventId);
  }

  return apiFetch<InterviewSlotTeacher[]>(
    `/interview-slots/teacher${query.size ? `?${query.toString()}` : ''}`,
  );
}
