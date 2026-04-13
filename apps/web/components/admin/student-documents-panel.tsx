"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Select } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  archiveStudentDocument,
  createStudentDocument,
  deleteStudentDocument,
  listStudentDocuments,
  type StudentDocument,
  type StudentDocumentVisibility,
} from "@/lib/api/student-documents";
import { formatDateLabel } from "@/lib/utils";

const documentTypeOptions = [
  { value: "HEALTH_CARD", label: "Health card" },
  { value: "IMMUNIZATION_RECORD", label: "Immunization record" },
  { value: "REGISTRATION_FORM", label: "Registration form" },
  { value: "OTHER", label: "Other" },
] as const;

function formatDocumentType(value: string) {
  const match = documentTypeOptions.find((option) => option.value === value);
  if (match) {
    return match.label;
  }

  return value
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function formatVisibility(value: StudentDocumentVisibility) {
  return value === "PARENT_PORTAL" ? "Parent portal" : "Staff only";
}

export function StudentDocumentsPanel({
  studentId,
  canManage,
}: {
  studentId: string;
  canManage: boolean;
}) {
  const [documents, setDocuments] = useState<StudentDocument[]>([]);
  const [label, setLabel] = useState("");
  const [type, setType] = useState<(typeof documentTypeOptions)[number]["value"]>("OTHER");
  const [visibility, setVisibility] = useState<StudentDocumentVisibility>("STAFF_ONLY");
  const [fileName, setFileName] = useState("");
  const [mimeType, setMimeType] = useState("application/octet-stream");
  const [fileSize, setFileSize] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<StudentDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const sortedDocuments = useMemo(
    () =>
      [...documents].sort(
        (left, right) =>
          new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
      ),
    [documents],
  );

  async function loadDocuments() {
    setIsLoading(true);
    setError(null);

    try {
      const response = await listStudentDocuments(studentId);
      setDocuments(response);
    } catch (loadError) {
      setDocuments([]);
      setError(loadError instanceof Error ? loadError.message : "Unable to load student documents.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadDocuments();
  }, [studentId]);

  async function handleCreateDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const trimmedFileName = fileName.trim();
      if (!trimmedFileName) {
        throw new Error("Select a file before creating the document record.");
      }

      await createStudentDocument(studentId, {
        type,
        visibility,
        label: label.trim() || null,
        fileName: trimmedFileName,
        mimeType: mimeType.trim() || "application/octet-stream",
        fileSize: Number.isFinite(fileSize) && fileSize >= 0 ? fileSize : 0,
        storagePath: `manual://${studentId}/${Date.now()}-${trimmedFileName}`,
      });

      setLabel("");
      setType("OTHER");
      setVisibility("STAFF_ONLY");
      setFileName("");
      setMimeType("application/octet-stream");
      setFileSize(0);
      await loadDocuments();
      setSuccessMessage("Document record added.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to create document record.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleArchiveDocument(documentId: string) {
    if (!canManage) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await archiveStudentDocument(studentId, documentId);
      await loadDocuments();
      setSuccessMessage("Document archived.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to archive document.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteDocument() {
    if (!deleteTarget || !canManage) {
      return;
    }

    setIsDeleting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await deleteStudentDocument(studentId, deleteTarget.id);
      setDeleteTarget(null);
      await loadDocuments();
      setSuccessMessage("Document deleted.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to delete document.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Documents</CardTitle>
        <CardDescription>
          {canManage
            ? "Add document metadata, set parent visibility, and archive or remove records safely."
            : "Read-only document records for this student."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {successMessage ? <Notice tone="success">{successMessage}</Notice> : null}

        {canManage ? (
          <form className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2" onSubmit={handleCreateDocument}>
            <Field htmlFor="student-document-file" label="File">
              <Input
                id="student-document-file"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  if (!file) {
                    setFileName("");
                    setMimeType("application/octet-stream");
                    setFileSize(0);
                    return;
                  }

                  setFileName(file.name);
                  setMimeType(file.type || "application/octet-stream");
                  setFileSize(file.size);
                }}
                type="file"
              />
            </Field>

            <Field htmlFor="student-document-label" label="Title">
              <Input
                id="student-document-label"
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Emergency medical summary"
                value={label}
              />
            </Field>

            <Field htmlFor="student-document-type" label="Type">
              <Select
                id="student-document-type"
                onChange={(event) =>
                  setType(event.target.value as (typeof documentTypeOptions)[number]["value"])
                }
                value={type}
              >
                {documentTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field htmlFor="student-document-visibility" label="Visibility">
              <Select
                id="student-document-visibility"
                onChange={(event) =>
                  setVisibility(event.target.value as StudentDocumentVisibility)
                }
                value={visibility}
              >
                <option value="STAFF_ONLY">Staff only</option>
                <option value="PARENT_PORTAL">Parent portal</option>
              </Select>
            </Field>

            <div className="md:col-span-2 flex justify-end">
              <Button disabled={isSaving} type="submit">
                {isSaving ? "Saving..." : "Add document"}
              </Button>
            </div>
          </form>
        ) : null}

        {isLoading ? (
          <p className="text-sm text-slate-500">Loading documents...</p>
        ) : sortedDocuments.length === 0 ? (
          <EmptyState
            compact
            description="No document records are available for this student yet."
            title="No documents"
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50/80">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-slate-700">Title</th>
                    <th className="px-4 py-3 font-semibold text-slate-700">Type</th>
                    <th className="px-4 py-3 font-semibold text-slate-700">Visibility</th>
                    <th className="px-4 py-3 font-semibold text-slate-700">Created</th>
                    <th className="px-4 py-3 font-semibold text-slate-700">Status</th>
                    {canManage ? (
                      <th className="px-4 py-3 font-semibold text-slate-700">Actions</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {sortedDocuments.map((document) => (
                    <tr className="align-top hover:bg-slate-50" key={document.id}>
                      <td className="px-4 py-3 text-slate-900">
                        <p className="font-medium">{document.label || document.fileName}</p>
                        <p className="mt-1 text-xs text-slate-500">{document.fileName}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{formatDocumentType(document.type)}</td>
                      <td className="px-4 py-3 text-slate-600">{formatVisibility(document.visibility)}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDateLabel(document.createdAt)}</td>
                      <td className="px-4 py-3">
                        <Badge variant={document.isActive ? "success" : "neutral"}>
                          {document.isActive ? "Active" : "Archived"}
                        </Badge>
                      </td>
                      {canManage ? (
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <Button
                              disabled={isSaving || !document.isActive}
                              onClick={() => void handleArchiveDocument(document.id)}
                              size="sm"
                              type="button"
                              variant="secondary"
                            >
                              Archive
                            </Button>
                            <Button
                              disabled={isSaving}
                              onClick={() => setDeleteTarget(document)}
                              size="sm"
                              type="button"
                              variant="danger"
                            >
                              Delete
                            </Button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        cancelLabel="Cancel"
        confirmLabel="Delete"
        description={
          deleteTarget
            ? `Delete "${deleteTarget.label || deleteTarget.fileName}" permanently?`
            : ""
        }
        isOpen={Boolean(deleteTarget)}
        isPending={isDeleting}
        onCancel={() => {
          if (isDeleting) {
            return;
          }
          setDeleteTarget(null);
        }}
        onConfirm={handleDeleteDocument}
        pendingLabel="Deleting..."
        title="Delete document"
      />
    </Card>
  );
}
