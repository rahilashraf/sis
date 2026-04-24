"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import {
  formatInterviewSlotStatusLabel,
  listTeacherInterviewSlots,
  type InterviewSlotTeacher,
} from "@/lib/api/interviews";
import { formatDateTimeLabel } from "@/lib/utils";

function getStatusVariant(status: InterviewSlotTeacher["status"]) {
  if (status === "AVAILABLE") {
    return "success" as const;
  }

  if (status === "BOOKED") {
    return "warning" as const;
  }

  return "neutral" as const;
}

export function TeacherInterviewsOverview({ eventId }: { eventId?: string }) {
  const [slots, setSlots] = useState<InterviewSlotTeacher[]>([]);
  const [selectedEventId, setSelectedEventId] = useState(eventId ?? "");
  const [slotQuery, setSlotQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadSlots() {
    setIsLoading(true);
    setError(null);

    try {
      const response = await listTeacherInterviewSlots(
        eventId ? { interviewEventId: eventId } : undefined,
      );
      setSlots(response);
    } catch (loadError) {
      setSlots([]);
      setError(loadError instanceof Error ? loadError.message : "Unable to load interview slots.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadSlots();
  }, [eventId]);

  const eventOptions = useMemo(() => {
    const dedupe = new Map<string, string>();

    for (const slot of slots) {
      dedupe.set(slot.interviewEvent.id, slot.interviewEvent.title);
    }

    return [...dedupe.entries()].map(([id, title]) => ({ id, title }));
  }, [slots]);

  useEffect(() => {
    if (eventId) {
      setSelectedEventId(eventId);
      return;
    }

    if (!selectedEventId && eventOptions.length > 0) {
      setSelectedEventId(eventOptions[0].id);
    }
  }, [eventId, eventOptions, selectedEventId]);

  const eventScopedSlots = useMemo(() => {
    if (eventId) {
      return slots;
    }

    if (!selectedEventId) {
      return slots;
    }

    return slots.filter((slot) => slot.interviewEvent.id === selectedEventId);
  }, [eventId, selectedEventId, slots]);

  const filteredSlots = useMemo(() => {
    const query = slotQuery.trim().toLowerCase();
    if (!query) {
      return eventScopedSlots;
    }

    return eventScopedSlots.filter((slot) => {
      const className = (slot.class?.name ?? "").toLowerCase();
      const eventTitle = slot.interviewEvent.title.toLowerCase();
      const studentName = slot.bookedStudent
        ? `${slot.bookedStudent.firstName} ${slot.bookedStudent.lastName}`.toLowerCase()
        : "";
      const parentName = slot.bookedParent
        ? `${slot.bookedParent.firstName} ${slot.bookedParent.lastName}`.toLowerCase()
        : "";

      return (
        className.includes(query) ||
        eventTitle.includes(query) ||
        studentName.includes(query) ||
        parentName.includes(query)
      );
    });
  }, [eventScopedSlots, slotQuery]);

  const counts = useMemo(() => {
    return filteredSlots.reduce(
      (accumulator, slot) => {
        if (slot.status === "BOOKED") {
          accumulator.booked += 1;
        } else if (slot.status === "AVAILABLE") {
          accumulator.available += 1;
        } else {
          accumulator.cancelled += 1;
        }

        return accumulator;
      },
      { booked: 0, available: 0, cancelled: 0 },
    );
  }, [filteredSlots]);

  const selectedEventTitle =
    eventOptions.find((entry) => entry.id === selectedEventId)?.title ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Teacher Interviews"
        description="Review your interview schedule and booked parent/student details."
        actions={
          eventId ? (
            <Link className={buttonClassName({ variant: "secondary" })} href="/teacher/interviews">
              View all events
            </Link>
          ) : null
        }
        meta={
          <Badge variant="neutral">
            {filteredSlots.length} slot{filteredSlots.length === 1 ? "" : "s"}
          </Badge>
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {error ? (
        <button
          className={buttonClassName({ variant: "secondary", size: "sm" })}
          onClick={() => void loadSlots()}
          type="button"
        >
          Retry loading schedule
        </button>
      ) : null}

      {!eventId ? (
        <Card>
          <CardContent className="grid gap-4 pt-6 md:grid-cols-2 md:items-end">
            <Field htmlFor="teacher-interview-event" label="Interview event">
              <Select
                id="teacher-interview-event"
                onChange={(changeEvent) => setSelectedEventId(changeEvent.target.value)}
                value={selectedEventId}
              >
                <option value="">All events</option>
                {eventOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.title}
                  </option>
                ))}
              </Select>
            </Field>

            {selectedEventId ? (
              <Link
                className={buttonClassName({ variant: "secondary" })}
                href={`/teacher/interviews/${encodeURIComponent(selectedEventId)}`}
              >
                Open event view
              </Link>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Booked</CardTitle>
            <CardDescription>Confirmed parent appointments</CardDescription>
          </CardHeader>
          <CardContent className="text-sm font-semibold text-slate-900">{counts.booked}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Available</CardTitle>
            <CardDescription>Open slots for booking</CardDescription>
          </CardHeader>
          <CardContent className="text-sm font-semibold text-slate-900">{counts.available}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Cancelled</CardTitle>
            <CardDescription>Cancelled slots</CardDescription>
          </CardHeader>
          <CardContent className="text-sm font-semibold text-slate-900">{counts.cancelled}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{selectedEventTitle ?? "Interview Slots"}</CardTitle>
          <CardDescription>
            {isLoading ? "Loading..." : "Your schedule with booking status and participant details."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Field htmlFor="teacher-interview-slot-query" label="Search slots">
              <Input
                id="teacher-interview-slot-query"
                onChange={(changeEvent) => setSlotQuery(changeEvent.target.value)}
                placeholder="Search by class, student, parent, or event"
                value={slotQuery}
              />
            </Field>
          </div>
          {isLoading ? (
            <p className="text-sm text-slate-500">Loading interview slots...</p>
          ) : filteredSlots.length === 0 ? (
            <EmptyState
              compact
              title={eventScopedSlots.length === 0 ? "No interview slots" : "No matching slots"}
              description={
                eventScopedSlots.length === 0
                  ? "No interview slots are currently assigned to you."
                  : "Try adjusting your search text."
              }
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50/80">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-slate-700">Event</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Class</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Time</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Student</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Parent</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {filteredSlots.map((slot) => (
                      <tr className="align-top hover:bg-slate-50" key={slot.id}>
                        <td className="px-4 py-3 text-slate-900">{slot.interviewEvent.title}</td>
                        <td className="px-4 py-3 text-slate-600">{slot.class?.name ?? "—"}</td>
                        <td className="px-4 py-3 text-slate-600">
                          <p>{formatDateTimeLabel(slot.startTime)}</p>
                          <p className="mt-1">{formatDateTimeLabel(slot.endTime)}</p>
                          {slot.location ? <p className="mt-1 text-xs">{slot.location}</p> : null}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {slot.bookedStudent
                            ? `${slot.bookedStudent.firstName} ${slot.bookedStudent.lastName}`
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {slot.bookedParent ? (
                            <div>
                              <p>
                                {slot.bookedParent.firstName} {slot.bookedParent.lastName}
                              </p>
                              {slot.bookedParent.email ? (
                                <p className="mt-1 text-xs">{slot.bookedParent.email}</p>
                              ) : null}
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={getStatusVariant(slot.status)}>
                            {formatInterviewSlotStatusLabel(slot.status)}
                          </Badge>
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
    </div>
  );
}
