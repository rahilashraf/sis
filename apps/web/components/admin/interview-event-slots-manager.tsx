"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth/auth-context";
import { listClasses, type SchoolClass } from "@/lib/api/classes";
import { listStudentParents, type StudentParentLink } from "@/lib/api/students";
import {
  bookInterviewSlotForParent,
  bulkGenerateInterviewSlots,
  createInterviewSlot,
  deleteInterviewSlot,
  formatInterviewSlotStatusLabel,
  getInterviewEvent,
  listInterviewSlots,
  type InterviewEvent,
  type InterviewSlotAdmin,
  type InterviewSlotStatus,
  unbookInterviewSlot,
  updateInterviewSlot,
} from "@/lib/api/interviews";
import { formatDateTimeLabel } from "@/lib/utils";

const manageRoles = new Set(["OWNER", "SUPER_ADMIN", "ADMIN", "STAFF"]);

function toDateTimeLocal(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const pad = (input: number) => String(input).padStart(2, "0");
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(
    parsed.getHours(),
  )}:${pad(parsed.getMinutes())}`;
}

function parseDateTimeLocal(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} is required.`);
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label} must be a valid date/time.`);
  }

  return parsed.toISOString();
}

function getStatusVariant(status: InterviewSlotStatus) {
  if (status === "AVAILABLE") {
    return "success" as const;
  }

  if (status === "BOOKED") {
    return "warning" as const;
  }

  return "neutral" as const;
}

export function InterviewEventSlotsManager({ eventId }: { eventId: string }) {
  const { session } = useAuth();
  const role = session?.user.role ?? "";

  const [event, setEvent] = useState<InterviewEvent | null>(null);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [slots, setSlots] = useState<InterviewSlotAdmin[]>([]);
  const [linkedParents, setLinkedParents] = useState<StudentParentLink[]>([]);

  const [teacherId, setTeacherId] = useState("");
  const [classId, setClassId] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [meetingMode, setMeetingMode] = useState("");
  const [notes, setNotes] = useState("");

  const [bulkTeacherId, setBulkTeacherId] = useState("");
  const [bulkClassId, setBulkClassId] = useState("");
  const [windowStart, setWindowStart] = useState("");
  const [windowEnd, setWindowEnd] = useState("");
  const [slotDurationMinutes, setSlotDurationMinutes] = useState("15");
  const [breakMinutes, setBreakMinutes] = useState("0");
  const [bulkLocation, setBulkLocation] = useState("");
  const [bulkMeetingMode, setBulkMeetingMode] = useState("");
  const [bulkNotes, setBulkNotes] = useState("");

  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [editTeacherId, setEditTeacherId] = useState("");
  const [editClassId, setEditClassId] = useState("");
  const [editStartTime, setEditStartTime] = useState("");
  const [editEndTime, setEditEndTime] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editMeetingMode, setEditMeetingMode] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InterviewSlotAdmin | null>(
    null,
  );
  const [toggleTarget, setToggleTarget] = useState<InterviewSlotAdmin | null>(
    null,
  );
  const [unbookTarget, setUnbookTarget] = useState<InterviewSlotAdmin | null>(
    null,
  );
  const [bookingStudentId, setBookingStudentId] = useState("");
  const [bookingParentId, setBookingParentId] = useState("");
  const [bookingTeacherId, setBookingTeacherId] = useState("");
  const [bookingSlotId, setBookingSlotId] = useState("");
  const [bookingNotes, setBookingNotes] = useState("");
  const [isLoadingParents, setIsLoadingParents] = useState(false);

  const teacherOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: Array<{ id: string; label: string }> = [];

    for (const schoolClass of classes) {
      for (const assignment of schoolClass.teachers) {
        const teacher = assignment.teacher;
        if (!teacher || seen.has(teacher.id)) {
          continue;
        }

        seen.add(teacher.id);
        options.push({
          id: teacher.id,
          label:
            `${teacher.firstName} ${teacher.lastName}`.trim() ||
            teacher.username,
        });
      }
    }

    for (const slot of slots) {
      if (seen.has(slot.teacher.id)) {
        continue;
      }

      seen.add(slot.teacher.id);
      options.push({
        id: slot.teacher.id,
        label:
          `${slot.teacher.firstName} ${slot.teacher.lastName}`.trim() ||
          slot.teacher.username,
      });
    }

    return options.sort((a, b) => a.label.localeCompare(b.label));
  }, [classes, slots]);

  const studentOptions = useMemo(() => {
    const byStudentId = new Map<string, { id: string; label: string }>();

    for (const schoolClass of classes) {
      for (const enrollment of schoolClass.students ?? []) {
        const student = enrollment.student;
        if (byStudentId.has(student.id)) {
          continue;
        }

        const fullName = `${student.firstName} ${student.lastName}`.trim();
        byStudentId.set(student.id, {
          id: student.id,
          label:
            fullName.length > 0
              ? `${fullName} (${student.username})`
              : student.username,
        });
      }
    }

    return Array.from(byStudentId.values()).sort((left, right) =>
      left.label.localeCompare(right.label),
    );
  }, [classes]);

  const availableAdminBookingSlots = useMemo(() => {
    return slots
      .filter(
        (slot) =>
          slot.status === "AVAILABLE" &&
          slot.bookedParentId === null &&
          slot.bookedStudentId === null &&
          (!bookingTeacherId || slot.teacherId === bookingTeacherId),
      )
      .sort(
        (left, right) =>
          new Date(left.startTime).getTime() -
          new Date(right.startTime).getTime(),
      );
  }, [bookingTeacherId, slots]);

  useEffect(() => {
    if (teacherOptions.length === 0) {
      return;
    }

    setTeacherId((current) => current || teacherOptions[0]?.id || "");
    setBulkTeacherId((current) => current || teacherOptions[0]?.id || "");
    setBookingTeacherId((current) => current || teacherOptions[0]?.id || "");
  }, [teacherOptions]);

  useEffect(() => {
    if (studentOptions.length === 0) {
      setBookingStudentId("");
      return;
    }

    setBookingStudentId((current) => {
      if (current && studentOptions.some((student) => student.id === current)) {
        return current;
      }

      return studentOptions[0]?.id ?? "";
    });
  }, [studentOptions]);

  useEffect(() => {
    if (!bookingStudentId) {
      setLinkedParents([]);
      setBookingParentId("");
      return;
    }

    async function loadLinkedParents() {
      setIsLoadingParents(true);

      try {
        const response = await listStudentParents(bookingStudentId);
        setLinkedParents(response);
        setBookingParentId((current) => {
          if (current && response.some((entry) => entry.parentId === current)) {
            return current;
          }

          return response[0]?.parentId ?? "";
        });
      } catch (loadError) {
        setLinkedParents([]);
        setBookingParentId("");
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load linked parents for this student.",
        );
      } finally {
        setIsLoadingParents(false);
      }
    }

    void loadLinkedParents();
  }, [bookingStudentId]);

  useEffect(() => {
    setBookingSlotId((current) => {
      if (
        current &&
        availableAdminBookingSlots.some((slot) => slot.id === current)
      ) {
        return current;
      }

      return availableAdminBookingSlots[0]?.id ?? "";
    });
  }, [availableAdminBookingSlots]);

  async function refreshSlots() {
    const slotResponse = await listInterviewSlots({
      interviewEventId: eventId,
    });
    setSlots(slotResponse);
  }

  useEffect(() => {
    async function load() {
      if (!manageRoles.has(role)) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const eventResponse = await getInterviewEvent(eventId);
        setEvent(eventResponse);

        const [slotResponse, classResponse] = await Promise.all([
          listInterviewSlots({ interviewEventId: eventId }),
          listClasses({
            includeInactive: true,
            schoolId: eventResponse.schoolId,
          }),
        ]);

        setSlots(slotResponse);
        setClasses(classResponse);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load interview slot manager.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, [eventId, role]);

  async function handleCreateSlot(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault();

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await createInterviewSlot({
        interviewEventId: eventId,
        teacherId,
        classId: classId || null,
        startTime: parseDateTimeLocal(startTime, "Slot start"),
        endTime: parseDateTimeLocal(endTime, "Slot end"),
        location: location.trim() || null,
        meetingMode: meetingMode.trim() || null,
        notes: notes.trim() || null,
      });

      setStartTime("");
      setEndTime("");
      setLocation("");
      setMeetingMode("");
      setNotes("");
      setSuccessMessage("Interview slot created.");
      await refreshSlots();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to create interview slot.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleBulkGenerate(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault();

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await bulkGenerateInterviewSlots({
        interviewEventId: eventId,
        teacherId: bulkTeacherId,
        classId: bulkClassId || null,
        windowStart: parseDateTimeLocal(windowStart, "Window start"),
        windowEnd: parseDateTimeLocal(windowEnd, "Window end"),
        slotDurationMinutes: Number(slotDurationMinutes),
        breakMinutes: Number(breakMinutes),
        location: bulkLocation.trim() || null,
        meetingMode: bulkMeetingMode.trim() || null,
        notes: bulkNotes.trim() || null,
      });

      setSuccessMessage(
        `Generated ${response.createdCount} slot${response.createdCount === 1 ? "" : "s"}.`,
      );
      await refreshSlots();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to generate slots.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  function beginEdit(slot: InterviewSlotAdmin) {
    setEditingSlotId(slot.id);
    setEditTeacherId(slot.teacherId);
    setEditClassId(slot.classId ?? "");
    setEditStartTime(toDateTimeLocal(slot.startTime));
    setEditEndTime(toDateTimeLocal(slot.endTime));
    setEditLocation(slot.location ?? "");
    setEditMeetingMode(slot.meetingMode ?? "");
    setEditNotes(slot.notes ?? "");
  }

  async function saveEdit() {
    if (!editingSlotId) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await updateInterviewSlot(editingSlotId, {
        teacherId: editTeacherId,
        classId: editClassId || null,
        startTime: parseDateTimeLocal(editStartTime, "Edit start"),
        endTime: parseDateTimeLocal(editEndTime, "Edit end"),
        location: editLocation.trim() || null,
        meetingMode: editMeetingMode.trim() || null,
        notes: editNotes.trim() || null,
      });

      setEditingSlotId(null);
      setSuccessMessage("Interview slot updated.");
      await refreshSlots();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to update slot.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleCancelled(slot: InterviewSlotAdmin) {
    setError(null);
    setSuccessMessage(null);
    setIsSaving(true);

    try {
      await updateInterviewSlot(slot.id, {
        status: slot.status === "CANCELLED" ? "AVAILABLE" : "CANCELLED",
      });
      setSuccessMessage(
        slot.status === "CANCELLED" ? "Slot reactivated." : "Slot cancelled.",
      );
      setToggleTarget(null);
      await refreshSlots();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to update slot status.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(slot: InterviewSlotAdmin) {
    setError(null);
    setSuccessMessage(null);
    setIsSaving(true);

    try {
      await deleteInterviewSlot(slot.id);
      setSuccessMessage("Slot deleted.");
      setDeleteTarget(null);
      await refreshSlots();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to delete slot.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleUnbook(slot: InterviewSlotAdmin) {
    setError(null);
    setSuccessMessage(null);
    setIsSaving(true);

    try {
      await unbookInterviewSlot(slot.id);
      setSuccessMessage("Booking removed from slot.");
      setUnbookTarget(null);
      await refreshSlots();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to unbook slot.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleBookForParent(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault();

    if (!bookingSlotId || !bookingStudentId || !bookingParentId) {
      return;
    }

    setError(null);
    setSuccessMessage(null);
    setIsSaving(true);

    try {
      await bookInterviewSlotForParent(bookingSlotId, {
        studentId: bookingStudentId,
        parentId: bookingParentId,
        bookingNotes: bookingNotes.trim() || null,
      });

      setBookingNotes("");
      setSuccessMessage("Interview slot booked on behalf of parent.");
      await refreshSlots();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to book for parent.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (!manageRoles.has(role)) {
    return (
      <Notice tone="danger">
        Only OWNER, SUPER_ADMIN, ADMIN, and STAFF roles can manage interview
        slots.
      </Notice>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-slate-500">Loading slot manager...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {successMessage ? <Notice tone="success">{successMessage}</Notice> : null}
      {teacherOptions.length === 0 ? (
        <Notice tone="warning">
          No teachers were found in this school&apos;s class assignments or
          existing slots. Assign teachers to classes first or add a slot for a
          class-assigned teacher.
        </Notice>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Manual Slot Creation</CardTitle>
          <CardDescription>
            Add individual teacher interview slots for{" "}
            {event?.title ?? "this event"}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 md:grid-cols-3"
            onSubmit={handleCreateSlot}
          >
            <Field htmlFor="slot-teacher" label="Teacher">
              <Select
                id="slot-teacher"
                disabled={teacherOptions.length === 0}
                onChange={(changeEvent) =>
                  setTeacherId(changeEvent.target.value)
                }
                required
                value={teacherId}
              >
                <option value="">Select teacher</option>
                {teacherOptions.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {teacher.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field htmlFor="slot-class" label="Class (optional)">
              <Select
                id="slot-class"
                onChange={(changeEvent) => setClassId(changeEvent.target.value)}
                value={classId}
              >
                <option value="">No class context</option>
                {classes.map((schoolClass) => (
                  <option key={schoolClass.id} value={schoolClass.id}>
                    {schoolClass.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field htmlFor="slot-location" label="Location">
              <Input
                id="slot-location"
                onChange={(changeEvent) =>
                  setLocation(changeEvent.target.value)
                }
                placeholder="Room 12"
                value={location}
              />
            </Field>

            <Field htmlFor="slot-start" label="Start">
              <Input
                id="slot-start"
                onChange={(changeEvent) =>
                  setStartTime(changeEvent.target.value)
                }
                required
                type="datetime-local"
                value={startTime}
              />
            </Field>

            <Field htmlFor="slot-end" label="End">
              <Input
                id="slot-end"
                onChange={(changeEvent) => setEndTime(changeEvent.target.value)}
                required
                type="datetime-local"
                value={endTime}
              />
            </Field>

            <Field htmlFor="slot-meeting-mode" label="Meeting mode">
              <Input
                id="slot-meeting-mode"
                onChange={(changeEvent) =>
                  setMeetingMode(changeEvent.target.value)
                }
                placeholder="In-person / Online"
                value={meetingMode}
              />
            </Field>

            <div className="md:col-span-3">
              <Field htmlFor="slot-notes" label="Notes">
                <Textarea
                  id="slot-notes"
                  onChange={(changeEvent) => setNotes(changeEvent.target.value)}
                  rows={2}
                  value={notes}
                />
              </Field>
            </div>

            <div className="md:col-span-3">
              <button
                className={buttonClassName({ variant: "primary" })}
                disabled={isSaving || teacherOptions.length === 0}
                type="submit"
              >
                {teacherOptions.length === 0
                  ? "No teachers available"
                  : isSaving
                    ? "Saving..."
                    : "Create slot"}
              </button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bulk Generate Slots</CardTitle>
          <CardDescription>
            Generate a sequence of slots in one time window.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 md:grid-cols-3"
            onSubmit={handleBulkGenerate}
          >
            <Field htmlFor="bulk-teacher" label="Teacher">
              <Select
                disabled={teacherOptions.length === 0}
                id="bulk-teacher"
                onChange={(changeEvent) =>
                  setBulkTeacherId(changeEvent.target.value)
                }
                required
                value={bulkTeacherId}
              >
                <option value="">Select teacher</option>
                {teacherOptions.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {teacher.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field htmlFor="bulk-class" label="Class (optional)">
              <Select
                id="bulk-class"
                onChange={(changeEvent) =>
                  setBulkClassId(changeEvent.target.value)
                }
                value={bulkClassId}
              >
                <option value="">No class context</option>
                {classes.map((schoolClass) => (
                  <option key={schoolClass.id} value={schoolClass.id}>
                    {schoolClass.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field htmlFor="bulk-duration" label="Slot duration (minutes)">
              <Input
                id="bulk-duration"
                min={5}
                onChange={(changeEvent) =>
                  setSlotDurationMinutes(changeEvent.target.value)
                }
                required
                type="number"
                value={slotDurationMinutes}
              />
            </Field>

            <Field htmlFor="bulk-window-start" label="Window start">
              <Input
                id="bulk-window-start"
                onChange={(changeEvent) =>
                  setWindowStart(changeEvent.target.value)
                }
                required
                type="datetime-local"
                value={windowStart}
              />
            </Field>

            <Field htmlFor="bulk-window-end" label="Window end">
              <Input
                id="bulk-window-end"
                onChange={(changeEvent) =>
                  setWindowEnd(changeEvent.target.value)
                }
                required
                type="datetime-local"
                value={windowEnd}
              />
            </Field>

            <Field htmlFor="bulk-break" label="Break (minutes)">
              <Input
                id="bulk-break"
                min={0}
                onChange={(changeEvent) =>
                  setBreakMinutes(changeEvent.target.value)
                }
                required
                type="number"
                value={breakMinutes}
              />
            </Field>

            <Field htmlFor="bulk-location" label="Location">
              <Input
                id="bulk-location"
                onChange={(changeEvent) =>
                  setBulkLocation(changeEvent.target.value)
                }
                value={bulkLocation}
              />
            </Field>

            <Field htmlFor="bulk-meeting-mode" label="Meeting mode">
              <Input
                id="bulk-meeting-mode"
                onChange={(changeEvent) =>
                  setBulkMeetingMode(changeEvent.target.value)
                }
                value={bulkMeetingMode}
              />
            </Field>

            <div className="md:col-span-3">
              <Field htmlFor="bulk-notes" label="Notes">
                <Textarea
                  id="bulk-notes"
                  onChange={(changeEvent) =>
                    setBulkNotes(changeEvent.target.value)
                  }
                  rows={2}
                  value={bulkNotes}
                />
              </Field>
            </div>

            <div className="md:col-span-3">
              <button
                className={buttonClassName({ variant: "secondary" })}
                disabled={isSaving || teacherOptions.length === 0}
                type="submit"
              >
                {teacherOptions.length === 0
                  ? "No teachers available"
                  : isSaving
                    ? "Generating..."
                    : "Generate slots"}
              </button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Book for Parent</CardTitle>
          <CardDescription>
            Create a booking on behalf of a linked parent/guardian using an
            available slot.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 md:grid-cols-2"
            onSubmit={handleBookForParent}
          >
            <Field htmlFor="admin-book-student" label="Student">
              <Select
                id="admin-book-student"
                disabled={studentOptions.length === 0}
                onChange={(changeEvent) =>
                  setBookingStudentId(changeEvent.target.value)
                }
                value={bookingStudentId}
              >
                <option value="">Select student</option>
                {studentOptions.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field htmlFor="admin-book-parent" label="Linked parent/guardian">
              <Select
                id="admin-book-parent"
                disabled={isLoadingParents || linkedParents.length === 0}
                onChange={(changeEvent) =>
                  setBookingParentId(changeEvent.target.value)
                }
                value={bookingParentId}
              >
                <option value="">
                  {isLoadingParents
                    ? "Loading linked parents..."
                    : "Select parent/guardian"}
                </option>
                {linkedParents.map((link) => (
                  <option key={link.id} value={link.parentId}>
                    {link.parent.firstName} {link.parent.lastName}
                  </option>
                ))}
              </Select>
            </Field>

            <Field htmlFor="admin-book-teacher" label="Teacher">
              <Select
                id="admin-book-teacher"
                onChange={(changeEvent) =>
                  setBookingTeacherId(changeEvent.target.value)
                }
                value={bookingTeacherId}
              >
                <option value="">All teachers</option>
                {teacherOptions.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {teacher.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field htmlFor="admin-book-slot" label="Available slot">
              <Select
                id="admin-book-slot"
                disabled={availableAdminBookingSlots.length === 0}
                onChange={(changeEvent) =>
                  setBookingSlotId(changeEvent.target.value)
                }
                value={bookingSlotId}
              >
                <option value="">Select slot</option>
                {availableAdminBookingSlots.map((slot) => (
                  <option key={slot.id} value={slot.id}>
                    {formatDateTimeLabel(slot.startTime)} •{" "}
                    {slot.teacher.firstName} {slot.teacher.lastName}
                    {slot.class?.name ? ` • ${slot.class.name}` : ""}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="md:col-span-2">
              <Field
                htmlFor="admin-book-notes"
                label="Booking notes (optional)"
              >
                <Textarea
                  id="admin-book-notes"
                  onChange={(changeEvent) =>
                    setBookingNotes(changeEvent.target.value)
                  }
                  rows={2}
                  value={bookingNotes}
                />
              </Field>
            </div>

            <div className="md:col-span-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {studentOptions.length === 0
                ? "No eligible students were found from current class rosters."
                : linkedParents.length === 0
                  ? "Selected student has no linked parent/guardian for booking."
                  : availableAdminBookingSlots.length === 0
                    ? "No available slots match the current teacher filter."
                    : "Server-side checks will verify parent-student link, slot availability, and booking constraints."}
            </div>

            <div className="md:col-span-2">
              <button
                className={buttonClassName({ variant: "primary" })}
                disabled={
                  isSaving ||
                  !bookingSlotId ||
                  !bookingStudentId ||
                  !bookingParentId ||
                  studentOptions.length === 0 ||
                  linkedParents.length === 0
                }
                type="submit"
              >
                {isSaving ? "Booking..." : "Book for Parent"}
              </button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Slots</CardTitle>
          <CardDescription>
            {slots.length} slot{slots.length === 1 ? "" : "s"} configured.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {slots.length === 0 ? (
            <EmptyState
              compact
              title="No slots"
              description="Create slots manually or use bulk generation."
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50/80">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-slate-700">
                        Teacher
                      </th>
                      <th className="px-4 py-3 font-semibold text-slate-700">
                        Class
                      </th>
                      <th className="px-4 py-3 font-semibold text-slate-700">
                        Time
                      </th>
                      <th className="px-4 py-3 font-semibold text-slate-700">
                        Booking
                      </th>
                      <th className="px-4 py-3 font-semibold text-slate-700">
                        Status
                      </th>
                      <th className="px-4 py-3 font-semibold text-slate-700">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {slots.map((slot) => (
                      <tr className="align-top hover:bg-slate-50" key={slot.id}>
                        <td className="px-4 py-3 text-slate-900">
                          {slot.teacher.firstName} {slot.teacher.lastName}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {slot.class?.name ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          <p>{formatDateTimeLabel(slot.startTime)}</p>
                          <p className="mt-1">
                            {formatDateTimeLabel(slot.endTime)}
                          </p>
                          {slot.location ? (
                            <p className="mt-1 text-xs">{slot.location}</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {slot.bookedParent ? (
                            <>
                              <p>
                                Parent: {slot.bookedParent.firstName}{" "}
                                {slot.bookedParent.lastName}
                              </p>
                              <p className="mt-1">
                                Student: {slot.bookedStudent?.firstName}{" "}
                                {slot.bookedStudent?.lastName}
                              </p>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={getStatusVariant(slot.status)}>
                            {formatInterviewSlotStatusLabel(slot.status)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            {slot.status === "BOOKED" ? (
                              <button
                                className={buttonClassName({
                                  size: "sm",
                                  variant: "secondary",
                                })}
                                onClick={() => setUnbookTarget(slot)}
                                type="button"
                              >
                                Unbook
                              </button>
                            ) : (
                              <>
                                <button
                                  className={buttonClassName({
                                    size: "sm",
                                    variant: "secondary",
                                  })}
                                  onClick={() => beginEdit(slot)}
                                  type="button"
                                >
                                  Edit
                                </button>
                                <button
                                  className={buttonClassName({
                                    size: "sm",
                                    variant: "secondary",
                                  })}
                                  onClick={() => setToggleTarget(slot)}
                                  type="button"
                                >
                                  {slot.status === "CANCELLED"
                                    ? "Activate"
                                    : "Cancel"}
                                </button>
                                <button
                                  className={buttonClassName({
                                    size: "sm",
                                    variant: "secondary",
                                  })}
                                  onClick={() => setDeleteTarget(slot)}
                                  type="button"
                                >
                                  Delete
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        description="This will remove the current parent/student booking from the selected slot."
        confirmLabel="Unbook slot"
        confirmVariant="danger"
        isOpen={Boolean(unbookTarget)}
        isPending={isSaving}
        onConfirm={() =>
          unbookTarget ? handleUnbook(unbookTarget) : Promise.resolve()
        }
        onCancel={() => {
          if (!isSaving) {
            setUnbookTarget(null);
          }
        }}
        pendingLabel="Processing..."
        title="Unbook interview slot?"
      />

      <ConfirmDialog
        confirmLabel={
          toggleTarget?.status === "CANCELLED" ? "Activate slot" : "Cancel slot"
        }
        confirmVariant="secondary"
        description={
          toggleTarget?.status === "CANCELLED"
            ? "This slot will become available for booking again."
            : "Cancelled slots cannot be booked by parents."
        }
        isOpen={Boolean(toggleTarget)}
        isPending={isSaving}
        onConfirm={() =>
          toggleTarget ? handleToggleCancelled(toggleTarget) : Promise.resolve()
        }
        onCancel={() => {
          if (!isSaving) {
            setToggleTarget(null);
          }
        }}
        pendingLabel="Processing..."
        title={
          toggleTarget?.status === "CANCELLED"
            ? "Activate interview slot?"
            : "Cancel interview slot?"
        }
      />

      <ConfirmDialog
        description="This permanently removes the slot. Booked slots cannot be deleted."
        confirmLabel="Delete slot"
        confirmVariant="danger"
        isOpen={Boolean(deleteTarget)}
        isPending={isSaving}
        onConfirm={() =>
          deleteTarget ? handleDelete(deleteTarget) : Promise.resolve()
        }
        onCancel={() => {
          if (!isSaving) {
            setDeleteTarget(null);
          }
        }}
        pendingLabel="Processing..."
        title="Delete interview slot?"
      />

      {editingSlotId ? (
        <Card>
          <CardHeader>
            <CardTitle>Edit Slot</CardTitle>
            <CardDescription>
              Only unbooked slots can be edited.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <Field htmlFor="edit-slot-teacher" label="Teacher">
              <Select
                id="edit-slot-teacher"
                onChange={(changeEvent) =>
                  setEditTeacherId(changeEvent.target.value)
                }
                value={editTeacherId}
              >
                {teacherOptions.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {teacher.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field htmlFor="edit-slot-class" label="Class (optional)">
              <Select
                id="edit-slot-class"
                onChange={(changeEvent) =>
                  setEditClassId(changeEvent.target.value)
                }
                value={editClassId}
              >
                <option value="">No class context</option>
                {classes.map((schoolClass) => (
                  <option key={schoolClass.id} value={schoolClass.id}>
                    {schoolClass.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field htmlFor="edit-slot-location" label="Location">
              <Input
                id="edit-slot-location"
                onChange={(changeEvent) =>
                  setEditLocation(changeEvent.target.value)
                }
                value={editLocation}
              />
            </Field>

            <Field htmlFor="edit-slot-start" label="Start">
              <Input
                id="edit-slot-start"
                onChange={(changeEvent) =>
                  setEditStartTime(changeEvent.target.value)
                }
                type="datetime-local"
                value={editStartTime}
              />
            </Field>

            <Field htmlFor="edit-slot-end" label="End">
              <Input
                id="edit-slot-end"
                onChange={(changeEvent) =>
                  setEditEndTime(changeEvent.target.value)
                }
                type="datetime-local"
                value={editEndTime}
              />
            </Field>

            <Field htmlFor="edit-slot-mode" label="Meeting mode">
              <Input
                id="edit-slot-mode"
                onChange={(changeEvent) =>
                  setEditMeetingMode(changeEvent.target.value)
                }
                value={editMeetingMode}
              />
            </Field>

            <div className="md:col-span-3">
              <Field htmlFor="edit-slot-notes" label="Notes">
                <Textarea
                  id="edit-slot-notes"
                  onChange={(changeEvent) =>
                    setEditNotes(changeEvent.target.value)
                  }
                  rows={2}
                  value={editNotes}
                />
              </Field>
            </div>

            <div className="md:col-span-3 flex flex-wrap gap-2">
              <button
                className={buttonClassName({ variant: "primary" })}
                disabled={isSaving}
                onClick={() => void saveEdit()}
                type="button"
              >
                {isSaving ? "Saving..." : "Save slot"}
              </button>
              <button
                className={buttonClassName({ variant: "secondary" })}
                onClick={() => setEditingSlotId(null)}
                type="button"
              >
                Cancel edit
              </button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
