"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { buttonClassName } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CheckboxField, Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth/auth-context";
import { getDefaultSchoolContextId } from "@/lib/auth/school-membership";
import {
  createInterviewEvent,
  getInterviewEvent,
  updateInterviewEvent,
} from "@/lib/api/interviews";
import { listSchools, type School } from "@/lib/api/schools";

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

function parseDateTimeLocal(value: string, fieldLabel: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${fieldLabel} is required.`);
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldLabel} must be a valid date/time.`);
  }

  return parsed.toISOString();
}

function parseOptionalDateTimeLocal(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Booking date/time values must be valid.");
  }

  return parsed.toISOString();
}

export function InterviewEventForm({ eventId }: { eventId?: string }) {
  const router = useRouter();
  const { session } = useAuth();
  const role = session?.user.role ?? "";

  const [schools, setSchools] = useState<School[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [bookingOpensAt, setBookingOpensAt] = useState("");
  const [bookingClosesAt, setBookingClosesAt] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [isPublished, setIsPublished] = useState(false);
  const [isActive, setIsActive] = useState(true);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!manageRoles.has(role)) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const schoolResponse = await listSchools({ includeInactive: false });
        setSchools(schoolResponse);

        if (eventId) {
          const event = await getInterviewEvent(eventId);

          setSchoolId(event.schoolId);
          setTitle(event.title);
          setDescription(event.description ?? "");
          setBookingOpensAt(toDateTimeLocal(event.bookingOpensAt));
          setBookingClosesAt(toDateTimeLocal(event.bookingClosesAt));
          setStartsAt(toDateTimeLocal(event.startsAt));
          setEndsAt(toDateTimeLocal(event.endsAt));
          setIsPublished(event.isPublished);
          setIsActive(event.isActive);
          return;
        }

        const defaultSchoolId =
          getDefaultSchoolContextId(session?.user) ??
          schoolResponse[0]?.id ??
          "";
        const resolvedSchoolId =
          schoolResponse.find((school) => school.id === defaultSchoolId)?.id ??
          schoolResponse[0]?.id ??
          "";
        setSchoolId(resolvedSchoolId);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load event form.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, [eventId, role, session?.user]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!manageRoles.has(role)) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const startsAtIso = parseDateTimeLocal(startsAt, "Event start");
      const endsAtIso = parseDateTimeLocal(endsAt, "Event end");
      const bookingOpenIso = parseOptionalDateTimeLocal(bookingOpensAt);
      const bookingCloseIso = parseOptionalDateTimeLocal(bookingClosesAt);

      if (!eventId && !schoolId) {
        throw new Error("School is required.");
      }

      if (eventId) {
        const updated = await updateInterviewEvent(eventId, {
          title: title.trim(),
          description: description.trim() || null,
          bookingOpensAt: bookingOpenIso,
          bookingClosesAt: bookingCloseIso,
          startsAt: startsAtIso,
          endsAt: endsAtIso,
          isPublished,
          isActive,
        });

        setSuccessMessage("Interview event updated.");
        router.replace(`/admin/interviews/${updated.id}`);
        router.refresh();
        return;
      }

      const created = await createInterviewEvent({
        schoolId,
        title: title.trim(),
        description: description.trim() || null,
        bookingOpensAt: bookingOpenIso ?? undefined,
        bookingClosesAt: bookingCloseIso ?? undefined,
        startsAt: startsAtIso,
        endsAt: endsAtIso,
        isPublished,
        isActive,
      });

      setSuccessMessage("Interview event created.");
      router.replace(`/admin/interviews/${created.id}`);
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to save interview event.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (!manageRoles.has(role)) {
    return (
      <Notice tone="danger">
        Only OWNER, SUPER_ADMIN, ADMIN, and STAFF roles can manage interviews.
      </Notice>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-slate-500">Loading event form...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={eventId ? "Edit Interview Event" : "New Interview Event"}
        description="Configure booking window and event dates."
        actions={
          <Link
            className={buttonClassName({ variant: "secondary" })}
            href="/admin/interviews"
          >
            Back to events
          </Link>
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {successMessage ? <Notice tone="success">{successMessage}</Notice> : null}

      <Card>
        <CardHeader>
          <CardTitle>Event Details</CardTitle>
          <CardDescription>
            Keep dates in local school context. Booking windows are optional.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
            <Field htmlFor="interview-event-school" label="School">
              <Select
                disabled={Boolean(eventId)}
                id="interview-event-school"
                onChange={(changeEvent) =>
                  setSchoolId(changeEvent.target.value)
                }
                value={schoolId}
              >
                <option value="">Select school</option>
                {schools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field htmlFor="interview-event-title" label="Title">
              <Input
                id="interview-event-title"
                onChange={(changeEvent) => setTitle(changeEvent.target.value)}
                placeholder="Fall Parent-Teacher Interviews"
                required
                value={title}
              />
            </Field>

            <div className="md:col-span-2">
              <Field htmlFor="interview-event-description" label="Description">
                <Textarea
                  id="interview-event-description"
                  onChange={(changeEvent) =>
                    setDescription(changeEvent.target.value)
                  }
                  placeholder="Optional context for parents and teachers"
                  rows={3}
                  value={description}
                />
              </Field>
            </div>

            <Field
              htmlFor="interview-event-booking-opens"
              label="Booking opens at"
            >
              <Input
                id="interview-event-booking-opens"
                onChange={(changeEvent) =>
                  setBookingOpensAt(changeEvent.target.value)
                }
                type="datetime-local"
                value={bookingOpensAt}
              />
            </Field>

            <Field
              htmlFor="interview-event-booking-closes"
              label="Booking closes at"
            >
              <Input
                id="interview-event-booking-closes"
                onChange={(changeEvent) =>
                  setBookingClosesAt(changeEvent.target.value)
                }
                type="datetime-local"
                value={bookingClosesAt}
              />
            </Field>

            <Field htmlFor="interview-event-starts" label="Event starts at">
              <Input
                id="interview-event-starts"
                onChange={(changeEvent) =>
                  setStartsAt(changeEvent.target.value)
                }
                required
                type="datetime-local"
                value={startsAt}
              />
            </Field>

            <Field htmlFor="interview-event-ends" label="Event ends at">
              <Input
                id="interview-event-ends"
                onChange={(changeEvent) => setEndsAt(changeEvent.target.value)}
                required
                type="datetime-local"
                value={endsAt}
              />
            </Field>

            <div className="space-y-2 md:col-span-2">
              <CheckboxField
                checked={isPublished}
                label="Published (visible to parents)"
                onChange={(changeEvent) =>
                  setIsPublished(changeEvent.target.checked)
                }
              />
              <CheckboxField
                checked={isActive}
                label="Active"
                onChange={(changeEvent) =>
                  setIsActive(changeEvent.target.checked)
                }
              />
            </div>

            <div className="md:col-span-2 flex flex-wrap gap-2 pt-2">
              <button
                className={buttonClassName({ variant: "primary" })}
                disabled={isSaving}
                type="submit"
              >
                {isSaving
                  ? eventId
                    ? "Saving..."
                    : "Creating..."
                  : eventId
                    ? "Save changes"
                    : "Create event"}
              </button>
              <Link
                className={buttonClassName({ variant: "secondary" })}
                href="/admin/interviews"
              >
                Cancel
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
