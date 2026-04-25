"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/lib/auth/auth-context";
import {
  cancelMyInterviewBooking,
  formatInterviewSlotStatusLabel,
  listParentInterviewBookings,
  listParentInterviewEvents,
  type InterviewEvent,
  type InterviewSlotParent,
} from "@/lib/api/interviews";
import {
  listMyParentStudents,
  type ParentStudentLink,
} from "@/lib/api/students";
import { formatDateTimeLabel } from "@/lib/utils";

export function ParentInterviewsOverview() {
  const searchParams = useSearchParams();
  const { session } = useAuth();

  const [links, setLinks] = useState<ParentStudentLink[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [events, setEvents] = useState<InterviewEvent[]>([]);
  const [bookings, setBookings] = useState<InterviewSlotParent[]>([]);
  const [eventQuery, setEventQuery] = useState("");
  const [bookingQuery, setBookingQuery] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadStudents() {
      if (!session?.user.id) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await listMyParentStudents();
        setLinks(response);

        const requestedStudentId = searchParams.get("studentId") ?? "";
        const resolvedStudentId =
          requestedStudentId &&
          response.some((entry) => entry.studentId === requestedStudentId)
            ? requestedStudentId
            : (response[0]?.studentId ?? "");

        setSelectedStudentId((current) => current || resolvedStudentId);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load linked students.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void loadStudents();
  }, [searchParams, session?.user.id]);

  async function reloadForStudent(studentId: string) {
    if (!studentId) {
      setEvents([]);
      setBookings([]);
      return;
    }

    setIsLoadingData(true);
    setError(null);

    try {
      const [eventResponse, bookingResponse] = await Promise.all([
        listParentInterviewEvents(studentId),
        listParentInterviewBookings({ studentId }),
      ]);

      setEvents(eventResponse);
      setBookings(bookingResponse);
    } catch (loadError) {
      setEvents([]);
      setBookings([]);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load interviews.",
      );
    } finally {
      setIsLoadingData(false);
    }
  }

  useEffect(() => {
    void reloadForStudent(selectedStudentId);
  }, [selectedStudentId]);

  const selectedLink = useMemo(
    () => links.find((entry) => entry.studentId === selectedStudentId) ?? null,
    [links, selectedStudentId],
  );

  const filteredEvents = useMemo(() => {
    const query = eventQuery.trim().toLowerCase();
    if (!query) {
      return events;
    }

    return events.filter((event) => {
      const title = event.title.toLowerCase();
      const description = (event.description ?? "").toLowerCase();
      return title.includes(query) || description.includes(query);
    });
  }, [eventQuery, events]);

  const filteredBookings = useMemo(() => {
    const query = bookingQuery.trim().toLowerCase();
    if (!query) {
      return bookings;
    }

    return bookings.filter((slot) => {
      const teacher =
        `${slot.teacher.firstName} ${slot.teacher.lastName}`.toLowerCase();
      const eventTitle = slot.interviewEvent.title.toLowerCase();
      return teacher.includes(query) || eventTitle.includes(query);
    });
  }, [bookingQuery, bookings]);

  async function handleCancelBooking(slotId: string) {
    setError(null);
    setSuccessMessage(null);

    try {
      await cancelMyInterviewBooking(slotId);
      setSuccessMessage("Booking cancelled.");
      await reloadForStudent(selectedStudentId);
    } catch (cancelError) {
      setError(
        cancelError instanceof Error
          ? cancelError.message
          : "Unable to cancel booking.",
      );
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Parent-Teacher Interviews"
        description="Book and manage your interview appointments."
        actions={
          <Link
            className={buttonClassName({ variant: "secondary" })}
            href="/parent"
          >
            Back to parent portal
          </Link>
        }
        meta={
          <Badge variant="neutral">
            {links.length} linked child{links.length === 1 ? "" : "ren"}
          </Badge>
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {error && selectedStudentId ? (
        <button
          className={buttonClassName({ variant: "secondary", size: "sm" })}
          onClick={() => void reloadForStudent(selectedStudentId)}
          type="button"
        >
          Retry loading interviews
        </button>
      ) : null}
      {successMessage ? <Notice tone="success">{successMessage}</Notice> : null}

      {isLoading ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Loading students...</p>
          </CardContent>
        </Card>
      ) : null}

      {!isLoading && links.length === 0 ? (
        <EmptyState
          title="No linked students"
          description="No student records are linked to this parent account."
        />
      ) : null}

      {!isLoading && links.length > 0 ? (
        <>
          <Card>
            <CardContent className="grid gap-4 pt-6 md:grid-cols-[1fr_auto] md:items-end">
              <Field htmlFor="parent-interview-student" label="Student">
                <Select
                  id="parent-interview-student"
                  onChange={(changeEvent) =>
                    setSelectedStudentId(changeEvent.target.value)
                  }
                  value={selectedStudentId}
                >
                  {links.map((link) => (
                    <option key={link.studentId} value={link.studentId}>
                      {link.student.firstName} {link.student.lastName}
                    </option>
                  ))}
                </Select>
              </Field>

              {selectedStudentId ? (
                <Link
                  className={buttonClassName({ variant: "secondary" })}
                  href={`/parent/students/${selectedStudentId}`}
                >
                  View student profile
                </Link>
              ) : null}
            </CardContent>
          </Card>

          {selectedLink ? (
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Available events</CardTitle>
                  <CardDescription>
                    Book open slots for this student
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-sm font-semibold text-slate-900">
                  {events.length}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Current bookings</CardTitle>
                  <CardDescription>Appointments already booked</CardDescription>
                </CardHeader>
                <CardContent className="text-sm font-semibold text-slate-900">
                  {bookings.length}
                </CardContent>
              </Card>
            </div>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Interview Events</CardTitle>
              <CardDescription>
                Select an event to view available slots and book an appointment.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <Field
                  htmlFor="parent-interview-event-query"
                  label="Search events"
                >
                  <Input
                    id="parent-interview-event-query"
                    onChange={(changeEvent) =>
                      setEventQuery(changeEvent.target.value)
                    }
                    placeholder="Search by event title or description"
                    value={eventQuery}
                  />
                </Field>
              </div>
              {isLoadingData ? (
                <p className="text-sm text-slate-500">
                  Loading interview events...
                </p>
              ) : filteredEvents.length === 0 ? (
                <EmptyState
                  compact
                  title={
                    events.length === 0
                      ? "No active events"
                      : "No matching events"
                  }
                  description={
                    events.length === 0
                      ? "No interview events are currently available for this student."
                      : "Try adjusting your search text."
                  }
                />
              ) : (
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                      <thead className="bg-slate-50/80">
                        <tr>
                          <th className="px-4 py-3 font-semibold text-slate-700">
                            Event
                          </th>
                          <th className="px-4 py-3 font-semibold text-slate-700">
                            Booking Window
                          </th>
                          <th className="px-4 py-3 font-semibold text-slate-700">
                            Event Dates
                          </th>
                          <th className="px-4 py-3 font-semibold text-slate-700">
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white">
                        {filteredEvents.map((event) => (
                          <tr
                            className="align-top hover:bg-slate-50"
                            key={event.id}
                          >
                            <td className="px-4 py-3">
                              <p className="font-medium text-slate-900">
                                {event.title}
                              </p>
                              {event.description ? (
                                <p className="mt-1 text-xs text-slate-500">
                                  {event.description}
                                </p>
                              ) : null}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              <p>
                                {event.bookingOpensAt
                                  ? formatDateTimeLabel(event.bookingOpensAt)
                                  : "No open date"}
                              </p>
                              <p className="mt-1">
                                {event.bookingClosesAt
                                  ? formatDateTimeLabel(event.bookingClosesAt)
                                  : "No close date"}
                              </p>
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              <p>{formatDateTimeLabel(event.startsAt)}</p>
                              <p className="mt-1">
                                {formatDateTimeLabel(event.endsAt)}
                              </p>
                            </td>
                            <td className="px-4 py-3">
                              <Link
                                className={buttonClassName({
                                  size: "sm",
                                  variant: "secondary",
                                })}
                                href={`/parent/interviews/${encodeURIComponent(event.id)}?studentId=${encodeURIComponent(selectedStudentId)}`}
                              >
                                View slots
                              </Link>
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

          <Card>
            <CardHeader>
              <CardTitle>My Bookings</CardTitle>
              <CardDescription>
                Booked slots for the selected student.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <Field
                  htmlFor="parent-interview-booking-query"
                  label="Search bookings"
                >
                  <Input
                    id="parent-interview-booking-query"
                    onChange={(changeEvent) =>
                      setBookingQuery(changeEvent.target.value)
                    }
                    placeholder="Search by teacher or event"
                    value={bookingQuery}
                  />
                </Field>
              </div>
              {isLoadingData ? (
                <p className="text-sm text-slate-500">Loading bookings...</p>
              ) : filteredBookings.length === 0 ? (
                <EmptyState
                  compact
                  title={
                    bookings.length === 0
                      ? "No bookings"
                      : "No matching bookings"
                  }
                  description={
                    bookings.length === 0
                      ? "No interview slots are booked for this student."
                      : "Try adjusting your search text."
                  }
                />
              ) : (
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                      <thead className="bg-slate-50/80">
                        <tr>
                          <th className="px-4 py-3 font-semibold text-slate-700">
                            Event
                          </th>
                          <th className="px-4 py-3 font-semibold text-slate-700">
                            Teacher
                          </th>
                          <th className="px-4 py-3 font-semibold text-slate-700">
                            Time
                          </th>
                          <th className="px-4 py-3 font-semibold text-slate-700">
                            Status
                          </th>
                          <th className="px-4 py-3 font-semibold text-slate-700">
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white">
                        {filteredBookings.map((slot) => (
                          <tr
                            className="align-top hover:bg-slate-50"
                            key={slot.id}
                          >
                            <td className="px-4 py-3 text-slate-900">
                              {slot.interviewEvent.title}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {slot.teacher.firstName} {slot.teacher.lastName}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              <p>{formatDateTimeLabel(slot.startTime)}</p>
                              <p className="mt-1">
                                {formatDateTimeLabel(slot.endTime)}
                              </p>
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant="warning">
                                {formatInterviewSlotStatusLabel(slot.status)}
                              </Badge>
                            </td>
                            <td className="px-4 py-3">
                              <button
                                className={buttonClassName({
                                  size: "sm",
                                  variant: "secondary",
                                })}
                                onClick={() =>
                                  void handleCancelBooking(slot.id)
                                }
                                type="button"
                              >
                                Cancel booking
                              </button>
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
        </>
      ) : null}
    </div>
  );
}
