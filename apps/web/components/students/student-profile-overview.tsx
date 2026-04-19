"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { StudentProfile } from "@/lib/api/students";
import { formatDateOnly } from "@/lib/date";
import {
  formatDateTimeLabel,
  formatRoleLabel,
  getDisplayText,
} from "@/lib/utils";

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <div className="mt-2 text-sm text-slate-700">{value}</div>
    </div>
  );
}

function formatGenderLabel(value: StudentProfile["gender"]) {
  if (!value) {
    return "Not provided";
  }

  return value === "MALE" ? "Male" : "Female";
}

type StudentProfileOverviewProps = {
  student: StudentProfile;
  showSensitiveHealthInfo?: boolean;
};

export function StudentProfileOverview({
  student,
  showSensitiveHealthInfo = false,
}: StudentProfileOverviewProps) {
  const schoolLabel = student.memberships.length
    ? student.memberships.map((membership) => membership.school.name).join(", ")
    : "No school assignments";

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              School access
            </p>
            <p className="mt-2 text-sm font-medium text-slate-900">{schoolLabel}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Student number
            </p>
            <p className="mt-2 text-sm font-medium text-slate-900">
              {getDisplayText(student.studentNumber)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Date of birth
            </p>
            <p className="mt-2 text-sm font-medium text-slate-900">
              {formatDateOnly(student.dateOfBirth)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Account status
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant={student.isActive ? "success" : "neutral"}>
                {student.isActive ? "Active" : "Inactive"}
              </Badge>
              <Badge variant="neutral">{formatRoleLabel(student.role)}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Identity</CardTitle>
            <CardDescription>
              Core student identity and school-issued identifiers.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2">
            <DetailItem
              label="Student name"
              value={`${student.firstName} ${student.lastName}`}
            />
            <DetailItem label="Username" value={getDisplayText(student.username)} />
            <DetailItem label="Account email" value={getDisplayText(student.email)} />
            <DetailItem label="Student email" value={getDisplayText(student.studentEmail)} />
            <DetailItem
              label="Grade level"
              value={getDisplayText(student.gradeLevel?.name)}
            />
            <DetailItem label="Student number" value={getDisplayText(student.studentNumber)} />
            <DetailItem label="OEN" value={getDisplayText(student.oen)} />
            <DetailItem label="Gender" value={formatGenderLabel(student.gender)} />
            <DetailItem label="System ID" value={student.id} />
            <DetailItem
              label="Created"
              value={formatDateTimeLabel(student.createdAt)}
            />
            <DetailItem
              label="Last updated"
              value={formatDateTimeLabel(student.updatedAt)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Health Info</CardTitle>
            <CardDescription>
              Health and medical details maintained on the student record.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2">
            <DetailItem
              label="Allergies"
              value={getDisplayText(student.allergies, "No allergies on file")}
            />
            <DetailItem
              label="Medical conditions"
              value={getDisplayText(
                student.medicalConditions,
                "No medical conditions on file",
              )}
            />
            {showSensitiveHealthInfo ? (
              <DetailItem
                label="Health card number"
                value={getDisplayText(student.healthCardNumber)}
              />
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Guardian 1</CardTitle>
            <CardDescription>
              Administrative guardian contact details stored on the student file.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2">
            <DetailItem label="Name" value={getDisplayText(student.guardian1Name)} />
            <DetailItem label="Relationship" value={getDisplayText(student.guardian1Relationship)} />
            <DetailItem label="Email" value={getDisplayText(student.guardian1Email)} />
            <DetailItem label="Phone" value={getDisplayText(student.guardian1Phone)} />
            <DetailItem label="Work phone" value={getDisplayText(student.guardian1WorkPhone)} />
            <DetailItem label="Address" value={getDisplayText(student.guardian1Address)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Guardian 2</CardTitle>
            <CardDescription>
              Secondary guardian contact details stored separately from parent links.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2">
            <DetailItem label="Name" value={getDisplayText(student.guardian2Name)} />
            <DetailItem label="Relationship" value={getDisplayText(student.guardian2Relationship)} />
            <DetailItem label="Email" value={getDisplayText(student.guardian2Email)} />
            <DetailItem label="Phone" value={getDisplayText(student.guardian2Phone)} />
            <DetailItem label="Work phone" value={getDisplayText(student.guardian2WorkPhone)} />
            <DetailItem label="Address" value={getDisplayText(student.guardian2Address)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Additional Contact</CardTitle>
            <CardDescription>
              Existing address and emergency contact details retained on the student
              record.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2">
            <DetailItem label="Address line 1" value={getDisplayText(student.addressLine1)} />
            <DetailItem label="Address line 2" value={getDisplayText(student.addressLine2)} />
            <DetailItem label="City" value={getDisplayText(student.city)} />
            <DetailItem label="Province" value={getDisplayText(student.province)} />
            <DetailItem label="Postal code" value={getDisplayText(student.postalCode)} />
            <DetailItem
              label="Emergency contact"
              value={getDisplayText(student.emergencyContactName)}
            />
            <DetailItem
              label="Emergency phone"
              value={getDisplayText(student.emergencyContactPhone)}
            />
            <DetailItem
              label="Emergency relationship"
              value={getDisplayText(student.emergencyContactRelationship)}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
