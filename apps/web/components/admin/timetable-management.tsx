"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { CheckboxField, Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAuth } from "@/lib/auth/auth-context";
import {
  createTimetableBlock,
  createBulkTimetableBlocks,
  deleteTimetableBlock,
  listTimetableBlocks,
  updateTimetableBlock,
  type TimetableBlock,
  type TimetableDayOfWeek,
} from "@/lib/api/timetable";
import {
  listSchools,
  listSchoolYears,
  type School,
  type SchoolYear,
} from "@/lib/api/schools";
import { listUsers, type ManagedUser } from "@/lib/api/users";
import { listClasses, type SchoolClass } from "@/lib/api/classes";

const adminManageRoles = new Set(["OWNER", "SUPER_ADMIN", "ADMIN", "STAFF"]);
const daysOfWeek: TimetableDayOfWeek[] = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];

const weekdays: TimetableDayOfWeek[] = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
];

function getDayOfWeekLabel(day: TimetableDayOfWeek): string {
  return day.charAt(0) + day.slice(1).toLowerCase();
}

type CreateTimetableFormState = {
  schoolId: string;
  schoolYearId: string;
  teacherId: string;
  daySelectionMode: "SINGLE" | "ALL_WEEKDAYS" | "CUSTOM";
  selectedDays: Set<TimetableDayOfWeek>;
  dayOfWeek: TimetableDayOfWeek; // for SINGLE mode
  startTime: string;
  endTime: string;
  roomLabel: string;
  notes: string;
  classIds: string[];
};

type FilterState = {
  schoolId: string;
  schoolYearId: string;
  teacherId: string;
  classId: string;
  roomLabel: string;
  dayOfWeek: string;
  includeInactive: boolean;
};

const emptyCreateForm: CreateTimetableFormState = {
  schoolId: "",
  schoolYearId: "",
  teacherId: "",
  daySelectionMode: "SINGLE",
  selectedDays: new Set(),
  dayOfWeek: "MONDAY",
  startTime: "08:00",
  endTime: "09:00",
  roomLabel: "",
  notes: "",
  classIds: [],
};

export function TimetableManagement({
  embedded = false,
}: { embedded?: boolean } = {}) {
  const { session } = useAuth();
  const [blocks, setBlocks] = useState<TimetableBlock[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolYears, setSchoolYears] = useState<SchoolYear[]>([]);
  const [teachers, setTeachers] = useState<ManagedUser[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [filters, setFilters] = useState<FilterState>({
    schoolId: "",
    schoolYearId: "",
    teacherId: "",
    classId: "",
    roomLabel: "",
    dayOfWeek: "",
    includeInactive: false,
  });
  const [createForm, setCreateForm] = useState<CreateTimetableFormState>(
    structuredClone(emptyCreateForm),
  );
  const [editTarget, setEditTarget] = useState<TimetableBlock | null>(null);
  const [editForm, setEditForm] =
    useState<Partial<CreateTimetableFormState> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TimetableBlock | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const canManageTimetable = session?.user.role
    ? adminManageRoles.has(session.user.role)
    : false;

  // Load initial data
  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setError(null);

      try {
        const [schoolResponse, teacherResponse] = await Promise.all([
          listSchools(),
          listUsers({ role: "TEACHER" }),
        ]);

        setSchools(schoolResponse);
        setTeachers(teacherResponse);

        // Pre-select first school
        const initialSchoolId = schoolResponse[0]?.id ?? "";
        setFilters((f) => ({ ...f, schoolId: initialSchoolId }));
        setCreateForm((form) => ({ ...form, schoolId: initialSchoolId }));

        // Load school years for first school
        if (initialSchoolId) {
          const yearsResponse = await listSchoolYears(initialSchoolId);
          setSchoolYears(yearsResponse);

          if (yearsResponse.length > 0) {
            const initialYearId = yearsResponse[0].id;
            setFilters((f) => ({ ...f, schoolYearId: initialYearId }));
            setCreateForm((form) => ({ ...form, schoolYearId: initialYearId }));
          }
        }
      } catch (err) {
        setError("Failed to load initial data");
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }

    load();
  }, []);

  // Refresh blocks when filters change
  useEffect(() => {
    async function loadBlocks() {
      setError(null);

      try {
        const response = await listTimetableBlocks({
          schoolId: filters.schoolId || undefined,
          schoolYearId: filters.schoolYearId || undefined,
          teacherId: filters.teacherId || undefined,
          classId: filters.classId || undefined,
          roomLabel: filters.roomLabel || undefined,
          dayOfWeek:
            (filters.dayOfWeek as TimetableDayOfWeek | "") || undefined,
          includeInactive: filters.includeInactive,
        });

        setBlocks(response);
      } catch (err) {
        setError("Failed to load timetable blocks");
        console.error(err);
      }
    }

    if (filters.schoolId && filters.schoolYearId) {
      loadBlocks();
    }
  }, [filters]);

  // Load classes when school changes
  useEffect(() => {
    async function loadClasses() {
      if (!filters.schoolId) return;

      try {
        const response = await listClasses({ includeInactive: false });
        const filtered = response.filter(
          (c) => c.schoolId === filters.schoolId,
        );
        setClasses(filtered);
      } catch (err) {
        console.error("Failed to load classes:", err);
      }
    }

    loadClasses();
  }, [filters.schoolId]);

  // Load school years when school changes
  useEffect(() => {
    async function loadYears() {
      if (!filters.schoolId) return;

      try {
        const response = await listSchoolYears(filters.schoolId);
        setSchoolYears(response);
      } catch (err) {
        console.error("Failed to load school years:", err);
      }
    }

    loadYears();
  }, [filters.schoolId]);

  const filteredBlocks = useMemo(() => {
    // Defensive: ensure blocks is an array before sorting
    if (!Array.isArray(blocks)) {
      return [];
    }
    return blocks.sort((a, b) => {
      const dayOrder =
        daysOfWeek.indexOf(a.dayOfWeek) - daysOfWeek.indexOf(b.dayOfWeek);
      if (dayOrder !== 0) return dayOrder;
      return a.startTime.localeCompare(b.startTime);
    });
  }, [blocks]);

  const getSelectedDaysForCreate = () => {
    if (createForm.daySelectionMode === "SINGLE") {
      return [createForm.dayOfWeek];
    } else if (createForm.daySelectionMode === "ALL_WEEKDAYS") {
      return weekdays;
    } else {
      return Array.from(createForm.selectedDays);
    }
  };

  async function handleCreateBlock(e: FormEvent) {
    e.preventDefault();

    if (
      !createForm.schoolId ||
      !createForm.schoolYearId ||
      !createForm.teacherId
    ) {
      setError("Please select school, school year, and teacher");
      return;
    }

    if (!createForm.startTime || !createForm.endTime) {
      setError("Please enter start and end times");
      return;
    }

    if (createForm.classIds.length === 0) {
      setError("Please select at least one class");
      return;
    }

    const selectedDays = getSelectedDaysForCreate();
    if (selectedDays.length === 0) {
      setError("Please select at least one day");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Use bulk endpoint if multiple days, single endpoint for one day
      if (selectedDays.length === 1) {
        await createTimetableBlock({
          schoolId: createForm.schoolId,
          schoolYearId: createForm.schoolYearId,
          teacherId: createForm.teacherId,
          dayOfWeek: selectedDays[0],
          startTime: createForm.startTime,
          endTime: createForm.endTime,
          roomLabel: createForm.roomLabel || undefined,
          notes: createForm.notes || undefined,
          classIds: createForm.classIds,
        });

        setSuccessMessage(
          `Timetable block created for ${getDayOfWeekLabel(selectedDays[0])}`,
        );
      } else {
        const response = await createBulkTimetableBlocks({
          schoolId: createForm.schoolId,
          schoolYearId: createForm.schoolYearId,
          teacherId: createForm.teacherId,
          daySelectionMode:
            createForm.daySelectionMode === "ALL_WEEKDAYS"
              ? "ALL_WEEKDAYS"
              : "CUSTOM",
          daysOfWeek: selectedDays,
          startTime: createForm.startTime,
          endTime: createForm.endTime,
          roomLabel: createForm.roomLabel || undefined,
          notes: createForm.notes || undefined,
          classIds: createForm.classIds,
        });

        setSuccessMessage(`Created ${response.count} timetable blocks`);
      }

      setCreateForm(structuredClone(emptyCreateForm));
      setShowCreateForm(false);

      // Reload blocks
      const response = await listTimetableBlocks({
        schoolId: filters.schoolId || undefined,
        schoolYearId: filters.schoolYearId || undefined,
      });
      setBlocks(response);

      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to create timetable blocks";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleUpdateBlock(e: FormEvent) {
    e.preventDefault();

    if (!editTarget || !editForm) return;

    if (!editForm.startTime || !editForm.endTime) {
      setError("Please enter start and end times");
      return;
    }

    if (editForm.classIds && editForm.classIds.length === 0) {
      setError("Please select at least one class");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await updateTimetableBlock(editTarget.id, {
        dayOfWeek: editForm.dayOfWeek,
        startTime: editForm.startTime,
        endTime: editForm.endTime,
        roomLabel: editForm.roomLabel || undefined,
        notes: editForm.notes || undefined,
        classIds: editForm.classIds,
      });

      setSuccessMessage("Timetable block updated successfully");
      setEditTarget(null);
      setEditForm(null);

      // Reload blocks
      const response = await listTimetableBlocks({
        schoolId: filters.schoolId || undefined,
        schoolYearId: filters.schoolYearId || undefined,
      });
      setBlocks(response);

      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update timetable block";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteBlock() {
    if (!deleteTarget) return;

    setIsDeleting(true);
    setDeleteError(null);

    try {
      await deleteTimetableBlock(deleteTarget.id);

      setSuccessMessage("Timetable block deleted successfully");
      setDeleteTarget(null);

      // Reload blocks
      const response = await listTimetableBlocks({
        schoolId: filters.schoolId || undefined,
        schoolYearId: filters.schoolYearId || undefined,
      });
      setBlocks(response);

      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to delete timetable block";
      setDeleteError(message);
    } finally {
      setIsDeleting(false);
    }
  }

  if (!canManageTimetable && !embedded) {
    return (
      <Notice tone="danger">
        You do not have permission to manage timetables.
      </Notice>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-slate-600">
            Loading timetable data...
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Timetable Management"
        description="Create and manage timetable blocks with assigned classes"
      />

      {error && <Notice tone="danger">{error}</Notice>}
      {successMessage && <Notice tone="success">{successMessage}</Notice>}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            <Field htmlFor="filter-school" label="School">
              <Select
                id="filter-school"
                value={filters.schoolId}
                onChange={(e) => {
                  setFilters((f) => ({
                    ...f,
                    schoolId: e.target.value,
                    schoolYearId: "",
                  }));
                }}
              >
                <option value="">Select school</option>
                {schools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field htmlFor="filter-year" label="School Year">
              <Select
                id="filter-year"
                value={filters.schoolYearId}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, schoolYearId: e.target.value }))
                }
              >
                <option value="">Select year</option>
                {schoolYears.map((year) => (
                  <option key={year.id} value={year.id}>
                    {year.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field htmlFor="filter-teacher" label="Teacher">
              <Select
                id="filter-teacher"
                value={filters.teacherId}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, teacherId: e.target.value }))
                }
              >
                <option value="">All teachers</option>
                {teachers.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {teacher.firstName} {teacher.lastName}
                  </option>
                ))}
              </Select>
            </Field>

            <Field htmlFor="filter-class" label="Class">
              <Select
                id="filter-class"
                value={filters.classId}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, classId: e.target.value }))
                }
              >
                <option value="">All classes</option>
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field htmlFor="filter-day" label="Day of Week">
              <Select
                id="filter-day"
                value={filters.dayOfWeek}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, dayOfWeek: e.target.value }))
                }
              >
                <option value="">All days</option>
                {daysOfWeek.map((day) => (
                  <option key={day} value={day}>
                    {getDayOfWeekLabel(day)}
                  </option>
                ))}
              </Select>
            </Field>

            <Field htmlFor="filter-room" label="Room label">
              <Input
                id="filter-room"
                type="text"
                placeholder="Room label"
                value={filters.roomLabel}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, roomLabel: e.target.value }))
                }
              />
            </Field>

            <CheckboxField
              label="Include inactive"
              checked={filters.includeInactive}
              onChange={(e) =>
                setFilters((f) => ({ ...f, includeInactive: e.target.checked }))
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Create Form */}
      {canManageTimetable && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>
                {showCreateForm
                  ? "Create Timetable Blocks"
                  : "Create New Blocks"}
              </CardTitle>
            </div>
            {!showCreateForm && (
              <Button
                type="button"
                onClick={() => {
                  setShowCreateForm(true);
                  setEditTarget(null);
                  setEditForm(null);
                  setCreateForm((f) => ({
                    ...structuredClone(emptyCreateForm),
                    schoolId: filters.schoolId || "",
                    schoolYearId: filters.schoolYearId || "",
                  }));
                }}
              >
                Add Blocks
              </Button>
            )}
          </CardHeader>

          {showCreateForm && (
            <CardContent>
              <form onSubmit={handleCreateBlock} className="space-y-6">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <Field htmlFor="create-school" label="School">
                    <Select
                      id="create-school"
                      value={createForm.schoolId}
                      onChange={(e) =>
                        setCreateForm((f) => ({
                          ...f,
                          schoolId: e.target.value,
                          schoolYearId: "",
                        }))
                      }
                      required
                    >
                      <option value="">Select school</option>
                      {schools.map((school) => (
                        <option key={school.id} value={school.id}>
                          {school.name}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <Field htmlFor="create-year" label="School Year">
                    <Select
                      id="create-year"
                      value={createForm.schoolYearId}
                      onChange={(e) =>
                        setCreateForm((f) => ({
                          ...f,
                          schoolYearId: e.target.value,
                        }))
                      }
                      required
                    >
                      <option value="">Select year</option>
                      {schoolYears
                        .filter((y) => y.schoolId === createForm.schoolId)
                        .map((year) => (
                          <option key={year.id} value={year.id}>
                            {year.name}
                          </option>
                        ))}
                    </Select>
                  </Field>

                  <Field htmlFor="create-teacher" label="Teacher">
                    <Select
                      id="create-teacher"
                      value={createForm.teacherId}
                      onChange={(e) =>
                        setCreateForm((f) => ({
                          ...f,
                          teacherId: e.target.value,
                        }))
                      }
                      required
                    >
                      <option value="">Select teacher</option>
                      {teachers.map((teacher) => (
                        <option key={teacher.id} value={teacher.id}>
                          {teacher.firstName} {teacher.lastName}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <Field htmlFor="create-start" label="Start Time">
                    <Input
                      id="create-start"
                      type="time"
                      value={createForm.startTime}
                      onChange={(e) =>
                        setCreateForm((f) => ({
                          ...f,
                          startTime: e.target.value,
                        }))
                      }
                      required
                    />
                  </Field>

                  <Field htmlFor="create-end" label="End Time">
                    <Input
                      id="create-end"
                      type="time"
                      value={createForm.endTime}
                      onChange={(e) =>
                        setCreateForm((f) => ({
                          ...f,
                          endTime: e.target.value,
                        }))
                      }
                      required
                    />
                  </Field>

                  <Field htmlFor="create-room" label="Room Label (optional)">
                    <Input
                      id="create-room"
                      type="text"
                      placeholder="e.g., Room 101"
                      value={createForm.roomLabel}
                      onChange={(e) =>
                        setCreateForm((f) => ({
                          ...f,
                          roomLabel: e.target.value,
                        }))
                      }
                    />
                  </Field>
                </div>

                {/* Day Selection Mode */}
                <Field label="Day Selection">
                  <div className="space-y-3">
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="dayMode"
                          value="SINGLE"
                          checked={createForm.daySelectionMode === "SINGLE"}
                          onChange={(e) =>
                            setCreateForm((f) => ({
                              ...f,
                              daySelectionMode: "SINGLE",
                              selectedDays: new Set(),
                            }))
                          }
                          className="rounded"
                        />
                        <span className="text-sm">Single Day</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="dayMode"
                          value="ALL_WEEKDAYS"
                          checked={
                            createForm.daySelectionMode === "ALL_WEEKDAYS"
                          }
                          onChange={(e) =>
                            setCreateForm((f) => ({
                              ...f,
                              daySelectionMode: "ALL_WEEKDAYS",
                              selectedDays: new Set(),
                            }))
                          }
                          className="rounded"
                        />
                        <span className="text-sm">All Weekdays (Mon-Fri)</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="dayMode"
                          value="CUSTOM"
                          checked={createForm.daySelectionMode === "CUSTOM"}
                          onChange={(e) =>
                            setCreateForm((f) => ({
                              ...f,
                              daySelectionMode: "CUSTOM",
                            }))
                          }
                          className="rounded"
                        />
                        <span className="text-sm">Custom Days</span>
                      </label>
                    </div>

                    {createForm.daySelectionMode === "SINGLE" && (
                      <Field htmlFor="create-day-single" label="Select Day">
                        <Select
                          id="create-day-single"
                          value={createForm.dayOfWeek}
                          onChange={(e) =>
                            setCreateForm((f) => ({
                              ...f,
                              dayOfWeek: e.target.value as TimetableDayOfWeek,
                            }))
                          }
                          required
                        >
                          {daysOfWeek.map((day) => (
                            <option key={day} value={day}>
                              {getDayOfWeekLabel(day)}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    )}

                    {createForm.daySelectionMode === "CUSTOM" && (
                      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                        {daysOfWeek.map((day) => (
                          <CheckboxField
                            key={day}
                            label={getDayOfWeekLabel(day)}
                            checked={createForm.selectedDays.has(day)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                createForm.selectedDays.add(day);
                              } else {
                                createForm.selectedDays.delete(day);
                              }
                              setCreateForm((f) => ({
                                ...f,
                                selectedDays: new Set(f.selectedDays),
                              }));
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </Field>

                <Field htmlFor="create-notes" label="Notes (optional)">
                  <textarea
                    id="create-notes"
                    className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                    rows={2}
                    placeholder="Any additional notes"
                    value={createForm.notes}
                    onChange={(e) =>
                      setCreateForm((f) => ({ ...f, notes: e.target.value }))
                    }
                  />
                </Field>

                <Field htmlFor="create-classes" label="Classes (required)">
                  <div
                    id="create-classes"
                    className="space-y-2 max-h-48 overflow-y-auto rounded border border-slate-300 p-3"
                  >
                    {classes.length === 0 ? (
                      <p className="text-sm text-slate-600">
                        No classes available
                      </p>
                    ) : (
                      classes.map((cls) => (
                        <CheckboxField
                          key={cls.id}
                          label={cls.name}
                          checked={createForm.classIds.includes(cls.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setCreateForm((f) => ({
                                ...f,
                                classIds: [...f.classIds, cls.id],
                              }));
                            } else {
                              setCreateForm((f) => ({
                                ...f,
                                classIds: f.classIds.filter(
                                  (id) => id !== cls.id,
                                ),
                              }));
                            }
                          }}
                        />
                      ))
                    )}
                  </div>
                </Field>

                <div className="flex gap-2">
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Creating..." : "Create Blocks"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setShowCreateForm(false);
                      setCreateForm(structuredClone(emptyCreateForm));
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          )}
        </Card>
      )}

      {/* Edit Form (unchanged - keeps simple one-at-a-time editing) */}
      {canManageTimetable && editTarget && editForm && (
        <Card>
          <CardHeader>
            <CardTitle>Edit Timetable Block</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdateBlock} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Field htmlFor="edit-day" label="Day of Week">
                  <Select
                    id="edit-day"
                    value={editForm.dayOfWeek || "MONDAY"}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        dayOfWeek: e.target.value as TimetableDayOfWeek,
                      }))
                    }
                    required
                  >
                    {daysOfWeek.map((day) => (
                      <option key={day} value={day}>
                        {getDayOfWeekLabel(day)}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field htmlFor="edit-start" label="Start Time">
                  <Input
                    id="edit-start"
                    type="time"
                    value={editForm.startTime || ""}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, startTime: e.target.value }))
                    }
                    required
                  />
                </Field>

                <Field htmlFor="edit-end" label="End Time">
                  <Input
                    id="edit-end"
                    type="time"
                    value={editForm.endTime || ""}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, endTime: e.target.value }))
                    }
                    required
                  />
                </Field>

                <Field htmlFor="edit-room" label="Room Label (optional)">
                  <Input
                    id="edit-room"
                    type="text"
                    placeholder="e.g., Room 101"
                    value={editForm.roomLabel || ""}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, roomLabel: e.target.value }))
                    }
                  />
                </Field>
              </div>

              <Field htmlFor="edit-notes" label="Notes (optional)">
                <textarea
                  id="edit-notes"
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                  rows={2}
                  placeholder="Any additional notes"
                  value={editForm.notes || ""}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, notes: e.target.value }))
                  }
                />
              </Field>

              <Field htmlFor="edit-classes" label="Classes">
                <div
                  id="edit-classes"
                  className="space-y-2 max-h-48 overflow-y-auto rounded border border-slate-300 p-3"
                >
                  {classes.length === 0 ? (
                    <p className="text-sm text-slate-600">
                      No classes available
                    </p>
                  ) : (
                    classes.map((cls) => (
                      <CheckboxField
                        key={cls.id}
                        label={cls.name}
                        checked={(editForm.classIds || []).includes(cls.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setEditForm((f) => ({
                              ...f,
                              classIds: [...(f?.classIds || []), cls.id],
                            }));
                          } else {
                            setEditForm((f) => ({
                              ...f,
                              classIds: (f?.classIds || []).filter(
                                (id) => id !== cls.id,
                              ),
                            }));
                          }
                        }}
                      />
                    ))
                  )}
                </div>
              </Field>

              <div className="flex gap-2">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Updating..." : "Update Block"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setEditTarget(null);
                    setEditForm(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Timetable Grid */}
      <Card>
        <CardHeader>
          <CardTitle>Timetable Blocks</CardTitle>
          <CardDescription>
            {filteredBlocks.length} block
            {filteredBlocks.length !== 1 ? "s" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredBlocks.length === 0 ? (
            <EmptyState
              title="No timetable blocks"
              description="No blocks match your filters. Create one to get started."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="px-4 py-3 text-left font-semibold">Day</th>
                    <th className="px-4 py-3 text-left font-semibold">Time</th>
                    <th className="px-4 py-3 text-left font-semibold">
                      Teacher
                    </th>
                    <th className="px-4 py-3 text-left font-semibold">
                      Classes
                    </th>
                    <th className="px-4 py-3 text-left font-semibold">Room</th>
                    <th className="px-4 py-3 text-left font-semibold">
                      Status
                    </th>
                    {canManageTimetable && (
                      <th className="px-4 py-3 text-left font-semibold">
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filteredBlocks.map((block) => (
                    <tr
                      key={block.id}
                      className="border-b border-slate-200 hover:bg-slate-50"
                    >
                      <td className="px-4 py-3 font-medium">
                        {getDayOfWeekLabel(block.dayOfWeek)}
                      </td>
                      <td className="px-4 py-3">
                        {block.startTime} - {block.endTime}
                      </td>
                      <td className="px-4 py-3">
                        {block.teacher.firstName} {block.teacher.lastName}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {block.classes.map((cls) => (
                            <Badge key={cls.id} variant="neutral">
                              {cls.name}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">{block.roomLabel || "-"}</td>
                      <td className="px-4 py-3">
                        <Badge variant={block.isActive ? "success" : "neutral"}>
                          {block.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      {canManageTimetable && (
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setEditTarget(block);
                                setEditForm({
                                  dayOfWeek: block.dayOfWeek,
                                  startTime: block.startTime,
                                  endTime: block.endTime,
                                  roomLabel: block.roomLabel || "",
                                  notes: block.notes || "",
                                  classIds: block.classes.map((c) => c.id),
                                });
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              type="button"
                              variant="danger"
                              size="sm"
                              onClick={() => setDeleteTarget(block)}
                            >
                              Delete
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      {deleteTarget && (
        <ConfirmDialog
          isOpen={true}
          title="Delete Timetable Block"
          description={`Delete this timetable block for ${deleteTarget.teacher.firstName} ${deleteTarget.teacher.lastName} on ${getDayOfWeekLabel(deleteTarget.dayOfWeek)} (${deleteTarget.startTime} - ${deleteTarget.endTime})?`}
          confirmLabel="Delete"
          confirmVariant="danger"
          isPending={isDeleting}
          pendingLabel="Deleting..."
          onConfirm={handleDeleteBlock}
          onCancel={() => setDeleteTarget(null)}
          errorMessage={deleteError}
        />
      )}
    </div>
  );
}
