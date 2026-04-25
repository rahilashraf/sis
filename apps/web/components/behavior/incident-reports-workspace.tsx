"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import type { AuthenticatedUser } from "@/lib/auth/types";
import {
  createBehaviorRecord,
  deleteBehaviorAttachment,
  downloadBehaviorAttachment,
  getBehaviorStudentPrefill,
  listBehaviorCategories,
  listBehaviorRecords,
  listBehaviorStudents,
  updateBehaviorRecord,
  uploadBehaviorAttachment,
  type BehaviorCategoryOption,
  type BehaviorRecord,
  type BehaviorRecordStatus,
  type BehaviorStudentLookup,
  type IncidentAffectedPersonType,
  type IncidentFirstAidStatus,
  type IncidentJhscNotificationStatus,
  type IncidentLevel,
  type IncidentPostDestination,
  type IncidentWitnessInput,
  type IncidentWitnessRole,
} from "@/lib/api/behavior";
import { normalizeDateOnlyPayload } from "@/lib/date";
import { formatDateTimeLabel, formatRoleLabel } from "@/lib/utils";

type Mode = "admin" | "teacher";

type IncidentFormState = {
  studentId: string;
  incidentAt: string;
  categoryOptionId: string;
  incidentLevel: IncidentLevel;
  title: string;
  description: string;
  actionTaken: string;
  followUpRequired: boolean;
  parentContacted: boolean;
  status: BehaviorRecordStatus;
  program: string;
  reporterName: string;
  reporterEmail: string;
  reporterRole: string;
  affectedPersonType: IncidentAffectedPersonType;
  affectedPersonName: string;
  affectedPersonAddress: string;
  affectedPersonDateOfBirth: string;
  affectedPersonPhone: string;
  firstAidStatus: IncidentFirstAidStatus;
  firstAidAdministeredBy: string;
  firstAidAdministeredByPhone: string;
  firstAidDetails: string;
  isIncidentTimeApproximate: boolean;
  postIncidentDestination: IncidentPostDestination;
  postIncidentDestinationOther: string;
  jhscNotificationStatus: IncidentJhscNotificationStatus;
  additionalNotes: string;
  witnesses: IncidentWitnessInput[];
};

type RecordFilters = {
  studentId: string;
  status: "" | BehaviorRecordStatus;
  incidentLevel: "" | IncidentLevel;
  category: string;
  startDate: string;
  endDate: string;
};

const incidentLevelOptions: Array<{ value: IncidentLevel; label: string }> = [
  { value: "MINOR", label: "Minor" },
  { value: "MAJOR", label: "Major" },
];

const statusOptions: Array<{ value: BehaviorRecordStatus; label: string }> = [
  { value: "OPEN", label: "Open" },
  { value: "RESOLVED", label: "Resolved" },
];

const affectedPersonTypeOptions: Array<{
  value: IncidentAffectedPersonType;
  label: string;
}> = [
  { value: "STUDENT", label: "Student" },
  { value: "STAFF", label: "Staff" },
  { value: "OTHER", label: "Other" },
];

const firstAidStatusOptions: Array<{
  value: IncidentFirstAidStatus;
  label: string;
}> = [
  { value: "YES", label: "Yes" },
  { value: "NO", label: "No" },
  { value: "NOT_APPLICABLE", label: "Not applicable" },
];

const witnessRoleOptions: Array<{ value: IncidentWitnessRole; label: string }> =
  [
    { value: "STAFF", label: "Staff" },
    { value: "STUDENT", label: "Student" },
    { value: "OTHER", label: "Other" },
  ];

const destinationOptions: Array<{
  value: IncidentPostDestination;
  label: string;
}> = [
  { value: "RETURNED_TO_CLASS_OR_WORK", label: "Returned to class/work" },
  { value: "HOME", label: "Home" },
  { value: "HOSPITAL", label: "Hospital" },
  { value: "OTHER", label: "Other" },
];

const jhscOptions: Array<{
  value: IncidentJhscNotificationStatus;
  label: string;
}> = [
  { value: "YES", label: "Yes" },
  { value: "NO", label: "No" },
  { value: "NOT_APPLICABLE", label: "Not applicable" },
];

function getDefaultIncidentAt() {
  const now = new Date();
  const minutes = `${now.getMinutes()}`.padStart(2, "0");
  const hours = `${now.getHours()}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}T${hours}:${minutes}`;
}

function toDateTimeLocal(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const minutes = `${parsed.getMinutes()}`.padStart(2, "0");
  const hours = `${parsed.getHours()}`.padStart(2, "0");
  const day = `${parsed.getDate()}`.padStart(2, "0");
  const month = `${parsed.getMonth() + 1}`.padStart(2, "0");

  return `${parsed.getFullYear()}-${month}-${day}T${hours}:${minutes}`;
}

function toDateInput(value: string | null) {
  return normalizeDateOnlyPayload(value);
}

function buildEmptyWitness(): IncidentWitnessInput {
  return {
    name: "",
    phoneNumber: "",
    role: "OTHER",
    notes: "",
  };
}

function buildDefaultForm(
  categories: BehaviorCategoryOption[],
): IncidentFormState {
  return {
    studentId: "",
    incidentAt: getDefaultIncidentAt(),
    categoryOptionId: categories.find((entry) => entry.isActive)?.id ?? "",
    incidentLevel: "MINOR",
    title: "",
    description: "",
    actionTaken: "",
    followUpRequired: false,
    parentContacted: false,
    status: "OPEN",
    program: "",
    reporterName: "",
    reporterEmail: "",
    reporterRole: "",
    affectedPersonType: "STUDENT",
    affectedPersonName: "",
    affectedPersonAddress: "",
    affectedPersonDateOfBirth: "",
    affectedPersonPhone: "",
    firstAidStatus: "NOT_APPLICABLE",
    firstAidAdministeredBy: "",
    firstAidAdministeredByPhone: "",
    firstAidDetails: "",
    isIncidentTimeApproximate: false,
    postIncidentDestination: "RETURNED_TO_CLASS_OR_WORK",
    postIncidentDestinationOther: "",
    jhscNotificationStatus: "NOT_APPLICABLE",
    additionalNotes: "",
    witnesses: [],
  };
}

function buildEditForm(record: BehaviorRecord): IncidentFormState {
  const report = record.incidentReport;

  return {
    studentId: record.studentId,
    incidentAt: toDateTimeLocal(record.incidentAt),
    categoryOptionId: record.categoryOptionId ?? "",
    incidentLevel: record.incidentLevel,
    title: record.title,
    description: record.description,
    actionTaken: record.actionTaken ?? "",
    followUpRequired: record.followUpRequired,
    parentContacted: record.parentContacted,
    status: record.status,
    program: report?.program ?? "",
    reporterName: report?.reporterName ?? "",
    reporterEmail: report?.reporterEmail ?? "",
    reporterRole: report?.reporterRole ?? "",
    affectedPersonType: report?.affectedPersonType ?? "STUDENT",
    affectedPersonName: report?.affectedPersonName ?? "",
    affectedPersonAddress: report?.affectedPersonAddress ?? "",
    affectedPersonDateOfBirth: toDateInput(
      report?.affectedPersonDateOfBirth ?? null,
    ),
    affectedPersonPhone: report?.affectedPersonPhone ?? "",
    firstAidStatus: report?.firstAidStatus ?? "NOT_APPLICABLE",
    firstAidAdministeredBy: report?.firstAidAdministeredBy ?? "",
    firstAidAdministeredByPhone: report?.firstAidAdministeredByPhone ?? "",
    firstAidDetails: report?.firstAidDetails ?? "",
    isIncidentTimeApproximate: report?.isIncidentTimeApproximate ?? false,
    postIncidentDestination:
      report?.postIncidentDestination ?? "RETURNED_TO_CLASS_OR_WORK",
    postIncidentDestinationOther: report?.postIncidentDestinationOther ?? "",
    jhscNotificationStatus: report?.jhscNotificationStatus ?? "NOT_APPLICABLE",
    additionalNotes: report?.additionalNotes ?? "",
    witnesses:
      report?.witnesses.map((witness) => ({
        name: witness.name,
        phoneNumber: witness.phoneNumber ?? "",
        role: witness.role ?? "OTHER",
        notes: witness.notes ?? "",
      })) ?? [],
  };
}

function getStudentLabel(student: BehaviorStudentLookup) {
  const schoolLabel =
    student.schools[0]?.shortName ?? student.schools[0]?.name ?? "No school";
  return `${student.fullName} • ${schoolLabel}`;
}

function buildReporterSnapshot(sessionUser: AuthenticatedUser | null) {
  if (!sessionUser) {
    return {
      reporterName: "",
      reporterEmail: "",
      reporterRole: "",
    };
  }

  const reporterName =
    `${sessionUser.firstName} ${sessionUser.lastName}`.trim();

  return {
    reporterName,
    reporterEmail: sessionUser.email ?? "",
    reporterRole: formatRoleLabel(sessionUser.role),
  };
}

export function IncidentReportsWorkspace({ mode }: { mode: Mode }) {
  const searchParams = useSearchParams();
  const { session } = useAuth();
  const [records, setRecords] = useState<BehaviorRecord[]>([]);
  const [categories, setCategories] = useState<BehaviorCategoryOption[]>([]);
  const [students, setStudents] = useState<BehaviorStudentLookup[]>([]);
  const [studentSearch, setStudentSearch] = useState("");
  const [filters, setFilters] = useState<RecordFilters>({
    studentId: "",
    status: "",
    incidentLevel: "",
    category: "",
    startDate: "",
    endDate: "",
  });
  const [form, setForm] = useState<IncidentFormState>(buildDefaultForm([]));
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [editingForm, setEditingForm] = useState<IncidentFormState | null>(
    null,
  );
  const [attachmentFiles, setAttachmentFiles] = useState<
    Record<string, File | null>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);
  const [uploadingRecordId, setUploadingRecordId] = useState<string | null>(
    null,
  );
  const [downloadingAttachmentId, setDownloadingAttachmentId] = useState<
    string | null
  >(null);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<
    string | null
  >(null);
  const [didApplyInitialStudentFilter, setDidApplyInitialStudentFilter] =
    useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const initialStudentId = searchParams.get("studentId")?.trim() || "";

  const canDeleteAttachments =
    session?.user.role === "OWNER" ||
    session?.user.role === "SUPER_ADMIN" ||
    session?.user.role === "ADMIN";

  const activeCategories = useMemo(
    () => categories.filter((entry) => entry.isActive),
    [categories],
  );

  const studentById = useMemo(
    () => new Map(students.map((student) => [student.id, student])),
    [students],
  );

  const reporterSnapshot = useMemo(
    () => buildReporterSnapshot(session?.user ?? null),
    [session?.user],
  );

  const recordsSorted = useMemo(
    () =>
      [...records].sort(
        (left, right) =>
          new Date(right.incidentAt).getTime() -
          new Date(left.incidentAt).getTime(),
      ),
    [records],
  );

  useEffect(() => {
    setForm((current) => ({
      ...current,
      reporterName: reporterSnapshot.reporterName,
      reporterEmail: reporterSnapshot.reporterEmail,
      reporterRole: reporterSnapshot.reporterRole,
    }));
    setEditingForm((current) =>
      current
        ? {
            ...current,
            reporterName: current.reporterName || reporterSnapshot.reporterName,
            reporterEmail:
              current.reporterEmail || reporterSnapshot.reporterEmail,
            reporterRole: current.reporterRole || reporterSnapshot.reporterRole,
          }
        : current,
    );
  }, [reporterSnapshot]);

  async function loadStudents(query = "") {
    setIsLoadingStudents(true);
    try {
      const response = await listBehaviorStudents({ query, limit: 50 });
      setStudents(response);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load students.",
      );
    } finally {
      setIsLoadingStudents(false);
    }
  }

  async function loadRecords(nextFilters = filters) {
    const response = await listBehaviorRecords({
      studentId: nextFilters.studentId || undefined,
      status: nextFilters.status || undefined,
      incidentLevel: nextFilters.incidentLevel || undefined,
      category: nextFilters.category || undefined,
      startDate: nextFilters.startDate || undefined,
      endDate: nextFilters.endDate || undefined,
    });
    setRecords(response);
  }

  async function loadData() {
    setIsLoading(true);
    setError(null);

    try {
      const [categoryResponse] = await Promise.all([listBehaviorCategories()]);
      setCategories(categoryResponse);
      setForm((current) =>
        current.categoryOptionId
          ? current
          : {
              ...current,
              categoryOptionId:
                categoryResponse.find((entry) => entry.isActive)?.id ?? "",
            },
      );
      await Promise.all([loadStudents(), loadRecords()]);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load incident reports.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (!initialStudentId || didApplyInitialStudentFilter) {
      return;
    }

    const nextFilters: RecordFilters = {
      ...filters,
      studentId: initialStudentId,
    };
    setDidApplyInitialStudentFilter(true);
    setFilters(nextFilters);
    setForm((current) => ({ ...current, studentId: initialStudentId }));
    void applyPrefill(initialStudentId, "create");
    void loadRecords(nextFilters);
  }, [didApplyInitialStudentFilter, filters, initialStudentId]);

  async function applyPrefill(
    targetStudentId: string,
    target: "create" | "edit",
  ) {
    if (!targetStudentId) {
      return;
    }

    try {
      const prefill = await getBehaviorStudentPrefill(targetStudentId);
      const studentName = prefill.student.fullName;
      const studentDob = toDateInput(prefill.student.dateOfBirth);
      const schoolProgramContext =
        prefill.student.schools[0]?.shortName ??
        prefill.student.schools[0]?.name ??
        "";

      if (target === "create") {
        setForm((current) => ({
          ...current,
          affectedPersonName: studentName || current.affectedPersonName,
          affectedPersonDateOfBirth:
            studentDob || current.affectedPersonDateOfBirth,
          affectedPersonAddress:
            prefill.student.address || current.affectedPersonAddress,
          affectedPersonPhone:
            prefill.student.phone || current.affectedPersonPhone,
          program: schoolProgramContext || current.program,
        }));
      } else {
        setEditingForm((current) =>
          current
            ? {
                ...current,
                affectedPersonName: studentName || current.affectedPersonName,
                affectedPersonDateOfBirth:
                  studentDob || current.affectedPersonDateOfBirth,
                affectedPersonAddress:
                  prefill.student.address || current.affectedPersonAddress,
                affectedPersonPhone:
                  prefill.student.phone || current.affectedPersonPhone,
                program: schoolProgramContext || current.program,
              }
            : current,
        );
      }
    } catch (prefillError) {
      setError(
        prefillError instanceof Error
          ? prefillError.message
          : "Unable to prefill student data.",
      );
    }
  }

  function mapFormToPayload(input: IncidentFormState) {
    return {
      incidentAt: new Date(input.incidentAt).toISOString(),
      categoryOptionId: input.categoryOptionId,
      incidentLevel: input.incidentLevel,
      title: input.title.trim(),
      description: input.description.trim(),
      actionTaken: input.actionTaken.trim() || null,
      followUpRequired: input.followUpRequired,
      parentContacted: input.parentContacted,
      status: input.status,
      incidentReport: {
        program: input.program.trim() || null,
        affectedPersonType: input.affectedPersonType,
        affectedPersonName: input.affectedPersonName.trim() || null,
        affectedPersonAddress: input.affectedPersonAddress.trim() || null,
        affectedPersonDateOfBirth: input.affectedPersonDateOfBirth || null,
        affectedPersonPhone: input.affectedPersonPhone.trim() || null,
        firstAidStatus: input.firstAidStatus,
        firstAidAdministeredBy: input.firstAidAdministeredBy.trim() || null,
        firstAidAdministeredByPhone:
          input.firstAidAdministeredByPhone.trim() || null,
        firstAidDetails: input.firstAidDetails.trim() || null,
        isIncidentTimeApproximate: input.isIncidentTimeApproximate,
        postIncidentDestination: input.postIncidentDestination,
        postIncidentDestinationOther:
          input.postIncidentDestinationOther.trim() || null,
        jhscNotificationStatus: input.jhscNotificationStatus,
        additionalNotes: input.additionalNotes.trim() || null,
        witnesses: input.witnesses
          .filter((witness) => witness.name?.trim())
          .map((witness) => ({
            name: witness.name.trim(),
            phoneNumber: witness.phoneNumber?.trim() || null,
            role: witness.role,
            notes: witness.notes?.trim() || null,
          })),
      },
    };
  }

  async function handleCreateRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (!form.studentId) {
        throw new Error("Student is required.");
      }

      await createBehaviorRecord({
        studentId: form.studentId,
        ...mapFormToPayload(form),
      });
      await loadRecords();
      setForm(buildDefaultForm(categories));
      setSuccessMessage("Incident report created.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to create incident report.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  function beginEditing(record: BehaviorRecord) {
    setEditingRecordId(record.id);
    setEditingForm(buildEditForm(record));
    setError(null);
    setSuccessMessage(null);
  }

  async function handleSaveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingRecordId || !editingForm) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await updateBehaviorRecord(
        editingRecordId,
        mapFormToPayload(editingForm),
      );
      await loadRecords();
      setEditingRecordId(null);
      setEditingForm(null);
      setSuccessMessage("Incident report updated.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to update incident report.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleUploadAttachment(recordId: string) {
    const file = attachmentFiles[recordId] ?? null;
    if (!file) {
      setError("Select a PDF file to upload.");
      return;
    }

    setUploadingRecordId(recordId);
    setError(null);
    setSuccessMessage(null);

    try {
      await uploadBehaviorAttachment(recordId, file);
      await loadRecords();
      setAttachmentFiles((current) => ({ ...current, [recordId]: null }));
      setSuccessMessage("Attachment uploaded.");
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Unable to upload attachment.",
      );
    } finally {
      setUploadingRecordId(null);
    }
  }

  async function handleDownloadAttachment(
    recordId: string,
    attachmentId: string,
  ) {
    setDownloadingAttachmentId(attachmentId);
    setError(null);

    try {
      const download = await downloadBehaviorAttachment(recordId, attachmentId);
      const objectUrl = URL.createObjectURL(download.blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = download.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "Unable to download attachment.",
      );
    } finally {
      setDownloadingAttachmentId(null);
    }
  }

  async function handleDeleteAttachment(
    recordId: string,
    attachmentId: string,
  ) {
    setDeletingAttachmentId(attachmentId);
    setError(null);
    setSuccessMessage(null);

    try {
      await deleteBehaviorAttachment(recordId, attachmentId);
      await loadRecords();
      setSuccessMessage("Attachment deleted.");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete attachment.",
      );
    } finally {
      setDeletingAttachmentId(null);
    }
  }

  function updateWitness(
    target: "create" | "edit",
    index: number,
    nextValue: Partial<IncidentWitnessInput>,
  ) {
    if (target === "create") {
      setForm((current) => ({
        ...current,
        witnesses: current.witnesses.map((witness, witnessIndex) =>
          witnessIndex === index ? { ...witness, ...nextValue } : witness,
        ),
      }));
      return;
    }

    setEditingForm((current) =>
      current
        ? {
            ...current,
            witnesses: current.witnesses.map((witness, witnessIndex) =>
              witnessIndex === index ? { ...witness, ...nextValue } : witness,
            ),
          }
        : current,
    );
  }

  function addWitness(target: "create" | "edit") {
    if (target === "create") {
      setForm((current) => ({
        ...current,
        witnesses: [...current.witnesses, buildEmptyWitness()],
      }));
      return;
    }

    setEditingForm((current) =>
      current
        ? {
            ...current,
            witnesses: [...current.witnesses, buildEmptyWitness()],
          }
        : current,
    );
  }

  function removeWitness(target: "create" | "edit", index: number) {
    if (target === "create") {
      setForm((current) => ({
        ...current,
        witnesses: current.witnesses.filter(
          (_, witnessIndex) => witnessIndex !== index,
        ),
      }));
      return;
    }

    setEditingForm((current) =>
      current
        ? {
            ...current,
            witnesses: current.witnesses.filter(
              (_, witnessIndex) => witnessIndex !== index,
            ),
          }
        : current,
    );
  }

  const pageTitle =
    mode === "admin" ? "Incident Reports" : "Class Incident Reports";
  const pageDescription =
    mode === "admin"
      ? "File, review, and update incident reports across your allowed schools."
      : "File and manage incident reports for students you are allowed to access.";

  return (
    <div className="space-y-6">
      <PageHeader
        title={pageTitle}
        description={pageDescription}
        meta={<Badge variant="neutral">{records.length} records</Badge>}
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {successMessage ? <Notice tone="success">{successMessage}</Notice> : null}

      <Card>
        <CardHeader>
          <CardTitle>Search and Filters</CardTitle>
          <CardDescription>
            Find students and filter incident reports by level, status,
            category, and date.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          <Field htmlFor="incident-student-search" label="Student search">
            <Input
              id="incident-student-search"
              placeholder="Search students"
              value={studentSearch}
              onChange={(event) => setStudentSearch(event.target.value)}
              onBlur={() => {
                void loadStudents(studentSearch.trim());
              }}
            />
          </Field>

          <Field htmlFor="incident-filter-student" label="Student">
            <Select
              id="incident-filter-student"
              value={filters.studentId}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  studentId: event.target.value,
                }))
              }
            >
              <option value="">All students</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {getStudentLabel(student)}
                </option>
              ))}
            </Select>
          </Field>

          <Field htmlFor="incident-filter-level" label="Incident level">
            <Select
              id="incident-filter-level"
              value={filters.incidentLevel}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  incidentLevel: event.target
                    .value as RecordFilters["incidentLevel"],
                }))
              }
            >
              <option value="">All levels</option>
              {incidentLevelOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field htmlFor="incident-filter-status" label="Status">
            <Select
              id="incident-filter-status"
              value={filters.status}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  status: event.target.value as RecordFilters["status"],
                }))
              }
            >
              <option value="">All statuses</option>
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field htmlFor="incident-filter-category" label="Incident category">
            <Select
              id="incident-filter-category"
              value={filters.category}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  category: event.target.value,
                }))
              }
            >
              <option value="">All categories</option>
              {activeCategories.map((category) => (
                <option key={category.id} value={category.name}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field htmlFor="incident-filter-start" label="Start date">
            <Input
              id="incident-filter-start"
              type="date"
              value={filters.startDate}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  startDate: event.target.value,
                }))
              }
            />
          </Field>

          <Field htmlFor="incident-filter-end" label="End date">
            <Input
              id="incident-filter-end"
              type="date"
              value={filters.endDate}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  endDate: event.target.value,
                }))
              }
            />
          </Field>

          <div className="md:col-span-3 lg:col-span-6 flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                void loadRecords(filters);
              }}
            >
              Apply filters
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                const reset: RecordFilters = {
                  studentId: "",
                  status: "",
                  incidentLevel: "",
                  category: "",
                  startDate: "",
                  endDate: "",
                };
                setFilters(reset);
                void loadRecords(reset);
              }}
            >
              Reset
            </Button>
          </div>

          {isLoadingStudents ? (
            <p className="md:col-span-3 lg:col-span-6 text-xs text-slate-500">
              Loading students...
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {editingRecordId ? "Edit Incident Report" : "New Incident Report"}
          </CardTitle>
          <CardDescription>
            Complete the incident report sections and upload supporting PDF
            documents as needed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-6"
            onSubmit={editingRecordId ? handleSaveEdit : handleCreateRecord}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field htmlFor="incident-form-student" label="Affected student">
                <Select
                  id="incident-form-student"
                  value={
                    (editingRecordId
                      ? editingForm?.studentId
                      : form.studentId) ?? ""
                  }
                  onChange={(event) => {
                    const nextStudentId = event.target.value;
                    if (editingRecordId) {
                      setEditingForm((current) =>
                        current
                          ? { ...current, studentId: nextStudentId }
                          : current,
                      );
                      void applyPrefill(nextStudentId, "edit");
                    } else {
                      setForm((current) => ({
                        ...current,
                        studentId: nextStudentId,
                      }));
                      void applyPrefill(nextStudentId, "create");
                    }
                  }}
                >
                  <option value="">Select student</option>
                  {students.map((student) => (
                    <option key={student.id} value={student.id}>
                      {getStudentLabel(student)}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                htmlFor="incident-form-date-time"
                label="Incident date/time"
              >
                <Input
                  id="incident-form-date-time"
                  type="datetime-local"
                  value={
                    (editingRecordId
                      ? editingForm?.incidentAt
                      : form.incidentAt) ?? ""
                  }
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    if (editingRecordId) {
                      setEditingForm((current) =>
                        current
                          ? { ...current, incidentAt: nextValue }
                          : current,
                      );
                    } else {
                      setForm((current) => ({
                        ...current,
                        incidentAt: nextValue,
                      }));
                    }
                  }}
                />
              </Field>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <Field htmlFor="incident-form-category" label="Incident category">
                <Select
                  id="incident-form-category"
                  value={
                    (editingRecordId
                      ? editingForm?.categoryOptionId
                      : form.categoryOptionId) ?? ""
                  }
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    if (editingRecordId) {
                      setEditingForm((current) =>
                        current
                          ? { ...current, categoryOptionId: nextValue }
                          : current,
                      );
                    } else {
                      setForm((current) => ({
                        ...current,
                        categoryOptionId: nextValue,
                      }));
                    }
                  }}
                >
                  <option value="">Select incident category</option>
                  {activeCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field htmlFor="incident-form-level" label="Incident level">
                <Select
                  id="incident-form-level"
                  value={
                    (editingRecordId
                      ? editingForm?.incidentLevel
                      : form.incidentLevel) ?? "MINOR"
                  }
                  onChange={(event) => {
                    const nextValue = event.target.value as IncidentLevel;
                    if (editingRecordId) {
                      setEditingForm((current) =>
                        current
                          ? { ...current, incidentLevel: nextValue }
                          : current,
                      );
                    } else {
                      setForm((current) => ({
                        ...current,
                        incidentLevel: nextValue,
                      }));
                    }
                  }}
                >
                  {incidentLevelOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field htmlFor="incident-form-status" label="Status">
                <Select
                  id="incident-form-status"
                  value={
                    (editingRecordId ? editingForm?.status : form.status) ??
                    "OPEN"
                  }
                  onChange={(event) => {
                    const nextValue = event.target
                      .value as BehaviorRecordStatus;
                    if (editingRecordId) {
                      setEditingForm((current) =>
                        current ? { ...current, status: nextValue } : current,
                      );
                    } else {
                      setForm((current) => ({ ...current, status: nextValue }));
                    }
                  }}
                >
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field htmlFor="incident-form-title" label="Short summary">
                <Input
                  id="incident-form-title"
                  value={
                    (editingRecordId ? editingForm?.title : form.title) ?? ""
                  }
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    if (editingRecordId) {
                      setEditingForm((current) =>
                        current ? { ...current, title: nextValue } : current,
                      );
                    } else {
                      setForm((current) => ({ ...current, title: nextValue }));
                    }
                  }}
                />
              </Field>

              <Field htmlFor="incident-form-program" label="Program">
                <Input
                  id="incident-form-program"
                  value={
                    (editingRecordId ? editingForm?.program : form.program) ??
                    ""
                  }
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    if (editingRecordId) {
                      setEditingForm((current) =>
                        current ? { ...current, program: nextValue } : current,
                      );
                    } else {
                      setForm((current) => ({
                        ...current,
                        program: nextValue,
                      }));
                    }
                  }}
                />
              </Field>
            </div>

            <Field htmlFor="incident-form-description" label="What happened">
              <Textarea
                id="incident-form-description"
                rows={4}
                value={
                  (editingRecordId
                    ? editingForm?.description
                    : form.description) ?? ""
                }
                onChange={(event) => {
                  const nextValue = event.target.value;
                  if (editingRecordId) {
                    setEditingForm((current) =>
                      current
                        ? { ...current, description: nextValue }
                        : current,
                    );
                  } else {
                    setForm((current) => ({
                      ...current,
                      description: nextValue,
                    }));
                  }
                }}
              />
            </Field>

            <section className="space-y-3 rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-900">
                Staff Information
              </h3>
              <div className="grid gap-4 md:grid-cols-3">
                <Field htmlFor="incident-reporter-name" label="Submitted by">
                  <Input
                    disabled
                    id="incident-reporter-name"
                    readOnly
                    value={
                      (editingRecordId
                        ? editingForm?.reporterName
                        : form.reporterName) ?? ""
                    }
                  />
                </Field>
                <Field htmlFor="incident-reporter-email" label="Reporter email">
                  <Input
                    disabled
                    id="incident-reporter-email"
                    readOnly
                    value={
                      (editingRecordId
                        ? editingForm?.reporterEmail
                        : form.reporterEmail) ?? ""
                    }
                  />
                </Field>
                <Field htmlFor="incident-reporter-role" label="Reporter role">
                  <Input
                    disabled
                    id="incident-reporter-role"
                    readOnly
                    value={
                      (editingRecordId
                        ? editingForm?.reporterRole
                        : form.reporterRole) ?? ""
                    }
                  />
                </Field>
              </div>
            </section>

            <section className="space-y-3 rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-900">
                The Affected Person
              </h3>
              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  htmlFor="incident-affected-type"
                  label="Affected person type"
                >
                  <Select
                    id="incident-affected-type"
                    value={
                      (editingRecordId
                        ? editingForm?.affectedPersonType
                        : form.affectedPersonType) ?? "STUDENT"
                    }
                    onChange={(event) => {
                      const nextValue = event.target
                        .value as IncidentAffectedPersonType;
                      if (editingRecordId) {
                        setEditingForm((current) =>
                          current
                            ? { ...current, affectedPersonType: nextValue }
                            : current,
                        );
                      } else {
                        setForm((current) => ({
                          ...current,
                          affectedPersonType: nextValue,
                        }));
                      }
                    }}
                  >
                    {affectedPersonTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field htmlFor="incident-affected-name" label="Name">
                  <Input
                    id="incident-affected-name"
                    value={
                      (editingRecordId
                        ? editingForm?.affectedPersonName
                        : form.affectedPersonName) ?? ""
                    }
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      if (editingRecordId) {
                        setEditingForm((current) =>
                          current
                            ? { ...current, affectedPersonName: nextValue }
                            : current,
                        );
                      } else {
                        setForm((current) => ({
                          ...current,
                          affectedPersonName: nextValue,
                        }));
                      }
                    }}
                  />
                </Field>
                <Field htmlFor="incident-affected-dob" label="Date of birth">
                  <Input
                    id="incident-affected-dob"
                    type="date"
                    value={
                      (editingRecordId
                        ? editingForm?.affectedPersonDateOfBirth
                        : form.affectedPersonDateOfBirth) ?? ""
                    }
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      if (editingRecordId) {
                        setEditingForm((current) =>
                          current
                            ? {
                                ...current,
                                affectedPersonDateOfBirth: nextValue,
                              }
                            : current,
                        );
                      } else {
                        setForm((current) => ({
                          ...current,
                          affectedPersonDateOfBirth: nextValue,
                        }));
                      }
                    }}
                  />
                </Field>
                <Field htmlFor="incident-affected-phone" label="Phone number">
                  <Input
                    id="incident-affected-phone"
                    value={
                      (editingRecordId
                        ? editingForm?.affectedPersonPhone
                        : form.affectedPersonPhone) ?? ""
                    }
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      if (editingRecordId) {
                        setEditingForm((current) =>
                          current
                            ? { ...current, affectedPersonPhone: nextValue }
                            : current,
                        );
                      } else {
                        setForm((current) => ({
                          ...current,
                          affectedPersonPhone: nextValue,
                        }));
                      }
                    }}
                  />
                </Field>
                <Field
                  className="md:col-span-2"
                  htmlFor="incident-affected-address"
                  label="Address"
                >
                  <Input
                    id="incident-affected-address"
                    value={
                      (editingRecordId
                        ? editingForm?.affectedPersonAddress
                        : form.affectedPersonAddress) ?? ""
                    }
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      if (editingRecordId) {
                        setEditingForm((current) =>
                          current
                            ? { ...current, affectedPersonAddress: nextValue }
                            : current,
                        );
                      } else {
                        setForm((current) => ({
                          ...current,
                          affectedPersonAddress: nextValue,
                        }));
                      }
                    }}
                  />
                </Field>
              </div>
            </section>

            <section className="space-y-3 rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">
                  Witness Details
                </h3>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    addWitness(editingRecordId ? "edit" : "create")
                  }
                >
                  Add witness
                </Button>
              </div>
              {(editingRecordId ? editingForm?.witnesses : form.witnesses)
                ?.length ? (
                <div className="space-y-3">
                  {(editingRecordId
                    ? editingForm?.witnesses
                    : form.witnesses
                  )?.map((witness, index) => (
                    <div
                      key={`${index}-${witness.name}`}
                      className="grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-4"
                    >
                      <Field htmlFor={`witness-name-${index}`} label="Name">
                        <Input
                          id={`witness-name-${index}`}
                          value={witness.name}
                          onChange={(event) =>
                            updateWitness(
                              editingRecordId ? "edit" : "create",
                              index,
                              {
                                name: event.target.value,
                              },
                            )
                          }
                        />
                      </Field>
                      <Field htmlFor={`witness-phone-${index}`} label="Phone">
                        <Input
                          id={`witness-phone-${index}`}
                          value={witness.phoneNumber ?? ""}
                          onChange={(event) =>
                            updateWitness(
                              editingRecordId ? "edit" : "create",
                              index,
                              {
                                phoneNumber: event.target.value,
                              },
                            )
                          }
                        />
                      </Field>
                      <Field htmlFor={`witness-role-${index}`} label="Role">
                        <Select
                          id={`witness-role-${index}`}
                          value={witness.role ?? "OTHER"}
                          onChange={(event) =>
                            updateWitness(
                              editingRecordId ? "edit" : "create",
                              index,
                              {
                                role: event.target.value as IncidentWitnessRole,
                              },
                            )
                          }
                        >
                          {witnessRoleOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field htmlFor={`witness-notes-${index}`} label="Notes">
                        <Input
                          id={`witness-notes-${index}`}
                          value={witness.notes ?? ""}
                          onChange={(event) =>
                            updateWitness(
                              editingRecordId ? "edit" : "create",
                              index,
                              {
                                notes: event.target.value,
                              },
                            )
                          }
                        />
                      </Field>
                      <div className="md:col-span-4 flex justify-end">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            removeWitness(
                              editingRecordId ? "edit" : "create",
                              index,
                            )
                          }
                        >
                          Remove witness
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">No witnesses added.</p>
              )}
            </section>

            <section className="space-y-3 rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-900">
                First Aid Details
              </h3>
              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  htmlFor="incident-first-aid-status"
                  label="First aid administered"
                >
                  <Select
                    id="incident-first-aid-status"
                    value={
                      (editingRecordId
                        ? editingForm?.firstAidStatus
                        : form.firstAidStatus) ?? "NOT_APPLICABLE"
                    }
                    onChange={(event) => {
                      const nextValue = event.target
                        .value as IncidentFirstAidStatus;
                      if (editingRecordId) {
                        setEditingForm((current) =>
                          current
                            ? { ...current, firstAidStatus: nextValue }
                            : current,
                        );
                      } else {
                        setForm((current) => ({
                          ...current,
                          firstAidStatus: nextValue,
                        }));
                      }
                    }}
                  >
                    {firstAidStatusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  htmlFor="incident-first-aid-by"
                  label="Who administered first aid"
                >
                  <Input
                    id="incident-first-aid-by"
                    value={
                      (editingRecordId
                        ? editingForm?.firstAidAdministeredBy
                        : form.firstAidAdministeredBy) ?? ""
                    }
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      if (editingRecordId) {
                        setEditingForm((current) =>
                          current
                            ? { ...current, firstAidAdministeredBy: nextValue }
                            : current,
                        );
                      } else {
                        setForm((current) => ({
                          ...current,
                          firstAidAdministeredBy: nextValue,
                        }));
                      }
                    }}
                  />
                </Field>
                <Field
                  htmlFor="incident-first-aid-phone"
                  label="First aid phone number"
                >
                  <Input
                    id="incident-first-aid-phone"
                    value={
                      (editingRecordId
                        ? editingForm?.firstAidAdministeredByPhone
                        : form.firstAidAdministeredByPhone) ?? ""
                    }
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      if (editingRecordId) {
                        setEditingForm((current) =>
                          current
                            ? {
                                ...current,
                                firstAidAdministeredByPhone: nextValue,
                              }
                            : current,
                        );
                      } else {
                        setForm((current) => ({
                          ...current,
                          firstAidAdministeredByPhone: nextValue,
                        }));
                      }
                    }}
                  />
                </Field>
                <Field
                  className="md:col-span-2"
                  htmlFor="incident-first-aid-details"
                  label="First aid care details"
                >
                  <Textarea
                    id="incident-first-aid-details"
                    rows={2}
                    value={
                      (editingRecordId
                        ? editingForm?.firstAidDetails
                        : form.firstAidDetails) ?? ""
                    }
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      if (editingRecordId) {
                        setEditingForm((current) =>
                          current
                            ? { ...current, firstAidDetails: nextValue }
                            : current,
                        );
                      } else {
                        setForm((current) => ({
                          ...current,
                          firstAidDetails: nextValue,
                        }));
                      }
                    }}
                  />
                </Field>
              </div>
            </section>

            <section className="space-y-3 rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-900">
                Post-Incident Details
              </h3>
              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  htmlFor="incident-destination"
                  label="Where did the affected person go next"
                >
                  <Select
                    id="incident-destination"
                    value={
                      (editingRecordId
                        ? editingForm?.postIncidentDestination
                        : form.postIncidentDestination) ??
                      "RETURNED_TO_CLASS_OR_WORK"
                    }
                    onChange={(event) => {
                      const nextValue = event.target
                        .value as IncidentPostDestination;
                      if (editingRecordId) {
                        setEditingForm((current) =>
                          current
                            ? { ...current, postIncidentDestination: nextValue }
                            : current,
                        );
                      } else {
                        setForm((current) => ({
                          ...current,
                          postIncidentDestination: nextValue,
                        }));
                      }
                    }}
                  >
                    {destinationOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  htmlFor="incident-jhsc"
                  label="Joint Health and Safety notified"
                >
                  <Select
                    id="incident-jhsc"
                    value={
                      (editingRecordId
                        ? editingForm?.jhscNotificationStatus
                        : form.jhscNotificationStatus) ?? "NOT_APPLICABLE"
                    }
                    onChange={(event) => {
                      const nextValue = event.target
                        .value as IncidentJhscNotificationStatus;
                      if (editingRecordId) {
                        setEditingForm((current) =>
                          current
                            ? { ...current, jhscNotificationStatus: nextValue }
                            : current,
                        );
                      } else {
                        setForm((current) => ({
                          ...current,
                          jhscNotificationStatus: nextValue,
                        }));
                      }
                    }}
                  >
                    {jhscOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  htmlFor="incident-destination-other"
                  label="Destination details (if other)"
                >
                  <Input
                    id="incident-destination-other"
                    value={
                      (editingRecordId
                        ? editingForm?.postIncidentDestinationOther
                        : form.postIncidentDestinationOther) ?? ""
                    }
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      if (editingRecordId) {
                        setEditingForm((current) =>
                          current
                            ? {
                                ...current,
                                postIncidentDestinationOther: nextValue,
                              }
                            : current,
                        );
                      } else {
                        setForm((current) => ({
                          ...current,
                          postIncidentDestinationOther: nextValue,
                        }));
                      }
                    }}
                  />
                </Field>
                <CheckboxField
                  checked={
                    (editingRecordId
                      ? editingForm?.isIncidentTimeApproximate
                      : form.isIncidentTimeApproximate) ?? false
                  }
                  label="Incident time is approximate"
                  onChange={(event) => {
                    const nextValue = event.target.checked;
                    if (editingRecordId) {
                      setEditingForm((current) =>
                        current
                          ? { ...current, isIncidentTimeApproximate: nextValue }
                          : current,
                      );
                    } else {
                      setForm((current) => ({
                        ...current,
                        isIncidentTimeApproximate: nextValue,
                      }));
                    }
                  }}
                />
              </div>
            </section>

            <Field htmlFor="incident-action-taken" label="Action taken">
              <Textarea
                id="incident-action-taken"
                rows={2}
                value={
                  (editingRecordId
                    ? editingForm?.actionTaken
                    : form.actionTaken) ?? ""
                }
                onChange={(event) => {
                  const nextValue = event.target.value;
                  if (editingRecordId) {
                    setEditingForm((current) =>
                      current
                        ? { ...current, actionTaken: nextValue }
                        : current,
                    );
                  } else {
                    setForm((current) => ({
                      ...current,
                      actionTaken: nextValue,
                    }));
                  }
                }}
              />
            </Field>

            <Field htmlFor="incident-additional-notes" label="Additional notes">
              <Textarea
                id="incident-additional-notes"
                rows={3}
                value={
                  (editingRecordId
                    ? editingForm?.additionalNotes
                    : form.additionalNotes) ?? ""
                }
                onChange={(event) => {
                  const nextValue = event.target.value;
                  if (editingRecordId) {
                    setEditingForm((current) =>
                      current
                        ? { ...current, additionalNotes: nextValue }
                        : current,
                    );
                  } else {
                    setForm((current) => ({
                      ...current,
                      additionalNotes: nextValue,
                    }));
                  }
                }}
              />
            </Field>

            <div className="grid gap-2 md:grid-cols-2">
              <CheckboxField
                checked={
                  (editingRecordId
                    ? editingForm?.followUpRequired
                    : form.followUpRequired) ?? false
                }
                label="Follow-up required"
                onChange={(event) => {
                  const nextValue = event.target.checked;
                  if (editingRecordId) {
                    setEditingForm((current) =>
                      current
                        ? { ...current, followUpRequired: nextValue }
                        : current,
                    );
                  } else {
                    setForm((current) => ({
                      ...current,
                      followUpRequired: nextValue,
                    }));
                  }
                }}
              />
              <CheckboxField
                checked={
                  (editingRecordId
                    ? editingForm?.parentContacted
                    : form.parentContacted) ?? false
                }
                label="Parent contacted"
                onChange={(event) => {
                  const nextValue = event.target.checked;
                  if (editingRecordId) {
                    setEditingForm((current) =>
                      current
                        ? { ...current, parentContacted: nextValue }
                        : current,
                    );
                  } else {
                    setForm((current) => ({
                      ...current,
                      parentContacted: nextValue,
                    }));
                  }
                }}
              />
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              {editingRecordId ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setEditingRecordId(null);
                    setEditingForm(null);
                  }}
                >
                  Cancel edit
                </Button>
              ) : null}
              <Button disabled={isSaving} type="submit">
                {isSaving
                  ? "Saving..."
                  : editingRecordId
                    ? "Save incident report"
                    : "Create incident report"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Incident Report Log</CardTitle>
          <CardDescription>
            Review reports, open edit mode, and manage supporting attachments.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <p className="text-sm text-slate-500">
              Loading incident reports...
            </p>
          ) : recordsSorted.length === 0 ? (
            <p className="text-sm text-slate-500">
              No incident reports found for the selected filters.
            </p>
          ) : (
            recordsSorted.map((record) => (
              <div
                key={record.id}
                className="rounded-xl border border-slate-200 bg-white p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {record.title}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatDateTimeLabel(record.incidentAt)} •{" "}
                      {record.categoryName}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Student:{" "}
                      {studentById.get(record.studentId)?.fullName ??
                        record.studentId}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        record.incidentLevel === "MAJOR" ? "danger" : "warning"
                      }
                    >
                      {record.incidentLevel === "MAJOR" ? "Major" : "Minor"}
                    </Badge>
                    <Badge
                      variant={
                        record.status === "RESOLVED" ? "success" : "warning"
                      }
                    >
                      {record.status === "RESOLVED" ? "Resolved" : "Open"}
                    </Badge>
                  </div>
                </div>

                <p className="mt-3 text-sm text-slate-700">
                  {record.description}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge variant="neutral">
                    {record.attachments?.length ?? 0} attachment
                    {(record.attachments?.length ?? 0) === 1 ? "" : "s"}
                  </Badge>
                  <Button
                    size="sm"
                    type="button"
                    variant="secondary"
                    onClick={() => beginEditing(record)}
                  >
                    Edit report
                  </Button>
                </div>

                <div className="mt-3 rounded-lg border border-slate-200 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Attachments
                  </p>
                  {record.attachments?.length ? (
                    <div className="mt-2 space-y-2">
                      {record.attachments.map((attachment) => (
                        <div
                          key={attachment.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 px-3 py-2 text-sm"
                        >
                          <div>
                            <p className="font-medium text-slate-800">
                              {attachment.originalFileName}
                            </p>
                            <p className="text-xs text-slate-500">
                              {Math.max(
                                1,
                                Math.round(attachment.fileSize / 1024),
                              )}{" "}
                              KB
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              type="button"
                              variant="secondary"
                              disabled={
                                downloadingAttachmentId === attachment.id
                              }
                              onClick={() => {
                                void handleDownloadAttachment(
                                  record.id,
                                  attachment.id,
                                );
                              }}
                            >
                              {downloadingAttachmentId === attachment.id
                                ? "Downloading..."
                                : "Download"}
                            </Button>
                            {canDeleteAttachments ? (
                              <Button
                                size="sm"
                                type="button"
                                variant="danger"
                                disabled={
                                  deletingAttachmentId === attachment.id
                                }
                                onClick={() => {
                                  void handleDeleteAttachment(
                                    record.id,
                                    attachment.id,
                                  );
                                }}
                              >
                                {deletingAttachmentId === attachment.id
                                  ? "Deleting..."
                                  : "Delete"}
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-slate-500">
                      No attachments.
                    </p>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Input
                      accept="application/pdf,.pdf"
                      type="file"
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        setAttachmentFiles((current) => ({
                          ...current,
                          [record.id]: file,
                        }));
                      }}
                    />
                    <Button
                      size="sm"
                      type="button"
                      disabled={
                        uploadingRecordId === record.id ||
                        !attachmentFiles[record.id]
                      }
                      onClick={() => {
                        void handleUploadAttachment(record.id);
                      }}
                    >
                      {uploadingRecordId === record.id
                        ? "Uploading..."
                        : "Upload PDF"}
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
