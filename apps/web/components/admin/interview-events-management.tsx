"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { CheckboxField, Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/lib/auth/auth-context";
import { getDefaultSchoolContextId } from "@/lib/auth/school-membership";
import { listSchools, type School } from "@/lib/api/schools";
import { listInterviewEvents, type InterviewEvent } from "@/lib/api/interviews";
import { formatDateTimeLabel } from "@/lib/utils";

const manageRoles = new Set(["OWNER", "SUPER_ADMIN", "ADMIN", "STAFF"]);

function formatEventState(event: InterviewEvent) {
  if (!event.isActive) {
    return { label: "Inactive", variant: "neutral" as const };
  }

  if (!event.isPublished) {
    return { label: "Draft", variant: "warning" as const };
  }

  return { label: "Published", variant: "success" as const };
}

export function InterviewEventsManagement() {
  const { session } = useAuth();
  const role = session?.user.role ?? "";

  const [schools, setSchools] = useState<School[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [includeInactive, setIncludeInactive] = useState(true);
  const [includeUnpublished, setIncludeUnpublished] = useState(true);
  const [eventQuery, setEventQuery] = useState("");

  const [events, setEvents] = useState<InterviewEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedSchool = useMemo(
    () => schools.find((school) => school.id === schoolId) ?? null,
    [schools, schoolId],
  );

  const filteredEvents = useMemo(() => {
    const query = eventQuery.trim().toLowerCase();
    if (!query) {
      return events;
    }

    return events.filter((event) => {
      const title = event.title.toLowerCase();
      const description = (event.description ?? "").toLowerCase();
      const schoolName = event.school.name.toLowerCase();
      return title.includes(query) || description.includes(query) || schoolName.includes(query);
    });
  }, [eventQuery, events]);

  useEffect(() => {
    async function loadInitial() {
      if (!manageRoles.has(role)) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const schoolResponse = await listSchools({ includeInactive: false });
        setSchools(schoolResponse);

        const defaultSchoolId =
          getDefaultSchoolContextId(session?.user) ?? schoolResponse[0]?.id ?? "";
        const resolvedSchoolId =
          schoolResponse.find((school) => school.id === defaultSchoolId)?.id ??
          schoolResponse[0]?.id ??
          "";

        setSchoolId(resolvedSchoolId);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load schools.");
      } finally {
        setIsLoading(false);
      }
    }

    void loadInitial();
  }, [role, session?.user]);

  async function loadEvents() {
    if (!manageRoles.has(role)) {
      return;
    }

    setIsRefreshing(true);
    setError(null);

    try {
      const response = await listInterviewEvents({
        schoolId: schoolId || undefined,
        includeInactive,
        includeUnpublished,
      });
      setEvents(response);
    } catch (loadError) {
      setEvents([]);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load interview events.",
      );
    } finally {
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    void loadEvents();
  }, [includeInactive, includeUnpublished, role, schoolId]);

  if (!manageRoles.has(role)) {
    return (
      <EmptyState
        title="Restricted"
        description="Only OWNER, SUPER_ADMIN, ADMIN, and STAFF roles can manage interviews."
      />
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-slate-500">Loading interview events...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Interview Events"
        description="Create and manage parent-teacher interview events."
        actions={
          <Link className={buttonClassName({ variant: "primary" })} href="/admin/interviews/new">
            New event
          </Link>
        }
        meta={<Badge variant="neutral">{selectedSchool?.name ?? "All schools"}</Badge>}
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {error ? (
        <button
          className={buttonClassName({ variant: "secondary", size: "sm" })}
          onClick={() => void loadEvents()}
          type="button"
        >
          Retry loading events
        </button>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Filter by school and publication state.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <Field htmlFor="interview-events-school" label="School">
            <Select
              id="interview-events-school"
              onChange={(event) => setSchoolId(event.target.value)}
              value={schoolId}
            >
              <option value="">All schools</option>
              {schools.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="flex items-end">
            <CheckboxField
              checked={includeInactive}
              label="Include inactive"
              onChange={(event) => setIncludeInactive(event.target.checked)}
            />
          </div>

          <div className="flex items-end">
            <CheckboxField
              checked={includeUnpublished}
              label="Include drafts"
              onChange={(event) => setIncludeUnpublished(event.target.checked)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Events</CardTitle>
          <CardDescription>
            {isRefreshing ? "Refreshing..." : `${filteredEvents.length} event${filteredEvents.length === 1 ? "" : "s"}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Field htmlFor="interview-events-query" label="Search events">
              <Input
                id="interview-events-query"
                onChange={(event) => setEventQuery(event.target.value)}
                placeholder="Search by title, school, or description"
                value={eventQuery}
              />
            </Field>
          </div>
          {filteredEvents.length === 0 ? (
            <EmptyState
              compact
              title={events.length === 0 ? "No interview events" : "No matching events"}
              description={
                events.length === 0
                  ? "No events match the current filter options."
                  : "Try adjusting the search text."
              }
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50/80">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-slate-700">Event</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Booking Window</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Date Range</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Slots</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">State</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {filteredEvents.map((event) => {
                      const state = formatEventState(event);

                      return (
                        <tr className="align-top hover:bg-slate-50" key={event.id}>
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-900">{event.title}</p>
                            <p className="mt-1 text-xs text-slate-500">{event.school.name}</p>
                            {event.description ? (
                              <p className="mt-1 text-xs text-slate-500">{event.description}</p>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            <p>{event.bookingOpensAt ? formatDateTimeLabel(event.bookingOpensAt) : "No open date"}</p>
                            <p className="mt-1">{event.bookingClosesAt ? formatDateTimeLabel(event.bookingClosesAt) : "No close date"}</p>
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            <p>{formatDateTimeLabel(event.startsAt)}</p>
                            <p className="mt-1">{formatDateTimeLabel(event.endsAt)}</p>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{event._count.slots}</td>
                          <td className="px-4 py-3">
                            <Badge variant={state.variant}>{state.label}</Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Link
                              className={buttonClassName({ size: "sm", variant: "secondary" })}
                              href={`/admin/interviews/${encodeURIComponent(event.id)}`}
                            >
                              Manage
                            </Link>
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
