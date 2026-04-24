"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/lib/auth/auth-context";
import { getDefaultSchoolContextId } from "@/lib/auth/school-membership";
import { listUsers, type ManagedUser } from "@/lib/api/users";
import {
  checkoutLibraryLoan,
  listLibraryItems,
  listLibraryLoans,
  markLibraryLoanFound,
  markLibraryLoanLost,
  returnLibraryLoan,
  type LibraryItem,
  type LibraryLoan,
} from "@/lib/api/library";
import { listSchools, type School } from "@/lib/api/schools";
import { formatDateLabel } from "@/lib/utils";

const readRoles = new Set(["OWNER", "SUPER_ADMIN", "ADMIN", "STAFF"]);

type CheckoutForm = {
  itemId: string;
  studentId: string;
  dueDate: string;
};

const emptyCheckoutForm: CheckoutForm = {
  itemId: "",
  studentId: "",
  dueDate: "",
};

function getStudentLabel(student: ManagedUser) {
  const fullName = `${student.firstName} ${student.lastName}`.trim();
  if (fullName) {
    return fullName;
  }

  return student.username || student.email || student.id;
}

function userBelongsToSchool(user: ManagedUser, schoolId: string) {
  if (!schoolId) {
    return true;
  }

  if (user.schoolId === schoolId) {
    return true;
  }

  return user.memberships.some((membership) => membership.schoolId === schoolId);
}

function getStudentOptionLabel(student: ManagedUser) {
  const name = getStudentLabel(student);
  if (!student.username || student.username === name) {
    return name;
  }

  return `${name} (${student.username})`;
}

function getStatusVariant(status: LibraryLoan["status"]): "neutral" | "warning" | "success" | "danger" {
  if (status === "RETURNED") {
    return "success";
  }

  if (status === "OVERDUE") {
    return "danger";
  }

  if (status === "LOST") {
    return "danger";
  }

  if (status === "ACTIVE") {
    return "warning";
  }

  return "neutral";
}

export function LibraryLoansManagement() {
  const { session } = useAuth();
  const role = session?.user.role ?? "";

  const [schools, setSchools] = useState<School[]>([]);
  const [students, setStudents] = useState<ManagedUser[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);

  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loans, setLoans] = useState<LibraryLoan[]>([]);
  const [checkoutForm, setCheckoutForm] = useState<CheckoutForm>(emptyCheckoutForm);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [returningLoanId, setReturningLoanId] = useState<string | null>(null);
  const [markingLostLoanId, setMarkingLostLoanId] = useState<string | null>(null);
  const [markingFoundLoanId, setMarkingFoundLoanId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const selectedSchool = useMemo(
    () => schools.find((school) => school.id === schoolId) ?? null,
    [schoolId, schools],
  );
  const filteredStudents = useMemo(
    () => students.filter((student) => userBelongsToSchool(student, schoolId)),
    [schoolId, students],
  );

  const selectableItems = useMemo(
    () => items.filter((item) => item.status !== "ARCHIVED" && item.status !== "LOST" && item.availableCopies > 0),
    [items],
  );

  useEffect(() => {
    async function loadInitial() {
      if (!readRoles.has(role)) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const [schoolList, studentList] = await Promise.all([
          listSchools({ includeInactive: false }),
          listUsers({ role: "STUDENT" }),
        ]);
        setSchools(schoolList);
        setStudents(studentList);

        const defaultSchoolId = getDefaultSchoolContextId(session?.user) ?? schoolList[0]?.id ?? "";
        const resolved = schoolList.find((school) => school.id === defaultSchoolId)?.id ?? schoolList[0]?.id ?? "";
        setSchoolId(resolved);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load schools.");
      } finally {
        setIsLoading(false);
      }
    }

    void loadInitial();
  }, [role, session?.user]);

  useEffect(() => {
    if (!schoolId) {
      return;
    }

    const nextStudentId = filteredStudents[0]?.id ?? "";
    if (
      !filteredStudents.some((student) => student.id === checkoutForm.studentId) &&
      checkoutForm.studentId !== nextStudentId
    ) {
      setCheckoutForm((current) => ({
        ...current,
        studentId: nextStudentId,
      }));
    }
  }, [checkoutForm.studentId, filteredStudents, schoolId]);

  useEffect(() => {
    async function refreshData() {
      if (!readRoles.has(role)) {
        return;
      }

      setIsRefreshing(true);
      setError(null);

      try {
        const [loanRows, itemRows] = await Promise.all([
          listLibraryLoans({ schoolId: schoolId || undefined, activeOnly }),
          listLibraryItems({ schoolId: schoolId || undefined }),
        ]);

        setLoans(loanRows);
        setItems(itemRows);

        setCheckoutForm((current) => ({
          ...current,
          itemId: itemRows.find((item) => item.id === current.itemId)?.id ?? itemRows[0]?.id ?? "",
        }));
      } catch (loadError) {
        setLoans([]);
        setItems([]);
        setError(loadError instanceof Error ? loadError.message : "Unable to load library loans.");
      } finally {
        setIsRefreshing(false);
      }
    }

    void refreshData();
  }, [activeOnly, role, schoolId]);

  async function refreshLoansAndItems() {
    const [loanRows, itemRows] = await Promise.all([
      listLibraryLoans({ schoolId: schoolId || undefined, activeOnly }),
      listLibraryItems({ schoolId: schoolId || undefined }),
    ]);

    setLoans(loanRows);
    setItems(itemRows);
  }

  async function handleCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!schoolId) {
      setError("Select a school first.");
      return;
    }

    if (!checkoutForm.itemId) {
      setError("Select an item.");
      return;
    }

    if (!checkoutForm.studentId.trim()) {
      setError("Student is required for checkout.");
      return;
    }

    if (!checkoutForm.dueDate) {
      setError("Due date is required.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await checkoutLibraryLoan({
        schoolId,
        itemId: checkoutForm.itemId,
        studentId: checkoutForm.studentId,
        dueDate: new Date(`${checkoutForm.dueDate}T23:59:59`).toISOString(),
      });

      setCheckoutForm((current) => ({ ...current, studentId: "", dueDate: "" }));
      setSuccessMessage("Loan checked out successfully.");
      await refreshLoansAndItems();
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Unable to checkout item.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleReturn(loanId: string) {
    setReturningLoanId(loanId);
    setError(null);
    setSuccessMessage(null);

    try {
      await returnLibraryLoan(loanId);
      setSuccessMessage("Loan returned.");
      await refreshLoansAndItems();
    } catch (returnError) {
      setError(returnError instanceof Error ? returnError.message : "Unable to return loan.");
    } finally {
      setReturningLoanId(null);
    }
  }

  async function handleMarkLost(loan: LibraryLoan) {
    if (
      !window.confirm(
        `Mark "${loan.item.title}" as lost for ${loan.student.firstName} ${loan.student.lastName}?`,
      )
    ) {
      return;
    }

    setMarkingLostLoanId(loan.id);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await markLibraryLoanLost(loan.id);
      setSuccessMessage(
        result.fineCreated
          ? "Loan marked as lost and library fine created."
          : "Loan marked as lost.",
      );
      await refreshLoansAndItems();
    } catch (markLostError) {
      setError(markLostError instanceof Error ? markLostError.message : "Unable to mark loan as lost.");
    } finally {
      setMarkingLostLoanId(null);
    }
  }

  async function handleMarkFound(loan: LibraryLoan) {
    if (
      !window.confirm(
        `Mark "${loan.item.title}" as found for ${loan.student.firstName} ${loan.student.lastName}?`,
      )
    ) {
      return;
    }

    setMarkingFoundLoanId(loan.id);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await markLibraryLoanFound(loan.id);
      setSuccessMessage(
        result.fineRequiresReview
          ? "Loan marked as found. Linked lost fine remains open; review it in Library Fines."
          : "Loan marked as found.",
      );
      await refreshLoansAndItems();
    } catch (markFoundError) {
      setError(markFoundError instanceof Error ? markFoundError.message : "Unable to mark loan as found.");
    } finally {
      setMarkingFoundLoanId(null);
    }
  }

  if (!readRoles.has(role)) {
    return (
      <EmptyState
        title="Restricted"
        description="Only OWNER, SUPER_ADMIN, ADMIN, and STAFF roles can manage library loans."
      />
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-slate-500">Loading library loans...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Library Loans"
        description="Checkout and return books for students."
        meta={<Badge variant="neutral">{selectedSchool?.name ?? "All schools"}</Badge>}
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {successMessage ? <Notice tone="success">{successMessage}</Notice> : null}

      <Card>
        <CardHeader>
          <CardTitle>Checkout</CardTitle>
          <CardDescription>Assign an available item to a student.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-4" onSubmit={handleCheckout}>
            <Field htmlFor="library-loans-school" label="School">
              <Select
                id="library-loans-school"
                value={schoolId}
                onChange={(event) => {
                  const nextSchoolId = event.target.value;
                  setSchoolId(nextSchoolId);
                  setCheckoutForm((current) => ({
                    ...current,
                    studentId: "",
                  }));
                }}
              >
                <option value="">Select school</option>
                {schools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field htmlFor="library-loans-item" label="Item">
              <Select
                id="library-loans-item"
                value={checkoutForm.itemId}
                onChange={(event) => setCheckoutForm((current) => ({ ...current, itemId: event.target.value }))}
              >
                <option value="">Select item</option>
                {selectableItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title} ({item.availableCopies} available)
                  </option>
                ))}
              </Select>
            </Field>

            <Field htmlFor="library-loans-student" label="Student">
              <Select
                id="library-loans-student"
                value={checkoutForm.studentId}
                onChange={(event) => setCheckoutForm((current) => ({ ...current, studentId: event.target.value }))}
                disabled={!schoolId || filteredStudents.length === 0}
              >
                <option value="">Select student</option>
                {filteredStudents.map((student) => (
                  <option key={student.id} value={student.id}>
                    {getStudentOptionLabel(student)}
                  </option>
                ))}
              </Select>
              {schoolId && filteredStudents.length === 0 ? (
                <p className="mt-1 text-xs text-slate-500">No students found in the selected school.</p>
              ) : null}
            </Field>

            <Field htmlFor="library-loans-due-date" label="Due date">
              <Input
                id="library-loans-due-date"
                type="date"
                value={checkoutForm.dueDate}
                onChange={(event) => setCheckoutForm((current) => ({ ...current, dueDate: event.target.value }))}
              />
            </Field>

            <div className="md:col-span-4 flex justify-end">
              <Button disabled={isSubmitting} type="submit">
                {isSubmitting ? "Checking out..." : "Checkout item"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Loans</CardTitle>
          <CardDescription>View active and returned loans.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field htmlFor="library-loans-active-only" label="View">
            <Select
              id="library-loans-active-only"
              value={activeOnly ? "active" : "all"}
              onChange={(event) => setActiveOnly(event.target.value === "active")}
            >
              <option value="active">Active loans only</option>
              <option value="all">All loans</option>
            </Select>
          </Field>

          {isRefreshing ? (
            <p className="text-sm text-slate-500">Loading loans...</p>
          ) : loans.length === 0 ? (
            <EmptyState compact title="No loans found" description="No loans match the selected filters." />
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50/80">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-slate-700">Student</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Item</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Checkout</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Due</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Status</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {loans.map((loan) => (
                      <tr className="align-top hover:bg-slate-50" key={loan.id}>
                        <td className="px-4 py-4">
                          <p className="font-medium text-slate-900">
                            {loan.student.firstName} {loan.student.lastName}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">{loan.student.username}</p>
                        </td>
                        <td className="px-4 py-4">
                          <p className="font-medium text-slate-900">{loan.item.title}</p>
                          <p className="mt-1 text-xs text-slate-500">{loan.item.author ?? "Unknown author"}</p>
                        </td>
                        <td className="px-4 py-4 text-slate-700">{formatDateLabel(loan.checkoutDate)}</td>
                        <td className="px-4 py-4 text-slate-700">{formatDateLabel(loan.dueDate)}</td>
                        <td className="px-4 py-4">
                          <Badge variant={getStatusVariant(loan.status)}>{loan.status.replace("_", " ")}</Badge>
                        </td>
                        <td className="px-4 py-4">
                          {loan.status === "ACTIVE" || loan.status === "OVERDUE" ? (
                            <div className="flex flex-wrap gap-2">
                              <Button
                                disabled={
                                  returningLoanId === loan.id ||
                                  markingLostLoanId === loan.id ||
                                  markingFoundLoanId === loan.id
                                }
                                size="sm"
                                variant="secondary"
                                onClick={() => void handleReturn(loan.id)}
                              >
                                {returningLoanId === loan.id ? "Returning..." : "Return"}
                              </Button>
                              <Button
                                disabled={
                                  returningLoanId === loan.id ||
                                  markingLostLoanId === loan.id ||
                                  markingFoundLoanId === loan.id
                                }
                                size="sm"
                                variant="danger"
                                onClick={() => void handleMarkLost(loan)}
                              >
                                {markingLostLoanId === loan.id ? "Updating..." : "Mark lost"}
                              </Button>
                            </div>
                          ) : loan.status === "LOST" ? (
                            <Button
                              disabled={markingFoundLoanId === loan.id || returningLoanId === loan.id}
                              size="sm"
                              variant="secondary"
                              onClick={() => void handleMarkFound(loan)}
                            >
                              {markingFoundLoanId === loan.id ? "Updating..." : "Mark found"}
                            </Button>
                          ) : (
                            <span className="text-xs text-slate-500">Returned</span>
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
    </div>
  );
}
