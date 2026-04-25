import type { AuthenticatedUser } from "../auth/types";
import type { School, SchoolYear } from "./schools";
import type { SchoolClass } from "./classes";
import { apiFetch } from "./client";

export type TimetableDayOfWeek =
  | "MONDAY"
  | "TUESDAY"
  | "WEDNESDAY"
  | "THURSDAY"
  | "FRIDAY"
  | "SATURDAY"
  | "SUNDAY";

export type TimetableBlock = {
  id: string;
  schoolId: string;
  schoolYearId: string;
  teacherId: string;
  dayOfWeek: TimetableDayOfWeek;
  startTime: string; // HH:mm format
  endTime: string; // HH:mm format
  roomLabel: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  school: School;
  schoolYear: SchoolYear;
  teacher: AuthenticatedUser;
  classes: SchoolClass[];
};

export type CreateTimetableBlockInput = {
  schoolId: string;
  schoolYearId: string;
  teacherId: string;
  dayOfWeek: TimetableDayOfWeek;
  startTime: string;
  endTime: string;
  roomLabel?: string;
  notes?: string;
  classIds: string[];
};

export type CreateBulkTimetableBlockInput = {
  schoolId: string;
  schoolYearId: string;
  teacherId: string;
  daySelectionMode: "ALL_WEEKDAYS" | "CUSTOM";
  daysOfWeek: TimetableDayOfWeek[];
  startTime: string;
  endTime: string;
  roomLabel?: string;
  notes?: string;
  classIds: string[];
};

export type CreateBulkTimetableBlockResponse = {
  created: TimetableBlock[];
  count: number;
};

export type UpdateTimetableBlockInput = {
  dayOfWeek?: TimetableDayOfWeek;
  startTime?: string;
  endTime?: string;
  roomLabel?: string;
  notes?: string;
  classIds?: string[];
  isActive?: boolean;
};

export type ListTimetableQueryInput = {
  schoolId?: string;
  schoolYearId?: string;
  teacherId?: string;
  classId?: string;
  roomLabel?: string;
  dayOfWeek?: TimetableDayOfWeek;
  includeInactive?: boolean;
  page?: number;
  pageSize?: number;
};

export type TimetableBlockListResponse = {
  rows: TimetableBlock[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export async function listTimetableBlocks(options?: ListTimetableQueryInput) {
  const query = new URLSearchParams();

  if (options?.schoolId) {
    query.set("schoolId", options.schoolId);
  }

  if (options?.schoolYearId) {
    query.set("schoolYearId", options.schoolYearId);
  }

  if (options?.teacherId) {
    query.set("teacherId", options.teacherId);
  }

  if (options?.classId) {
    query.set("classId", options.classId);
  }

  if (options?.roomLabel) {
    query.set("roomLabel", options.roomLabel);
  }

  if (options?.dayOfWeek) {
    query.set("dayOfWeek", options.dayOfWeek);
  }

  if (options?.includeInactive) {
    query.set("includeInactive", "true");
  }

  if (options?.page) {
    query.set("page", options.page.toString());
  }

  if (options?.pageSize) {
    query.set("pageSize", options.pageSize.toString());
  }

  const response = await apiFetch<TimetableBlockListResponse>(
    `/timetable${query.size ? `?${query.toString()}` : ""}`,
  );

  // Return just the rows array for backward compatibility with component expectations
  return response.rows || [];
}

export function getTimetableBlockById(blockId: string) {
  return apiFetch<TimetableBlock>(`/timetable/${blockId}`);
}

export function createTimetableBlock(input: CreateTimetableBlockInput) {
  return apiFetch<TimetableBlock>("/timetable", {
    method: "POST",
    json: input,
  });
}

export function createBulkTimetableBlocks(
  input: CreateBulkTimetableBlockInput,
) {
  return apiFetch<CreateBulkTimetableBlockResponse>("/timetable/bulk", {
    method: "POST",
    json: input,
  });
}

export function updateTimetableBlock(
  blockId: string,
  input: UpdateTimetableBlockInput,
) {
  return apiFetch<TimetableBlock>(`/timetable/${blockId}`, {
    method: "PATCH",
    json: input,
  });
}

export function deleteTimetableBlock(blockId: string) {
  return apiFetch<{ success: boolean }>(`/timetable/${blockId}`, {
    method: "DELETE",
  });
}

export function listMyTimetableBlocks() {
  return apiFetch<TimetableBlock[]>("/timetable/me");
}

export function listTimetableBlocksByStudent(studentId: string) {
  return apiFetch<TimetableBlock[]>(`/timetable/student/${studentId}`);
}
