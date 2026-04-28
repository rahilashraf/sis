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
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/lib/auth/auth-context";
import {
  listParentForms,
  type ParentFormState,
  type ParentFormSummary,
} from "@/lib/api/forms";
import {
  listMyParentStudents,
  type ParentStudentLink,
} from "@/lib/api/students";
import { formatDateLabel } from "@/lib/utils";

function formatParentFormState(state: ParentFormState) {
  switch (state) {
    case "OPEN":
      return "Open";
    case "SUBMITTED":
      return "Submitted";
    default:
      return "Closed";
  }
}

function getParentFormStateBadgeVariant(state: ParentFormState) {
  if (state === "OPEN") {
    return "success" as const;
  }

  if (state === "SUBMITTED") {
    return "primary" as const;
  }

  return "neutral" as const;
}

export function ParentFormsOverview() {
  const searchParams = useSearchParams();
  const { session } = useAuth();
  const [links, setLinks] = useState<ParentStudentLink[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [forms, setForms] = useState<ParentFormSummary[]>([]);
  const [stateFilter, setStateFilter] = useState<"ALL" | ParentFormState>(
    "ALL",
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingForms, setIsLoadingForms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formsError, setFormsError] = useState<string | null>(null);

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
        const defaultStudentId =
          requestedStudentId &&
          response.some((entry) => entry.studentId === requestedStudentId)
            ? requestedStudentId
            : (response[0]?.studentId ?? "");
        setSelectedStudentId((current) => current || defaultStudentId);
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

  useEffect(() => {
    async function loadForms() {
      if (!selectedStudentId) {
        setForms([]);
        setFormsError(null);
        return;
      }

      setIsLoadingForms(true);
      setFormsError(null);

      try {
        const response = await listParentForms(selectedStudentId);
        setForms(response);
      } catch (loadError) {
        setForms([]);
        setFormsError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load forms.",
        );
      } finally {
        setIsLoadingForms(false);
      }
    }

    void loadForms();
  }, [selectedStudentId]);

  const selectedLink = useMemo(
    () => links.find((entry) => entry.studentId === selectedStudentId) ?? null,
    [links, selectedStudentId],
  );

  const openCount = forms.filter((form) => form.state === "OPEN").length;
  const submittedCount = forms.filter(
    (form) => form.state === "SUBMITTED",
  ).length;
  const closedCount = forms.filter((form) => form.state === "CLOSED").length;
  const prioritizedForms = useMemo(() => {
    const priority: Record<ParentFormState, number> = {
      OPEN: 0,
      SUBMITTED: 1,
      CLOSED: 2,
    };

    const filtered =
      stateFilter === "ALL"
        ? forms
        : forms.filter((form) => form.state === stateFilter);

    return [...filtered].sort((left, right) => {
      const stateOrder = priority[left.state] - priority[right.state];
      if (stateOrder !== 0) {
        return stateOrder;
      }

      const leftOpen = left.opensAt ? new Date(left.opensAt).getTime() : 0;
      const rightOpen = right.opensAt ? new Date(right.opensAt).getTime() : 0;
      return rightOpen - leftOpen;
    });
  }, [forms, stateFilter]);

  const firstOpenForm = useMemo(
    () => forms.find((form) => form.state === "OPEN" && !form.hasSubmitted),
    [forms],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Forms"
        description="Complete active school forms for your linked children."
        actions={
          <Link
            className={buttonClassName({ variant: "secondary" })}
            href="/parent"
          >
            Back to parent portal
          </Link>
        }
        meta={
          <>
            <Badge variant="neutral">
              {isLoading
                ? "Loading..."
                : `${links.length} linked child${links.length === 1 ? "" : "ren"}`}
            </Badge>
            <Badge variant={openCount > 0 ? "warning" : "neutral"}>
              {openCount} open
            </Badge>
          </>
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {formsError ? <Notice tone="danger">{formsError}</Notice> : null}

      {isLoading ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Loading linked students...</p>
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
              <Field htmlFor="parent-form-student" label="Student">
                <Select
                  id="parent-form-student"
                  onChange={(event) => setSelectedStudentId(event.target.value)}
                  value={selectedStudentId}
                >
                  {links.map((link) => (
                    <option key={link.studentId} value={link.studentId}>
                      {link.student.firstName} {link.student.lastName}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field htmlFor="parent-form-state-filter" label="State">
                <Select
                  id="parent-form-state-filter"
                  onChange={(event) =>
                    setStateFilter(event.target.value as "ALL" | ParentFormState)
                  }
                  value={stateFilter}
                >
                  <option value="ALL">All states</option>
                  <option value="OPEN">Open</option>
                  <option value="SUBMITTED">Submitted</option>
                  <option value="CLOSED">Closed</option>
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

          {selectedStudentId && firstOpenForm ? (
            <Notice tone="warning">
              Next action:{" "}
              <span className="font-semibold">{firstOpenForm.title}</span>.{" "}
              <Link
                className="font-semibold underline"
                href={`/parent/forms/${firstOpenForm.id}?studentId=${encodeURIComponent(selectedStudentId)}`}
              >
                Complete now
              </Link>
              .
            </Notice>
          ) : null}

          {selectedLink ? (
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Open</CardTitle>
                  <CardDescription>Needs action</CardDescription>
                </CardHeader>
                <CardContent className="text-sm font-semibold text-slate-900">
                  {openCount}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Submitted</CardTitle>
                  <CardDescription>Already sent</CardDescription>
                </CardHeader>
                <CardContent className="text-sm font-semibold text-slate-900">
                  {submittedCount}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Closed</CardTitle>
                  <CardDescription>Outside window</CardDescription>
                </CardHeader>
                <CardContent className="text-sm font-semibold text-slate-900">
                  {closedCount}
                </CardContent>
              </Card>
            </div>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Available Forms</CardTitle>
              <CardDescription>
                Open forms can be submitted. Closed forms remain read-only.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingForms ? (
                <p className="text-sm text-slate-500">Loading forms...</p>
              ) : prioritizedForms.length === 0 ? (
                <EmptyState
                  compact
                  title="No forms for this filter"
                  description="Try a different state filter or select another student."
                />
              ) : (
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <p className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500">
                    Showing {prioritizedForms.length} of {forms.length} forms.
                    Scroll horizontally on smaller screens to view all columns.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                      <thead className="bg-slate-50/80">
                        <tr>
                          <th className="px-4 py-3 font-semibold text-slate-700">
                            Form
                          </th>
                          <th className="px-4 py-3 font-semibold text-slate-700">
                            Window
                          </th>
                          <th className="px-4 py-3 font-semibold text-slate-700">
                            State
                          </th>
                          <th className="px-4 py-3 font-semibold text-slate-700">
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white">
                        {prioritizedForms.map((form) => (
                          <tr
                            className="align-top hover:bg-slate-50"
                            key={form.id}
                          >
                            <td className="px-4 py-3">
                              <p className="font-medium text-slate-900">
                                {form.title}
                              </p>
                              {form.description ? (
                                <p className="mt-1 text-xs text-slate-500">
                                  {form.description}
                                </p>
                              ) : null}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {form.opensAt
                                ? formatDateLabel(form.opensAt)
                                : "No open date"}{" "}
                              •{" "}
                              {form.closesAt
                                ? formatDateLabel(form.closesAt)
                                : "No close date"}
                            </td>
                            <td className="px-4 py-3">
                              <Badge
                                variant={getParentFormStateBadgeVariant(
                                  form.state,
                                )}
                              >
                                {formatParentFormState(form.state)}
                              </Badge>
                            </td>
                            <td className="px-4 py-3">
                              {form.state === "OPEN" && !form.hasSubmitted ? (
                                <Link
                                  className={buttonClassName({
                                    className: "w-full sm:w-auto",
                                    size: "sm",
                                    variant: "secondary",
                                  })}
                                  href={`/parent/forms/${form.id}?studentId=${encodeURIComponent(selectedStudentId)}`}
                                >
                                  Open form
                                </Link>
                              ) : form.state === "SUBMITTED" ? (
                                <span className="text-xs font-medium text-slate-500">
                                  Submitted
                                </span>
                              ) : (
                                <span className="text-xs font-medium text-slate-500">
                                  Closed
                                </span>
                              )}
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
