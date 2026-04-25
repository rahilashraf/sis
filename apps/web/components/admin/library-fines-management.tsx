"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  assessLibraryOverdueFines,
  assessUnclaimedHoldFine,
  createManualLibraryFine,
  getLibraryFineSettings,
  listLibraryFines,
  type LibraryFine,
  type LibraryFineReason,
  type LibraryFineSettings,
  type LibraryFineStatus,
  type LibraryLateFineFrequency,
  upsertLibraryFineSettings,
  waiveLibraryFine,
} from "@/lib/api/library";
import { listUsers, type ManagedUser } from "@/lib/api/users";
import { listSchools, type School } from "@/lib/api/schools";
import { formatDateLabel } from "@/lib/utils";

const readRoles = new Set(["OWNER", "SUPER_ADMIN", "ADMIN", "STAFF"]);
const finePolicyRoles = new Set(["OWNER", "SUPER_ADMIN"]);

type FineSettingsForm = {
  lateFineAmount: string;
  lostItemFineAmount: string;
  unclaimedHoldFineAmount: string;
  lateFineGraceDays: string;
  lateFineFrequency: LibraryLateFineFrequency;
};

type ManualFineForm = {
  studentId: string;
  reason: LibraryFineReason | "";
  amount: string;
  description: string;
  libraryItemId: string;
  checkoutId: string;
  holdReference: string;
  dueDate: string;
};

type UnclaimedHoldForm = {
  studentId: string;
  holdReference: string;
  libraryItemId: string;
  description: string;
  dueDate: string;
};

const defaultSettingsForm: FineSettingsForm = {
  lateFineAmount: "0.00",
  lostItemFineAmount: "0.00",
  unclaimedHoldFineAmount: "0.00",
  lateFineGraceDays: "0",
  lateFineFrequency: "PER_DAY",
};

const defaultManualFineForm: ManualFineForm = {
  studentId: "",
  reason: "",
  amount: "",
  description: "",
  libraryItemId: "",
  checkoutId: "",
  holdReference: "",
  dueDate: "",
};

const defaultUnclaimedHoldForm: UnclaimedHoldForm = {
  studentId: "",
  holdReference: "",
  libraryItemId: "",
  description: "",
  dueDate: "",
};

function formatCurrency(value: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "—";
  }

  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric);
}

function reasonLabel(reason: LibraryFineReason) {
  if (reason === "UNCLAIMED_HOLD") {
    return "Unclaimed hold";
  }
  return reason.charAt(0) + reason.slice(1).toLowerCase();
}

function statusVariant(status: LibraryFineStatus) {
  if (status === "PAID") return "success" as const;
  if (status === "OPEN") return "warning" as const;
  if (status === "WAIVED") return "primary" as const;
  return "neutral" as const;
}

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

  return user.memberships.some(
    (membership) => membership.schoolId === schoolId,
  );
}

export function LibraryFinesManagement() {
  const { session } = useAuth();
  const role = session?.user.role ?? "";
  const canManagePolicy = finePolicyRoles.has(role);

  const [schools, setSchools] = useState<School[]>([]);
  const [students, setStudents] = useState<ManagedUser[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [studentIdFilter, setStudentIdFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<LibraryFineStatus | "">("");
  const [reasonFilter, setReasonFilter] = useState<LibraryFineReason | "">("");

  const [settings, setSettings] = useState<LibraryFineSettings | null>(null);
  const [settingsForm, setSettingsForm] =
    useState<FineSettingsForm>(defaultSettingsForm);
  const [manualForm, setManualForm] = useState<ManualFineForm>(
    defaultManualFineForm,
  );
  const [unclaimedForm, setUnclaimedForm] = useState<UnclaimedHoldForm>(
    defaultUnclaimedHoldForm,
  );
  const [fines, setFines] = useState<LibraryFine[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingFines, setIsLoadingFines] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isCreatingManualFine, setIsCreatingManualFine] = useState(false);
  const [isWaivingFineId, setIsWaivingFineId] = useState<string | null>(null);
  const [isAssessingOverdue, setIsAssessingOverdue] = useState(false);
  const [isAssessingUnclaimed, setIsAssessingUnclaimed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const selectedSchool = useMemo(
    () => schools.find((school) => school.id === schoolId) ?? null,
    [schools, schoolId],
  );
  const filteredStudents = useMemo(
    () => students.filter((student) => userBelongsToSchool(student, schoolId)),
    [schoolId, students],
  );

  useEffect(() => {
    async function loadInitial() {
      if (!readRoles.has(role)) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const [schoolList, userList] = await Promise.all([
          listSchools({ includeInactive: false }),
          listUsers({ role: "STUDENT" }),
        ]);
        setSchools(schoolList);
        setStudents(userList);
        const defaultSchoolId =
          getDefaultSchoolContextId(session?.user) ?? schoolList[0]?.id ?? "";
        const resolved =
          schoolList.find((school) => school.id === defaultSchoolId)?.id ??
          schoolList[0]?.id ??
          "";
        setSchoolId(resolved);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load schools.",
        );
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
      !filteredStudents.some(
        (student) => student.id === manualForm.studentId,
      ) &&
      manualForm.studentId !== nextStudentId
    ) {
      setManualForm((current) => ({
        ...current,
        studentId: nextStudentId,
      }));
    }

    if (
      !filteredStudents.some(
        (student) => student.id === unclaimedForm.studentId,
      ) &&
      unclaimedForm.studentId !== nextStudentId
    ) {
      setUnclaimedForm((current) => ({
        ...current,
        studentId: nextStudentId,
      }));
    }
  }, [
    filteredStudents,
    manualForm.studentId,
    schoolId,
    unclaimedForm.studentId,
  ]);

  useEffect(() => {
    async function loadSettingsAndFines() {
      if (!readRoles.has(role) || !schoolId) {
        return;
      }

      setIsLoadingFines(true);
      setError(null);

      try {
        const [settingsResponse, finesResponse] = await Promise.all([
          getLibraryFineSettings(schoolId),
          listLibraryFines({
            schoolId,
            studentId: studentIdFilter.trim() || undefined,
            status: statusFilter || undefined,
            reason: reasonFilter || undefined,
          }),
        ]);

        setSettings(settingsResponse);
        setSettingsForm({
          lateFineAmount: settingsResponse.lateFineAmount,
          lostItemFineAmount: settingsResponse.lostItemFineAmount,
          unclaimedHoldFineAmount: settingsResponse.unclaimedHoldFineAmount,
          lateFineGraceDays: String(settingsResponse.lateFineGraceDays),
          lateFineFrequency: settingsResponse.lateFineFrequency,
        });
        setFines(finesResponse);
      } catch (loadError) {
        setSettings(null);
        setFines([]);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load library fine data.",
        );
      } finally {
        setIsLoadingFines(false);
      }
    }

    void loadSettingsAndFines();
  }, [reasonFilter, role, schoolId, statusFilter, studentIdFilter]);

  async function refreshFines() {
    if (!schoolId) {
      return;
    }

    const response = await listLibraryFines({
      schoolId,
      studentId: studentIdFilter.trim() || undefined,
      status: statusFilter || undefined,
      reason: reasonFilter || undefined,
    });
    setFines(response);
  }

  async function handleSaveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManagePolicy) {
      return;
    }

    if (!schoolId) {
      setError("Select a school first.");
      return;
    }

    const grace = Number(settingsForm.lateFineGraceDays);
    if (!Number.isInteger(grace) || grace < 0) {
      setError("Grace days must be a whole number 0 or above.");
      return;
    }

    setIsSavingSettings(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await upsertLibraryFineSettings({
        schoolId,
        lateFineAmount: settingsForm.lateFineAmount.trim(),
        lostItemFineAmount: settingsForm.lostItemFineAmount.trim(),
        unclaimedHoldFineAmount: settingsForm.unclaimedHoldFineAmount.trim(),
        lateFineGraceDays: grace,
        lateFineFrequency: settingsForm.lateFineFrequency,
      });

      setSettings(response);
      setSettingsForm({
        lateFineAmount: response.lateFineAmount,
        lostItemFineAmount: response.lostItemFineAmount,
        unclaimedHoldFineAmount: response.unclaimedHoldFineAmount,
        lateFineGraceDays: String(response.lateFineGraceDays),
        lateFineFrequency: response.lateFineFrequency,
      });
      setSuccessMessage("Fine settings saved.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save fine settings.",
      );
    } finally {
      setIsSavingSettings(false);
    }
  }

  async function handleCreateManualFine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!schoolId) {
      setError("Select a school first.");
      return;
    }

    if (!manualForm.studentId.trim()) {
      setError("Student is required.");
      return;
    }

    setIsCreatingManualFine(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await createManualLibraryFine({
        schoolId,
        studentId: manualForm.studentId.trim(),
        reason: manualForm.reason || undefined,
        amount: manualForm.amount.trim() || undefined,
        description: manualForm.description.trim() || undefined,
        libraryItemId: manualForm.libraryItemId.trim() || undefined,
        checkoutId: manualForm.checkoutId.trim() || undefined,
        holdReference: manualForm.holdReference.trim() || undefined,
        dueDate: manualForm.dueDate
          ? new Date(`${manualForm.dueDate}T23:59:59`).toISOString()
          : undefined,
      });

      setManualForm(defaultManualFineForm);
      setSuccessMessage("Library fine created.");
      await refreshFines();
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Unable to create fine.",
      );
    } finally {
      setIsCreatingManualFine(false);
    }
  }

  async function handleWaiveFine(fine: LibraryFine) {
    const reason = window.prompt("Optional waiver reason", "");
    if (reason === null) {
      return;
    }

    setIsWaivingFineId(fine.id);
    setError(null);
    setSuccessMessage(null);

    try {
      await waiveLibraryFine(fine.id, {
        reason: reason.trim() || undefined,
      });
      setSuccessMessage("Fine waived successfully.");
      await refreshFines();
    } catch (waiveError) {
      setError(
        waiveError instanceof Error
          ? waiveError.message
          : "Unable to waive fine.",
      );
    } finally {
      setIsWaivingFineId(null);
    }
  }

  async function handleAssessOverdue() {
    if (!schoolId) {
      setError("Select a school first.");
      return;
    }

    if (
      !window.confirm(
        "Assess overdue fines for current overdue loans in this school?",
      )
    ) {
      return;
    }

    setIsAssessingOverdue(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await assessLibraryOverdueFines({ schoolId });
      setSuccessMessage(
        `Overdue fine assessment completed: ${result.createdCount} created, ${result.duplicateCount} duplicates, ${result.skippedCount} skipped.`,
      );
      await refreshFines();
    } catch (assessmentError) {
      setError(
        assessmentError instanceof Error
          ? assessmentError.message
          : "Unable to assess overdue fines.",
      );
    } finally {
      setIsAssessingOverdue(false);
    }
  }

  async function handleAssessUnclaimed(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!schoolId) {
      setError("Select a school first.");
      return;
    }

    if (
      !unclaimedForm.studentId.trim() ||
      !unclaimedForm.holdReference.trim()
    ) {
      setError(
        "Student and hold reference are required for unclaimed hold fines.",
      );
      return;
    }

    setIsAssessingUnclaimed(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await assessUnclaimedHoldFine({
        schoolId,
        studentId: unclaimedForm.studentId.trim(),
        holdReference: unclaimedForm.holdReference.trim(),
        libraryItemId: unclaimedForm.libraryItemId.trim() || undefined,
        description: unclaimedForm.description.trim() || undefined,
        dueDate: unclaimedForm.dueDate
          ? new Date(`${unclaimedForm.dueDate}T23:59:59`).toISOString()
          : undefined,
      });

      setUnclaimedForm(defaultUnclaimedHoldForm);
      setSuccessMessage("Unclaimed hold fine created.");
      await refreshFines();
    } catch (assessmentError) {
      setError(
        assessmentError instanceof Error
          ? assessmentError.message
          : "Unable to create unclaimed hold fine.",
      );
    } finally {
      setIsAssessingUnclaimed(false);
    }
  }

  if (!readRoles.has(role)) {
    return (
      <EmptyState
        title="Restricted"
        description="Only OWNER, SUPER_ADMIN, ADMIN, and STAFF roles can manage library fines."
      />
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-slate-500">
            Loading library fine management…
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Library Fines"
        description="Manage fine policies, assess fines, and resolve student library balances."
        meta={
          <>
            <Badge variant="neutral">
              {selectedSchool?.name ?? "No school selected"}
            </Badge>
            <Badge variant="neutral">{fines.length} fines</Badge>
          </>
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {successMessage ? <Notice tone="success">{successMessage}</Notice> : null}

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>
            Filter fines by school, student, status, and reason.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <Field htmlFor="library-fines-school" label="School">
            <Select
              id="library-fines-school"
              value={schoolId}
              onChange={(event) => setSchoolId(event.target.value)}
            >
              <option value="">Select school</option>
              {schools.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field htmlFor="library-fines-student" label="Student ID">
            <Input
              id="library-fines-student"
              placeholder="Filter by student ID"
              value={studentIdFilter}
              onChange={(event) => setStudentIdFilter(event.target.value)}
            />
          </Field>

          <Field htmlFor="library-fines-status" label="Status">
            <Select
              id="library-fines-status"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as LibraryFineStatus | "")
              }
            >
              <option value="">All statuses</option>
              <option value="OPEN">Open</option>
              <option value="WAIVED">Waived</option>
              <option value="PAID">Paid</option>
              <option value="VOID">Void</option>
            </Select>
          </Field>

          <Field htmlFor="library-fines-reason" label="Reason">
            <Select
              id="library-fines-reason"
              value={reasonFilter}
              onChange={(event) =>
                setReasonFilter(event.target.value as LibraryFineReason | "")
              }
            >
              <option value="">All reasons</option>
              <option value="LATE">Late</option>
              <option value="LOST">Lost</option>
              <option value="UNCLAIMED_HOLD">Unclaimed hold</option>
              <option value="MANUAL">Manual</option>
            </Select>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fine Settings</CardTitle>
          <CardDescription>
            Policy values used for automatic library fines. Only OWNER and
            SUPER_ADMIN can edit.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 md:grid-cols-5"
            onSubmit={handleSaveSettings}
          >
            <Field htmlFor="library-late-fine-amount" label="Late fine amount">
              <Input
                id="library-late-fine-amount"
                inputMode="decimal"
                value={settingsForm.lateFineAmount}
                onChange={(event) =>
                  setSettingsForm((current) => ({
                    ...current,
                    lateFineAmount: event.target.value,
                  }))
                }
              />
            </Field>

            <Field htmlFor="library-lost-fine-amount" label="Lost item amount">
              <Input
                id="library-lost-fine-amount"
                inputMode="decimal"
                value={settingsForm.lostItemFineAmount}
                onChange={(event) =>
                  setSettingsForm((current) => ({
                    ...current,
                    lostItemFineAmount: event.target.value,
                  }))
                }
              />
            </Field>

            <Field
              htmlFor="library-unclaimed-fine-amount"
              label="Unclaimed hold amount"
            >
              <Input
                id="library-unclaimed-fine-amount"
                inputMode="decimal"
                value={settingsForm.unclaimedHoldFineAmount}
                onChange={(event) =>
                  setSettingsForm((current) => ({
                    ...current,
                    unclaimedHoldFineAmount: event.target.value,
                  }))
                }
              />
            </Field>

            <Field htmlFor="library-grace-days" label="Grace days">
              <Input
                id="library-grace-days"
                min={0}
                step={1}
                type="number"
                value={settingsForm.lateFineGraceDays}
                onChange={(event) =>
                  setSettingsForm((current) => ({
                    ...current,
                    lateFineGraceDays: event.target.value,
                  }))
                }
              />
            </Field>

            <Field htmlFor="library-fine-frequency" label="Late fine frequency">
              <Select
                id="library-fine-frequency"
                value={settingsForm.lateFineFrequency}
                onChange={(event) =>
                  setSettingsForm((current) => ({
                    ...current,
                    lateFineFrequency: event.target
                      .value as LibraryLateFineFrequency,
                  }))
                }
              >
                <option value="PER_DAY">Per day</option>
                <option value="FLAT">Flat</option>
              </Select>
            </Field>

            <div className="md:col-span-5 flex items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                Current settings updated{" "}
                {settings?.updatedAt
                  ? formatDateLabel(settings.updatedAt)
                  : "—"}
              </p>
              <Button
                disabled={!canManagePolicy || isSavingSettings}
                type="submit"
              >
                {isSavingSettings ? "Saving…" : "Save settings"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Operational Actions</CardTitle>
          <CardDescription>
            Run fine assessments and issue manual fines.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              disabled={isAssessingOverdue || !schoolId}
              onClick={() => void handleAssessOverdue()}
              type="button"
            >
              {isAssessingOverdue ? "Assessing…" : "Assess overdue fines"}
            </Button>
            <p className="text-xs text-slate-500">
              Creates LATE fines for overdue active loans using current policy.
            </p>
          </div>

          <form
            className="grid gap-4 md:grid-cols-5"
            onSubmit={handleAssessUnclaimed}
          >
            <Field
              htmlFor="library-unclaimed-student"
              label="Unclaimed hold student"
            >
              <Select
                id="library-unclaimed-student"
                value={unclaimedForm.studentId}
                onChange={(event) =>
                  setUnclaimedForm((current) => ({
                    ...current,
                    studentId: event.target.value,
                  }))
                }
              >
                <option value="">Select student</option>
                {filteredStudents.map((student) => (
                  <option key={student.id} value={student.id}>
                    {getStudentLabel(student)} ({student.username})
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              htmlFor="library-unclaimed-hold-reference"
              label="Hold reference"
            >
              <Input
                id="library-unclaimed-hold-reference"
                value={unclaimedForm.holdReference}
                onChange={(event) =>
                  setUnclaimedForm((current) => ({
                    ...current,
                    holdReference: event.target.value,
                  }))
                }
              />
            </Field>

            <Field
              htmlFor="library-unclaimed-item"
              label="Library item ID (optional)"
            >
              <Input
                id="library-unclaimed-item"
                value={unclaimedForm.libraryItemId}
                onChange={(event) =>
                  setUnclaimedForm((current) => ({
                    ...current,
                    libraryItemId: event.target.value,
                  }))
                }
              />
            </Field>

            <Field
              htmlFor="library-unclaimed-due-date"
              label="Due date (optional)"
            >
              <Input
                id="library-unclaimed-due-date"
                type="date"
                value={unclaimedForm.dueDate}
                onChange={(event) =>
                  setUnclaimedForm((current) => ({
                    ...current,
                    dueDate: event.target.value,
                  }))
                }
              />
            </Field>

            <Field
              htmlFor="library-unclaimed-description"
              label="Description (optional)"
            >
              <Input
                id="library-unclaimed-description"
                value={unclaimedForm.description}
                onChange={(event) =>
                  setUnclaimedForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </Field>

            <div className="md:col-span-5 flex justify-end">
              <Button disabled={isAssessingUnclaimed} type="submit">
                {isAssessingUnclaimed
                  ? "Creating…"
                  : "Create unclaimed hold fine"}
              </Button>
            </div>
          </form>

          <form
            className="grid gap-4 md:grid-cols-4"
            onSubmit={handleCreateManualFine}
          >
            <Field htmlFor="library-manual-student-id" label="Student">
              <Select
                id="library-manual-student-id"
                value={manualForm.studentId}
                onChange={(event) =>
                  setManualForm((current) => ({
                    ...current,
                    studentId: event.target.value,
                  }))
                }
              >
                <option value="">Select student</option>
                {filteredStudents.map((student) => (
                  <option key={student.id} value={student.id}>
                    {getStudentLabel(student)} ({student.username})
                  </option>
                ))}
              </Select>
            </Field>

            <Field htmlFor="library-manual-reason" label="Reason">
              <Select
                id="library-manual-reason"
                value={manualForm.reason}
                onChange={(event) =>
                  setManualForm((current) => ({
                    ...current,
                    reason: event.target.value as LibraryFineReason | "",
                  }))
                }
              >
                <option value="">Manual</option>
                <option value="LATE">Late</option>
                <option value="LOST">Lost</option>
                <option value="UNCLAIMED_HOLD">Unclaimed hold</option>
                <option value="MANUAL">Manual</option>
              </Select>
            </Field>

            <Field htmlFor="library-manual-amount" label="Amount (optional)">
              <Input
                id="library-manual-amount"
                inputMode="decimal"
                value={manualForm.amount}
                onChange={(event) =>
                  setManualForm((current) => ({
                    ...current,
                    amount: event.target.value,
                  }))
                }
              />
            </Field>

            <Field
              htmlFor="library-manual-due-date"
              label="Due date (optional)"
            >
              <Input
                id="library-manual-due-date"
                type="date"
                value={manualForm.dueDate}
                onChange={(event) =>
                  setManualForm((current) => ({
                    ...current,
                    dueDate: event.target.value,
                  }))
                }
              />
            </Field>

            <Field
              htmlFor="library-manual-checkout-id"
              label="Checkout ID (if late/lost)"
            >
              <Input
                id="library-manual-checkout-id"
                value={manualForm.checkoutId}
                onChange={(event) =>
                  setManualForm((current) => ({
                    ...current,
                    checkoutId: event.target.value,
                  }))
                }
              />
            </Field>

            <Field htmlFor="library-manual-item-id" label="Item ID (optional)">
              <Input
                id="library-manual-item-id"
                value={manualForm.libraryItemId}
                onChange={(event) =>
                  setManualForm((current) => ({
                    ...current,
                    libraryItemId: event.target.value,
                  }))
                }
              />
            </Field>

            <Field
              htmlFor="library-manual-hold-reference"
              label="Hold reference (if unclaimed)"
            >
              <Input
                id="library-manual-hold-reference"
                value={manualForm.holdReference}
                onChange={(event) =>
                  setManualForm((current) => ({
                    ...current,
                    holdReference: event.target.value,
                  }))
                }
              />
            </Field>

            <Field
              htmlFor="library-manual-description"
              label="Description (optional)"
            >
              <Input
                id="library-manual-description"
                value={manualForm.description}
                onChange={(event) =>
                  setManualForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </Field>

            <div className="md:col-span-4 flex justify-end">
              <Button disabled={isCreatingManualFine} type="submit">
                {isCreatingManualFine ? "Creating…" : "Create manual fine"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fine Records</CardTitle>
          <CardDescription>
            Open and settled library fines linked to student billing charges.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingFines ? (
            <p className="text-sm text-slate-500">Loading fines…</p>
          ) : fines.length === 0 ? (
            <EmptyState
              compact
              title="No fines found"
              description="No library fines match the current filters."
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
                        Reason
                      </th>
                      <th className="px-4 py-3 font-semibold text-right text-slate-700">
                        Amount
                      </th>
                      <th className="px-4 py-3 font-semibold text-slate-700">
                        Status
                      </th>
                      <th className="px-4 py-3 font-semibold text-slate-700">
                        Assessed
                      </th>
                      <th className="px-4 py-3 font-semibold text-slate-700">
                        Charge
                      </th>
                      <th className="px-4 py-3 font-semibold text-slate-700">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {fines.map((fine) => (
                      <tr className="align-top hover:bg-slate-50" key={fine.id}>
                        <td className="px-4 py-4">
                          <p className="font-medium text-slate-900">
                            {fine.student.firstName} {fine.student.lastName}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {fine.student.username}
                          </p>
                        </td>
                        <td className="px-4 py-4">
                          <p className="font-medium text-slate-900">
                            {reasonLabel(fine.reason)}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {fine.description ?? "—"}
                          </p>
                        </td>
                        <td className="px-4 py-4 text-right font-medium text-slate-900">
                          {formatCurrency(fine.amount)}
                        </td>
                        <td className="px-4 py-4">
                          <Badge variant={statusVariant(fine.status)}>
                            {fine.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-4 text-slate-700">
                          {formatDateLabel(fine.assessedAt)}
                        </td>
                        <td className="px-4 py-4 text-xs text-slate-600">
                          {fine.billingCharge ? (
                            <>
                              <p className="font-medium text-slate-900">
                                {fine.billingCharge.title}
                              </p>
                              <p>{fine.billingCharge.id}</p>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-4">
                          {fine.status === "OPEN" ? (
                            <Button
                              disabled={isWaivingFineId === fine.id}
                              size="sm"
                              variant="secondary"
                              onClick={() => void handleWaiveFine(fine)}
                            >
                              {isWaivingFineId === fine.id
                                ? "Waiving…"
                                : "Waive"}
                            </Button>
                          ) : (
                            <span className="text-xs text-slate-500">
                              No action
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
    </div>
  );
}
