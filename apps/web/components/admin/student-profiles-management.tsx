"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
import { CheckboxField, Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/lib/auth/auth-context";
import { formatRoleLabel } from "@/lib/utils";
import { listSchools } from "@/lib/api/schools";
import { listGradeLevels, type GradeLevel } from "@/lib/api/grade-levels";
import { listUsers, type ManagedUser } from "@/lib/api/users";

type SortOption = "name" | "createdAt";

export function StudentProfilesManagement() {
  const { session } = useAuth();
  const [students, setStudents] = useState<ManagedUser[]>([]);
  const [gradeLevels, setGradeLevels] = useState<GradeLevel[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [gradeLevelFilter, setGradeLevelFilter] = useState("");
  const [sortOption, setSortOption] = useState<SortOption>("name");
  const [showInactive, setShowInactive] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canManageStudentProfiles = session?.user.role
    ? session.user.role === "OWNER" ||
      session.user.role === "SUPER_ADMIN" ||
      session.user.role === "ADMIN"
    : false;

  useEffect(() => {
    async function loadGradeLevels() {
      try {
        const schools = await listSchools();
        const settled = await Promise.allSettled(
          schools
            .filter((school) => school.isActive)
            .map((school) =>
              listGradeLevels(school.id, { includeInactive: false }),
            ),
        );

        const levels: GradeLevel[] = [];
        for (const result of settled) {
          if (result.status === "fulfilled") {
            levels.push(...result.value.filter((level) => level.isActive));
          }
        }

        levels.sort((a, b) => {
          if (a.school.name.localeCompare(b.school.name) !== 0) {
            return a.school.name.localeCompare(b.school.name);
          }

          if (a.sortOrder !== b.sortOrder) {
            return a.sortOrder - b.sortOrder;
          }

          return a.name.localeCompare(b.name);
        });

        setGradeLevels(levels);
      } catch {
        setGradeLevels([]);
      }
    }

    if (canManageStudentProfiles) {
      void loadGradeLevels();
    }
  }, [canManageStudentProfiles]);

  useEffect(() => {
    async function loadStudents() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await listUsers({
          includeInactive: showInactive,
          role: "STUDENT",
          gradeLevelId: gradeLevelFilter || undefined,
          sort: sortOption,
        });

        setStudents(response);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load students.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    if (canManageStudentProfiles) {
      void loadStudents();
      return;
    }

    setIsLoading(false);
  }, [canManageStudentProfiles, gradeLevelFilter, showInactive, sortOption]);

  const filteredStudents = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    if (!term) {
      return students;
    }

    return students.filter((student) => {
      const haystack = [
        student.firstName,
        student.lastName,
        student.username,
        student.email ?? "",
        student.phone ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(term);
    });
  }, [searchTerm, students]);

  if (!canManageStudentProfiles) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Student Profiles"
          description="Student profile management is reserved for owner, super admin, and admin roles."
        />
        <EmptyState
          description="Your role can view assigned workflows, but cannot edit student profiles."
          title="Student profile management unavailable"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Student Profiles"
        description="Search and filter student accounts, then open profile editor for full student details and parent links."
        actions={
          <Link
            className={buttonClassName({ variant: "secondary" })}
            href="/admin/users"
          >
            Back to users
          </Link>
        }
        meta={
          <Badge variant="neutral">{filteredStudents.length} students</Badge>
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}

      <Card>
        <CardHeader>
          <CardTitle>Find Student</CardTitle>
          <CardDescription>
            Use search and filters to locate a student and open their profile
            editor.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-4">
          <Field htmlFor="student-profile-search" label="Search">
            <Input
              id="student-profile-search"
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Name, username, email, phone"
              value={searchTerm}
            />
          </Field>

          <Field htmlFor="student-profile-grade-filter" label="Grade level">
            <Select
              id="student-profile-grade-filter"
              onChange={(event) => setGradeLevelFilter(event.target.value)}
              value={gradeLevelFilter}
            >
              <option value="">All grade levels</option>
              {gradeLevels.map((level) => (
                <option key={level.id} value={level.id}>
                  {(level.school.shortName ?? level.school.name).trim()} —{" "}
                  {level.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field htmlFor="student-profile-sort" label="Sort">
            <Select
              id="student-profile-sort"
              onChange={(event) =>
                setSortOption(event.target.value as SortOption)
              }
              value={sortOption}
            >
              <option value="name">Name (A–Z)</option>
              <option value="createdAt">Newest</option>
            </Select>
          </Field>

          <div className="flex items-end">
            <CheckboxField
              checked={showInactive}
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              description="Include inactive student users."
              label="Show inactive"
              onChange={(event) => setShowInactive(event.target.checked)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Student Directory</CardTitle>
          <CardDescription>
            Open a student profile to edit student data and manage parent
            linkage.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50/80">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-slate-700">
                      Student
                    </th>
                    <th className="px-4 py-3 font-semibold text-slate-700">
                      Role
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
                  {filteredStudents.map((student) => (
                    <tr
                      className="align-top hover:bg-slate-50"
                      key={student.id}
                    >
                      <td className="px-4 py-4">
                        <p className="font-medium text-slate-900">
                          {student.firstName} {student.lastName}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          @{student.username}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          {student.email ?? "No email on file"}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          {student.phone ?? "No phone on file"}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <Badge variant="neutral">
                          {formatRoleLabel(student.role)}
                        </Badge>
                      </td>
                      <td className="px-4 py-4">
                        <Badge
                          variant={student.isActive ? "success" : "neutral"}
                        >
                          {student.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="px-4 py-4">
                        <Link href={`/admin/students/${student.id}`}>
                          <Button type="button" variant="secondary">
                            Edit profile
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}

                  {!isLoading && filteredStudents.length === 0 ? (
                    <tr>
                      <td className="px-4 py-8" colSpan={4}>
                        <EmptyState
                          compact
                          description="Try changing search or filters to find a student."
                          title="No students found"
                        />
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          {isLoading ? <Notice tone="info">Loading students...</Notice> : null}
        </CardContent>
      </Card>
    </div>
  );
}
