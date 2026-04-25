"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
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
import { getDefaultSchoolContextId } from "@/lib/auth/school-membership";
import { listLibraryOverdue, type LibraryOverdueLoan } from "@/lib/api/library";
import { listSchools, type School } from "@/lib/api/schools";
import { formatDateLabel } from "@/lib/utils";

const readRoles = new Set(["OWNER", "SUPER_ADMIN", "ADMIN", "STAFF"]);

export function LibraryOverdueManagement() {
  const { session } = useAuth();
  const role = session?.user.role ?? "";

  const [schools, setSchools] = useState<School[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [search, setSearch] = useState("");

  const [rows, setRows] = useState<LibraryOverdueLoan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectedSchool = useMemo(
    () => schools.find((school) => school.id === schoolId) ?? null,
    [schoolId, schools],
  );

  useEffect(() => {
    async function loadSchools() {
      if (!readRoles.has(role)) {
        return;
      }

      setError(null);

      try {
        const schoolList = await listSchools({ includeInactive: false });
        setSchools(schoolList);

        const defaultSchoolId =
          getDefaultSchoolContextId(session?.user) ?? schoolList[0]?.id ?? "";
        const resolved =
          schoolList.find((school) => school.id === defaultSchoolId)?.id ??
          schoolList[0]?.id ??
          "";
        setSchoolId(resolved);
      } catch {
        setSchools([]);
      }
    }

    void loadSchools();
  }, [role, session?.user]);

  useEffect(() => {
    async function loadOverdue() {
      if (!readRoles.has(role)) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await listLibraryOverdue({
          schoolId: schoolId || undefined,
          search: search.trim() || undefined,
        });

        setRows(response);
      } catch (loadError) {
        setRows([]);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load overdue items.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void loadOverdue();
  }, [role, schoolId, search]);

  if (!readRoles.has(role)) {
    return (
      <EmptyState
        title="Restricted"
        description="Only OWNER, SUPER_ADMIN, ADMIN, and STAFF roles can view overdue library items."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Library Overdue"
        description="Review overdue books and follow up with families."
        meta={
          <Badge variant="neutral">
            {selectedSchool?.name ?? "All schools"}
          </Badge>
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>
            Filter by school and student/item search terms.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field htmlFor="library-overdue-school" label="School">
            <Select
              id="library-overdue-school"
              value={schoolId}
              onChange={(event) => setSchoolId(event.target.value)}
            >
              <option value="">All schools</option>
              {schools.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field htmlFor="library-overdue-search" label="Search">
            <Input
              id="library-overdue-search"
              placeholder="Student name, username, or item"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Overdue loans</CardTitle>
          <CardDescription>
            Active loans where due date is before today.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-slate-500">Loading overdue records...</p>
          ) : rows.length === 0 ? (
            <EmptyState
              compact
              title="No overdue items"
              description="No overdue loans match the current filters."
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50/80">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-slate-700">
                        Student
                      </th>
                      <th className="px-4 py-3 font-semibold text-slate-700">
                        Item
                      </th>
                      <th className="px-4 py-3 font-semibold text-slate-700">
                        Due date
                      </th>
                      <th className="px-4 py-3 font-semibold text-right text-slate-700">
                        Days overdue
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {rows.map((row) => (
                      <tr className="align-top hover:bg-slate-50" key={row.id}>
                        <td className="px-4 py-4">
                          <p className="font-medium text-slate-900">
                            {row.student.firstName} {row.student.lastName}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {row.student.username}
                          </p>
                        </td>
                        <td className="px-4 py-4">
                          <p className="font-medium text-slate-900">
                            {row.item.title}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {row.item.author ?? "Unknown author"}
                          </p>
                        </td>
                        <td className="px-4 py-4 text-slate-700">
                          {formatDateLabel(row.dueDate)}
                        </td>
                        <td className="px-4 py-4 text-right font-semibold tabular-nums text-red-600">
                          {row.daysOverdue}
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
