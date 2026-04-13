"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClassName } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import {
  getParentFormById,
  submitParentForm,
  type FormField,
  type ParentFormDetail,
} from "@/lib/api/forms";
import { formatDateLabel } from "@/lib/utils";

function getFieldOptions(field: FormField) {
  if (!Array.isArray(field.optionsJson)) {
    return [];
  }

  return field.optionsJson
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function ParentFormDetail({ formId }: { formId: string }) {
  const searchParams = useSearchParams();
  const requestedStudentId = searchParams.get("studentId") ?? "";
  const [selectedStudentId, setSelectedStudentId] = useState(requestedStudentId);
  const [form, setForm] = useState<ParentFormDetail | null>(null);
  const [valueByFieldId, setValueByFieldId] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const activeFields = useMemo(
    () =>
      (form?.fields ?? [])
        .filter((field) => field.isActive)
        .sort((left, right) => left.sortOrder - right.sortOrder),
    [form?.fields],
  );

  useEffect(() => {
    async function loadForm() {
      setIsLoading(true);
      setError(null);
      setSuccessMessage(null);

      try {
        const response = await getParentFormById(
          formId,
          selectedStudentId || undefined,
        );

        setForm(response);
        setValueByFieldId(
          Object.fromEntries(response.fields.map((field) => [field.id, ""])),
        );
      } catch (loadError) {
        setForm(null);
        setValueByFieldId({});
        setError(loadError instanceof Error ? loadError.message : "Unable to load form.");
      } finally {
        setIsLoading(false);
      }
    }

    void loadForm();
  }, [formId, selectedStudentId]);

  useEffect(() => {
    if (!form?.requiresStudentContext || selectedStudentId) {
      return;
    }

    const fallbackStudentId = form.linkedStudents[0]?.id ?? "";
    if (fallbackStudentId) {
      setSelectedStudentId(fallbackStudentId);
    }
  }, [form?.linkedStudents, form?.requiresStudentContext, selectedStudentId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form) {
      return;
    }

    if (form.requiresStudentContext && !selectedStudentId) {
      setError("Select a student before submitting this form.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await submitParentForm(form.id, {
        studentId: form.requiresStudentContext ? selectedStudentId : null,
        values: activeFields.map((field) => ({
          fieldId: field.id,
          value: valueByFieldId[field.id]?.trim() || null,
        })),
      });

      setSubmitted(true);
      setSuccessMessage("Form submitted.");
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "Unable to submit form.";

      if (message.toLowerCase().includes("already exists")) {
        setSubmitted(true);
        setSuccessMessage("This form has already been submitted.");
      } else {
        setError(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={form?.title ?? "Form"}
        description={form?.description ?? "Complete this parent-facing form."}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link className={buttonClassName({ variant: "secondary" })} href="/parent/forms">
              Back to forms
            </Link>
            {selectedStudentId ? (
              <Link
                className={buttonClassName({ variant: "secondary" })}
                href={`/parent/students/${selectedStudentId}`}
              >
                Student profile
              </Link>
            ) : null}
          </div>
        }
        meta={
          <>
            <Badge variant="neutral">
              {form?.opensAt ? `Opens ${formatDateLabel(form.opensAt)}` : "Open date not set"}
            </Badge>
            <Badge variant="neutral">
              {form?.closesAt
                ? `Closes ${formatDateLabel(form.closesAt)}`
                : "Close date not set"}
            </Badge>
          </>
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {successMessage ? <Notice tone="success">{successMessage}</Notice> : null}

      {isLoading ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Loading form...</p>
          </CardContent>
        </Card>
      ) : null}

      {!isLoading && !form ? (
        <EmptyState
          title="Form unavailable"
          description="This form is not available right now."
        />
      ) : null}

      {form ? (
        <>
          {form.requiresStudentContext ? (
            <Card>
              <CardHeader>
                <CardTitle>Student Context</CardTitle>
                <CardDescription>
                  This form requires a linked student selection.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Field htmlFor="parent-form-student" label="Student">
                  <Select
                    id="parent-form-student"
                    onChange={(event) => setSelectedStudentId(event.target.value)}
                    value={selectedStudentId}
                  >
                    <option value="">Select student</option>
                    {form.linkedStudents.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.firstName} {student.lastName}
                      </option>
                    ))}
                  </Select>
                </Field>
              </CardContent>
            </Card>
          ) : null}

          {submitted ? (
            <EmptyState
              title="Already submitted"
              description="This form was already submitted for the selected context."
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Form Fields</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={handleSubmit}>
                  {activeFields.map((field) => {
                    const value = valueByFieldId[field.id] ?? "";
                    const label = field.isRequired ? `${field.label} *` : field.label;

                    if (field.type === "SHORT_TEXT") {
                      return (
                        <Field htmlFor={`field-${field.id}`} key={field.id} label={label}>
                          <Input
                            id={`field-${field.id}`}
                            onChange={(event) =>
                              setValueByFieldId((current) => ({
                                ...current,
                                [field.id]: event.target.value,
                              }))
                            }
                            value={value}
                          />
                        </Field>
                      );
                    }

                    if (field.type === "LONG_TEXT") {
                      return (
                        <Field htmlFor={`field-${field.id}`} key={field.id} label={label}>
                          <Textarea
                            id={`field-${field.id}`}
                            onChange={(event) =>
                              setValueByFieldId((current) => ({
                                ...current,
                                [field.id]: event.target.value,
                              }))
                            }
                            rows={4}
                            value={value}
                          />
                        </Field>
                      );
                    }

                    if (field.type === "SELECT") {
                      const options = getFieldOptions(field);

                      return (
                        <Field htmlFor={`field-${field.id}`} key={field.id} label={label}>
                          <Select
                            id={`field-${field.id}`}
                            onChange={(event) =>
                              setValueByFieldId((current) => ({
                                ...current,
                                [field.id]: event.target.value,
                              }))
                            }
                            value={value}
                          >
                            <option value="">Select option</option>
                            {options.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </Select>
                        </Field>
                      );
                    }

                    if (field.type === "CHECKBOX") {
                      return (
                        <Field htmlFor={`field-${field.id}`} key={field.id} label={label}>
                          <Select
                            id={`field-${field.id}`}
                            onChange={(event) =>
                              setValueByFieldId((current) => ({
                                ...current,
                                [field.id]: event.target.value,
                              }))
                            }
                            value={value}
                          >
                            <option value="">Select</option>
                            <option value="true">Yes</option>
                            <option value="false">No</option>
                          </Select>
                        </Field>
                      );
                    }

                    return (
                      <Field htmlFor={`field-${field.id}`} key={field.id} label={label}>
                        <Input
                          id={`field-${field.id}`}
                          onChange={(event) =>
                            setValueByFieldId((current) => ({
                              ...current,
                              [field.id]: event.target.value,
                            }))
                          }
                          type="date"
                          value={value}
                        />
                      </Field>
                    );
                  })}

                  <div className="flex justify-end">
                    <Button
                      disabled={
                        isSubmitting ||
                        (form.requiresStudentContext && !selectedStudentId)
                      }
                      type="submit"
                    >
                      {isSubmitting ? "Submitting..." : "Submit form"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}
