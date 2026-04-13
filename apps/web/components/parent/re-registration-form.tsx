"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClassName } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  getStudentById,
  reRegisterStudent,
  type ReRegistrationInput,
  type StudentProfile,
} from "@/lib/api/students";

type FormState = {
  dateOfBirth: string;
  gender: string;
  studentEmail: string;
  allergies: string;
  medicalConditions: string;
  guardian1Name: string;
  guardian1Email: string;
  guardian1Phone: string;
  guardian1Address: string;
  guardian1Relationship: string;
  guardian1WorkPhone: string;
  guardian2Name: string;
  guardian2Email: string;
  guardian2Phone: string;
  guardian2Address: string;
  guardian2Relationship: string;
  guardian2WorkPhone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  province: string;
  postalCode: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelationship: string;
};

function toDateInputValue(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

function normalizeText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildForm(student: StudentProfile): FormState {
  return {
    dateOfBirth: toDateInputValue(student.dateOfBirth),
    gender: student.gender ?? "",
    studentEmail: student.studentEmail ?? "",
    allergies: student.allergies ?? "",
    medicalConditions: student.medicalConditions ?? "",
    guardian1Name: student.guardian1Name ?? "",
    guardian1Email: student.guardian1Email ?? "",
    guardian1Phone: student.guardian1Phone ?? "",
    guardian1Address: student.guardian1Address ?? "",
    guardian1Relationship: student.guardian1Relationship ?? "",
    guardian1WorkPhone: student.guardian1WorkPhone ?? "",
    guardian2Name: student.guardian2Name ?? "",
    guardian2Email: student.guardian2Email ?? "",
    guardian2Phone: student.guardian2Phone ?? "",
    guardian2Address: student.guardian2Address ?? "",
    guardian2Relationship: student.guardian2Relationship ?? "",
    guardian2WorkPhone: student.guardian2WorkPhone ?? "",
    addressLine1: student.addressLine1 ?? "",
    addressLine2: student.addressLine2 ?? "",
    city: student.city ?? "",
    province: student.province ?? "",
    postalCode: student.postalCode ?? "",
    emergencyContactName: student.emergencyContactName ?? "",
    emergencyContactPhone: student.emergencyContactPhone ?? "",
    emergencyContactRelationship: student.emergencyContactRelationship ?? "",
  };
}

function buildPayload(original: StudentProfile, form: FormState): ReRegistrationInput {
  const payload: ReRegistrationInput = {};

  if (form.dateOfBirth !== toDateInputValue(original.dateOfBirth)) {
    payload.dateOfBirth = form.dateOfBirth || null;
  }

  if (normalizeText(form.gender) !== (original.gender ?? null)) {
    payload.gender =
      normalizeText(form.gender) === null
        ? null
        : form.gender === "MALE" || form.gender === "FEMALE"
          ? (form.gender as "MALE" | "FEMALE")
          : null;
  }

  if (normalizeText(form.studentEmail) !== (original.studentEmail ?? null)) {
    payload.studentEmail = normalizeText(form.studentEmail);
  }

  if (normalizeText(form.allergies) !== (original.allergies ?? null)) {
    payload.allergies = normalizeText(form.allergies);
  }

  if (normalizeText(form.medicalConditions) !== (original.medicalConditions ?? null)) {
    payload.medicalConditions = normalizeText(form.medicalConditions);
  }

  if (normalizeText(form.guardian1Name) !== (original.guardian1Name ?? null)) {
    payload.guardian1Name = normalizeText(form.guardian1Name);
  }

  if (normalizeText(form.guardian1Email) !== (original.guardian1Email ?? null)) {
    payload.guardian1Email = normalizeText(form.guardian1Email);
  }

  if (normalizeText(form.guardian1Phone) !== (original.guardian1Phone ?? null)) {
    payload.guardian1Phone = normalizeText(form.guardian1Phone);
  }

  if (normalizeText(form.guardian1Address) !== (original.guardian1Address ?? null)) {
    payload.guardian1Address = normalizeText(form.guardian1Address);
  }

  if (normalizeText(form.guardian1Relationship) !== (original.guardian1Relationship ?? null)) {
    payload.guardian1Relationship = normalizeText(form.guardian1Relationship);
  }

  if (normalizeText(form.guardian1WorkPhone) !== (original.guardian1WorkPhone ?? null)) {
    payload.guardian1WorkPhone = normalizeText(form.guardian1WorkPhone);
  }

  if (normalizeText(form.guardian2Name) !== (original.guardian2Name ?? null)) {
    payload.guardian2Name = normalizeText(form.guardian2Name);
  }

  if (normalizeText(form.guardian2Email) !== (original.guardian2Email ?? null)) {
    payload.guardian2Email = normalizeText(form.guardian2Email);
  }

  if (normalizeText(form.guardian2Phone) !== (original.guardian2Phone ?? null)) {
    payload.guardian2Phone = normalizeText(form.guardian2Phone);
  }

  if (normalizeText(form.guardian2Address) !== (original.guardian2Address ?? null)) {
    payload.guardian2Address = normalizeText(form.guardian2Address);
  }

  if (normalizeText(form.guardian2Relationship) !== (original.guardian2Relationship ?? null)) {
    payload.guardian2Relationship = normalizeText(form.guardian2Relationship);
  }

  if (normalizeText(form.guardian2WorkPhone) !== (original.guardian2WorkPhone ?? null)) {
    payload.guardian2WorkPhone = normalizeText(form.guardian2WorkPhone);
  }

  if (normalizeText(form.addressLine1) !== (original.addressLine1 ?? null)) {
    payload.addressLine1 = normalizeText(form.addressLine1);
  }

  if (normalizeText(form.addressLine2) !== (original.addressLine2 ?? null)) {
    payload.addressLine2 = normalizeText(form.addressLine2);
  }

  if (normalizeText(form.city) !== (original.city ?? null)) {
    payload.city = normalizeText(form.city);
  }

  if (normalizeText(form.province) !== (original.province ?? null)) {
    payload.province = normalizeText(form.province);
  }

  if (normalizeText(form.postalCode) !== (original.postalCode ?? null)) {
    payload.postalCode = normalizeText(form.postalCode);
  }

  if (normalizeText(form.emergencyContactName) !== (original.emergencyContactName ?? null)) {
    payload.emergencyContactName = normalizeText(form.emergencyContactName);
  }

  if (normalizeText(form.emergencyContactPhone) !== (original.emergencyContactPhone ?? null)) {
    payload.emergencyContactPhone = normalizeText(form.emergencyContactPhone);
  }

  if (
    normalizeText(form.emergencyContactRelationship) !==
    (original.emergencyContactRelationship ?? null)
  ) {
    payload.emergencyContactRelationship = normalizeText(form.emergencyContactRelationship);
  }

  return payload;
}

export function ParentReRegistrationForm({
  studentId,
  schoolYearId,
}: {
  studentId: string;
  schoolYearId?: string | null;
}) {
  const [student, setStudent] = useState<StudentProfile | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await getStudentById(studentId);
        setStudent(response);
        setForm(buildForm(response));
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load student.");
        setStudent(null);
        setForm(null);
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, [studentId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!student || !form) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const payload = buildPayload(student, form);
      if (Object.keys(payload).length === 0) {
        setSuccessMessage("No changes to submit.");
        return;
      }

      const updated = await reRegisterStudent(studentId, payload, { schoolYearId: schoolYearId ?? null });
      setStudent(updated);
      setForm(buildForm(updated));
      setSuccessMessage("Re-registration updates saved.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to submit re-registration.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Re-registration"
        description="Update returning-student information without creating a duplicate record."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              className={buttonClassName({ variant: "secondary" })}
              href={`/parent?studentId=${encodeURIComponent(studentId)}`}
            >
              Back to portal
            </Link>
            <Link
              className={buttonClassName({ variant: "secondary" })}
              href={`/parent/students/${studentId}`}
            >
              Student profile
            </Link>
          </div>
        }
        meta={
          student ? (
            <Badge variant="neutral">
              {student.firstName} {student.lastName}
            </Badge>
          ) : null
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {successMessage ? <Notice tone="success">{successMessage}</Notice> : null}

      {isLoading ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Loading re-registration form...</p>
          </CardContent>
        </Card>
      ) : null}

      {!isLoading && !student ? (
        <EmptyState
          title="Student unavailable"
          description="This student record could not be loaded."
        />
      ) : null}

      {student && form ? (
        <form className="space-y-6" onSubmit={handleSubmit}>
          <Card>
            <CardHeader>
              <CardTitle>Student info</CardTitle>
              <CardDescription>Basic demographic and contact updates.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <Field htmlFor="rr-dob" label="Date of birth">
                <Input
                  id="rr-dob"
                  onChange={(event) => setForm((current) => (current ? { ...current, dateOfBirth: event.target.value } : current))}
                  type="date"
                  value={form.dateOfBirth}
                />
              </Field>

              <Field htmlFor="rr-gender" label="Gender">
                <Select
                  id="rr-gender"
                  onChange={(event) => setForm((current) => (current ? { ...current, gender: event.target.value } : current))}
                  value={form.gender}
                >
                  <option value="">Not specified</option>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                </Select>
              </Field>

              <Field htmlFor="rr-student-email" label="Student email">
                <Input
                  id="rr-student-email"
                  onChange={(event) => setForm((current) => (current ? { ...current, studentEmail: event.target.value } : current))}
                  type="email"
                  value={form.studentEmail}
                />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Address</CardTitle>
              <CardDescription>Primary home address for this student.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Field htmlFor="rr-address1" label="Address line 1">
                <Input
                  id="rr-address1"
                  onChange={(event) => setForm((current) => (current ? { ...current, addressLine1: event.target.value } : current))}
                  value={form.addressLine1}
                />
              </Field>
              <Field htmlFor="rr-address2" label="Address line 2">
                <Input
                  id="rr-address2"
                  onChange={(event) => setForm((current) => (current ? { ...current, addressLine2: event.target.value } : current))}
                  value={form.addressLine2}
                />
              </Field>
              <Field htmlFor="rr-city" label="City">
                <Input
                  id="rr-city"
                  onChange={(event) => setForm((current) => (current ? { ...current, city: event.target.value } : current))}
                  value={form.city}
                />
              </Field>
              <Field htmlFor="rr-province" label="Province/State">
                <Input
                  id="rr-province"
                  onChange={(event) => setForm((current) => (current ? { ...current, province: event.target.value } : current))}
                  value={form.province}
                />
              </Field>
              <Field htmlFor="rr-postal" label="Postal code">
                <Input
                  id="rr-postal"
                  onChange={(event) => setForm((current) => (current ? { ...current, postalCode: event.target.value } : current))}
                  value={form.postalCode}
                />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Guardians</CardTitle>
              <CardDescription>Update guardian contact information.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <Field htmlFor="rr-g1-name" label="Guardian 1 name">
                  <Input
                    id="rr-g1-name"
                    onChange={(event) => setForm((current) => (current ? { ...current, guardian1Name: event.target.value } : current))}
                    value={form.guardian1Name}
                  />
                </Field>
                <Field htmlFor="rr-g1-email" label="Guardian 1 email">
                  <Input
                    id="rr-g1-email"
                    onChange={(event) => setForm((current) => (current ? { ...current, guardian1Email: event.target.value } : current))}
                    type="email"
                    value={form.guardian1Email}
                  />
                </Field>
                <Field htmlFor="rr-g1-phone" label="Guardian 1 phone">
                  <Input
                    id="rr-g1-phone"
                    onChange={(event) => setForm((current) => (current ? { ...current, guardian1Phone: event.target.value } : current))}
                    value={form.guardian1Phone}
                  />
                </Field>
                <Field htmlFor="rr-g1-work" label="Guardian 1 work phone">
                  <Input
                    id="rr-g1-work"
                    onChange={(event) => setForm((current) => (current ? { ...current, guardian1WorkPhone: event.target.value } : current))}
                    value={form.guardian1WorkPhone}
                  />
                </Field>
                <Field htmlFor="rr-g1-relationship" label="Guardian 1 relationship">
                  <Input
                    id="rr-g1-relationship"
                    onChange={(event) => setForm((current) => (current ? { ...current, guardian1Relationship: event.target.value } : current))}
                    value={form.guardian1Relationship}
                  />
                </Field>
                <Field htmlFor="rr-g1-address" label="Guardian 1 address">
                  <Input
                    id="rr-g1-address"
                    onChange={(event) => setForm((current) => (current ? { ...current, guardian1Address: event.target.value } : current))}
                    value={form.guardian1Address}
                  />
                </Field>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field htmlFor="rr-g2-name" label="Guardian 2 name">
                  <Input
                    id="rr-g2-name"
                    onChange={(event) => setForm((current) => (current ? { ...current, guardian2Name: event.target.value } : current))}
                    value={form.guardian2Name}
                  />
                </Field>
                <Field htmlFor="rr-g2-email" label="Guardian 2 email">
                  <Input
                    id="rr-g2-email"
                    onChange={(event) => setForm((current) => (current ? { ...current, guardian2Email: event.target.value } : current))}
                    type="email"
                    value={form.guardian2Email}
                  />
                </Field>
                <Field htmlFor="rr-g2-phone" label="Guardian 2 phone">
                  <Input
                    id="rr-g2-phone"
                    onChange={(event) => setForm((current) => (current ? { ...current, guardian2Phone: event.target.value } : current))}
                    value={form.guardian2Phone}
                  />
                </Field>
                <Field htmlFor="rr-g2-work" label="Guardian 2 work phone">
                  <Input
                    id="rr-g2-work"
                    onChange={(event) => setForm((current) => (current ? { ...current, guardian2WorkPhone: event.target.value } : current))}
                    value={form.guardian2WorkPhone}
                  />
                </Field>
                <Field htmlFor="rr-g2-relationship" label="Guardian 2 relationship">
                  <Input
                    id="rr-g2-relationship"
                    onChange={(event) => setForm((current) => (current ? { ...current, guardian2Relationship: event.target.value } : current))}
                    value={form.guardian2Relationship}
                  />
                </Field>
                <Field htmlFor="rr-g2-address" label="Guardian 2 address">
                  <Input
                    id="rr-g2-address"
                    onChange={(event) => setForm((current) => (current ? { ...current, guardian2Address: event.target.value } : current))}
                    value={form.guardian2Address}
                  />
                </Field>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Health and emergency</CardTitle>
              <CardDescription>Optional notes used by the school.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Field htmlFor="rr-allergies" label="Allergies">
                <Textarea
                  id="rr-allergies"
                  onChange={(event) => setForm((current) => (current ? { ...current, allergies: event.target.value } : current))}
                  rows={3}
                  value={form.allergies}
                />
              </Field>
              <Field htmlFor="rr-medical" label="Medical conditions">
                <Textarea
                  id="rr-medical"
                  onChange={(event) => setForm((current) => (current ? { ...current, medicalConditions: event.target.value } : current))}
                  rows={3}
                  value={form.medicalConditions}
                />
              </Field>
              <Field htmlFor="rr-emergency-name" label="Emergency contact name">
                <Input
                  id="rr-emergency-name"
                  onChange={(event) => setForm((current) => (current ? { ...current, emergencyContactName: event.target.value } : current))}
                  value={form.emergencyContactName}
                />
              </Field>
              <Field htmlFor="rr-emergency-phone" label="Emergency contact phone">
                <Input
                  id="rr-emergency-phone"
                  onChange={(event) => setForm((current) => (current ? { ...current, emergencyContactPhone: event.target.value } : current))}
                  value={form.emergencyContactPhone}
                />
              </Field>
              <Field htmlFor="rr-emergency-relationship" label="Emergency contact relationship">
                <Input
                  id="rr-emergency-relationship"
                  onChange={(event) =>
                    setForm((current) =>
                      current ? { ...current, emergencyContactRelationship: event.target.value } : current,
                    )
                  }
                  value={form.emergencyContactRelationship}
                />
              </Field>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button disabled={isSubmitting} type="submit">
              {isSubmitting ? "Submitting..." : "Submit updates"}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
