"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/lib/auth/auth-context";
import {
  bookInterviewSlot,
  cancelMyInterviewBooking,
  formatInterviewSlotStatusLabel,
  listParentInterviewBookings,
  listParentInterviewEventSlots,
  listParentInterviewEvents,
  type InterviewEvent,
  type InterviewSlotParent,
} from "@/lib/api/interviews";
import { listMyParentStudents, type ParentStudentLink } from "@/lib/api/students";
import { formatDateTimeLabel } from "@/lib/utils";

function getStatusVariant(status: InterviewSlotParent["status"]) {
  if (status === "AVAILABLE") {
    return "success" as const;
  }

  if (status === "BOOKED") {
    return "warning" as const;
  }

  return "neutral" as const;
}

export function ParentInterviewEventDetail({ eventId }: { eventId: string }) {
  const searchParams = useSearchParams();
  const { session } = useAuth();

  const [links, setLinks] = useState<ParentStudentLink[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [event, setEvent] = useState<InterviewEvent | null>(null);
  const [slots, setSlots] = useState<InterviewSlotParent[]>([]);
  const [bookings, setBookings] = useState<InterviewSlotParent[]>([]);
  const [slotQuery, setSlotQuery] = useState("");

  const [isLoadingStudents, setIsLoadingStudents] = useState(true);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const selectedLink = useMemo(
    () => links.find((entry) => entry.studentId === selectedStudentId) ?? null,
    [links, selectedStudentId],
  );

  const filteredSlots = useMemo(() => {
    const query = slotQuery.trim().toLowerCase();
    if (!query) {
      return slots;
    }

    return slots.filter((slot) => {
      const teacher = `${slot.teacher.firstName} ${slot.teacher.lastName}`.toLowerCase();
      const className = (slot.class?.name ?? "").toLowerCase();
      return teacher.includes(query) || className.includes(query);
    });
  }, [slotQuery, slots]);

  useEffect(() => {
    async function loadStudents() {
      if (!session?.user.id) {
        return;
      }

      setIsLoadingStudents(true);
      setError(null);

      try {
        const response = await listMyParentStudents();
        setLinks(response);

        const requestedStudentId = searchParams.get("studentId") ?? "";
        const resolvedStudentId =
          requestedStudentId && response.some((entry) => entry.studentId === requestedStudentId)
            ? requestedStudentId
            : response[0]?.studentId ?? "";

        setSelectedStudentId((current) => current || resolvedStudentId);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load linked students.");
      } finally {
        setIsLoadingStudents(false);
      }
    }

    void loadStudents();
  }, [searchParams, session?.user.id]);

  useEffect(() => {
    void refreshCurrentStudentData();
  }, [eventId, selectedStudentId]);

  async function refreshCurrentStudentData() {
    if (!selectedStudentId) {
      setEvent(null);
      setSlots([]);
      setBookings([]);
      return;
    }

    setIsLoadingData(true);
    setError(null);

    try {
      const [eventResponse, slotResponse, bookingResponse] = await Promise.all([
        listParentInterviewEvents(selectedStudentId),
        listParentInterviewEventSlots(eventId, selectedStudentId),
        listParentInterviewBookings({ interviewEventId: eventId, studentId: selectedStudentId }),
      ]);

      setEvent(eventResponse.find((entry) => entry.id === eventId) ?? null);
      setSlots(slotResponse);
      setBookings(bookingResponse);
    } catch (loadError) {
      setEvent(null);
      setSlots([]);
      setBookings([]);
      setError(loadError instanceof Error ? loadError.message : "Unable to load event slots.");
    } finally {
      setIsLoadingData(false);
    }
  }

  async function handleBook(slotId: string) {
    if (!selectedStudentId) {
      return;
    }

    setActiveSlotId(slotId);
    setError(null);
    setSuccessMessage(null);

    try {
      await bookInterviewSlot(slotId, { studentId: selectedStudentId });
      setSuccessMessage("Interview slot booked.");
      await refreshCurrentStudentData();
    } catch (bookError) {
      setError(bookError instanceof Error ? bookError.message : "Unable to book interview slot.");
    } finally {
      setActiveSlotId(null);
    }
  }

  async function handleCancel(slotId: string) {
    setActiveSlotId(slotId);
    setError(null);
    setSuccessMessage(null);

    try {
      await cancelMyInterviewBooking(slotId);
      setSuccessMessage("Interview booking cancelled.");
      await refreshCurrentStudentData();
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "Unable to cancel booking.");
    } finally {
      setActiveSlotId(null);
    }
  }

  if (isLoadingStudents) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-slate-500">Loading linked students...</p>
        </CardContent>
      </Card>
    );
  }

  if (links.length === 0) {
    return (
      <EmptyState
        title="No linked students"
        description="No student records are linked to this parent account."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={event?.title ?? "Interview Event"}
        description="Select an available slot to confirm your parent-teacher interview."
        actions={
          <Link
            className={buttonClassName({ variant: "secondary" })}
            href={`/parent/interviews${selectedStudentId ? `?studentId=${encodeURIComponent(selectedStudentId)}` : ""}`}
          >
            Back to interviews
          </Link>
        }
        meta={
          <Badge variant="neutral">
            {bookings.length} booking{bookings.length === 1 ? "" : "s"}
          </Badge>
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {error && selectedStudentId ? (
        <button
          className={buttonClassName({ size: "sm", variant: "secondary" })}
          onClick={() => void refreshCurrentStudentData()}
          type="button"
        >
          Retry loading slots
        </button>
      ) : null}
      {successMessage ? <Notice tone="success">{successMessage}</Notice> : null}

      <Card>
        <CardContent className="grid gap-4 pt-6 md:grid-cols-[1fr_auto] md:items-end">
          <Field htmlFor="parent-event-student" label="Student">
            <Select
              id="parent-event-student"
              onChange={(changeEvent) => setSelectedStudentId(changeEvent.target.value)}
              value={selectedStudentId}
            >
              {links.map((link) => (
                <option key={link.studentId} value={link.studentId}>
                  {link.student.firstName} {link.student.lastName}
                </option>
              ))}
            </Select>
          </Field>

          {selectedLink ? (
            <p className="text-xs text-slate-500">
              Booking for{" "}
              <span className="font-medium text-slate-700">
                {selectedLink.student.firstName} {selectedLink.student.lastName}
              </span>
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Available Slots</CardTitle>
          <CardDescription>
            {isLoadingData ? "Loading..." : `${slots.length} slot${slots.length === 1 ? "" : "s"} visible for this student`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Field htmlFor="parent-event-slot-query" label="Search slots">
              <Input
                id="parent-event-slot-query"
                onChange={(changeEvent) => setSlotQuery(changeEvent.target.value)}
                placeholder="Search by teacher or class"
                value={slotQuery}
              />
            </Field>
          </div>
          {isLoadingData ? (
            <p className="text-sm text-slate-500">Loading slots...</p>
          ) : filteredSlots.length === 0 ? (
            <EmptyState
              compact
              title={slots.length === 0 ? "No slots available" : "No matching slots"}
              description={
                slots.length === 0
                  ? "No interview slots are currently available for this student in this event."
                  : "Try adjusting your search text."
              }
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50/80">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-slate-700">Teacher</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Class</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Time</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Status</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {filteredSlots.map((slot) => {
                      const isMyBooking =
                        slot.status === "BOOKED" &&
                        slot.bookedParentId === session?.user.id &&
                        slot.bookedStudentId === selectedStudentId;

                      return (
                        <tr className="align-top hover:bg-slate-50" key={slot.id}>
                          <td className="px-4 py-3 text-slate-900">
                            {slot.teacher.firstName} {slot.teacher.lastName}
                          </td>
                          <td className="px-4 py-3 text-slate-600">{slot.class?.name ?? "—"}</td>
                          <td className="px-4 py-3 text-slate-600">
                            <p>{formatDateTimeLabel(slot.startTime)}</p>
                            <p className="mt-1">{formatDateTimeLabel(slot.endTime)}</p>
                            {slot.location ? <p className="mt-1 text-xs">{slot.location}</p> : null}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={getStatusVariant(slot.status)}>
                              {formatInterviewSlotStatusLabel(slot.status)}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            {slot.status === "AVAILABLE" ? (
                              <button
                                className={buttonClassName({ size: "sm", variant: "primary" })}
                                disabled={activeSlotId === slot.id}
                                onClick={() => void handleBook(slot.id)}
                                type="button"
                              >
                                {activeSlotId === slot.id ? "Booking..." : "Book"}
                              </button>
                            ) : isMyBooking ? (
                              <button
                                className={buttonClassName({ size: "sm", variant: "secondary" })}
                                disabled={activeSlotId === slot.id}
                                onClick={() => void handleCancel(slot.id)}
                                type="button"
                              >
                                {activeSlotId === slot.id ? "Cancelling..." : "Cancel booking"}
                              </button>
                            ) : (
                              <span className="text-xs text-slate-500">Unavailable</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
