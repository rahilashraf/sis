"use client";

import { useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import {
  createAttendanceCustomStatus,
  getAttendanceCustomStatuses,
  getAttendanceStatusRules,
  updateAttendanceCustomStatus,
  updateAttendanceStatusRule,
  type AttendanceCustomStatus,
  type AttendanceStatus,
  type AttendanceStatusCountBehavior,
} from "@/lib/api/attendance";
import { listSchools, type School } from "@/lib/api/schools";
import { useAuth } from "@/lib/auth/auth-context";

const builtInStatuses: Array<{ status: AttendanceStatus; label: string }> = [
  { status: "PRESENT", label: "Present" },
  { status: "ABSENT", label: "Absent" },
  { status: "LATE", label: "Late" },
  { status: "EXCUSED", label: "Excused" },
];

const behaviors: Array<{ value: AttendanceStatusCountBehavior; label: string }> = [
  { value: "PRESENT", label: "Counts as Present" },
  { value: "LATE", label: "Counts as Late" },
  { value: "ABSENT", label: "Counts as Absent" },
  { value: "INFORMATIONAL", label: "Informational / does not affect rate" },
];

type Confirmation =
  | { kind: "rule"; status: AttendanceStatus; previous: AttendanceStatusCountBehavior; next: AttendanceStatusCountBehavior }
  | { kind: "custom"; status: AttendanceCustomStatus; values: { label?: string; behavior?: AttendanceStatusCountBehavior; isActive?: boolean } }
  | null;

function behaviorLabel(value: AttendanceStatusCountBehavior) {
  return behaviors.find((behavior) => behavior.value === value)?.label ?? value;
}

export function AttendanceSettingsWorkspace() {
  const { selectedSchoolId } = useAuth();
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolId, setSchoolId] = useState(selectedSchoolId ?? "");
  const [rules, setRules] = useState<Array<{ schoolId: string; status: AttendanceStatus; behavior: AttendanceStatusCountBehavior }>>([]);
  const [customStatuses, setCustomStatuses] = useState<AttendanceCustomStatus[]>([]);
  const [label, setLabel] = useState("");
  const [behavior, setBehavior] = useState<AttendanceStatusCountBehavior>("INFORMATIONAL");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [editingBehavior, setEditingBehavior] = useState<AttendanceStatusCountBehavior>("INFORMATIONAL");
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedSchool = useMemo(() => schools.find((school) => school.id === schoolId), [schoolId, schools]);

  useEffect(() => {
    void listSchools()
      .then((loadedSchools) => {
        setSchools(loadedSchools);
        setSchoolId((current) => current || selectedSchoolId || loadedSchools[0]?.id || "");
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load schools."));
  }, [selectedSchoolId]);

  useEffect(() => {
    let cancelled = false;
    async function loadSettings() {
      if (!schoolId) {
        setRules([]);
        setCustomStatuses([]);
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        const [nextRules, nextStatuses] = await Promise.all([
          getAttendanceStatusRules(schoolId),
          getAttendanceCustomStatuses({ schoolId, includeInactive: true }),
        ]);
        if (!cancelled) {
          setRules(nextRules);
          setCustomStatuses(nextStatuses);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load attendance settings.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void loadSettings();
    return () => {
      cancelled = true;
    };
  }, [schoolId]);

  function requestConfirmation(next: Confirmation) {
    setNotice(null);
    setError(null);
    setConfirmation(next);
  }

  async function confirmChange() {
    if (!confirmation || !schoolId) return;
    setIsSaving(true);
    setError(null);
    try {
      if (confirmation.kind === "rule") {
        await updateAttendanceStatusRule({
          schoolId,
          status: confirmation.status,
          behavior: confirmation.next,
        });
        setNotice(`${confirmation.status} counting behavior updated.`);
      } else {
        await updateAttendanceCustomStatus(confirmation.status.id, confirmation.values);
        setNotice(`${confirmation.status.label} updated.`);
      }
      setConfirmation(null);
      setEditingId(null);
      const [nextRules, nextStatuses] = await Promise.all([
        getAttendanceStatusRules(schoolId),
        getAttendanceCustomStatuses({ schoolId, includeInactive: true }),
      ]);
      setRules(nextRules);
      setCustomStatuses(nextStatuses);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save attendance settings.");
    } finally {
      setIsSaving(false);
    }
  }

  async function createStatus(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!schoolId || !label.trim()) return;
    setIsSaving(true);
    setError(null);
    try {
      await createAttendanceCustomStatus({ schoolId, label: label.trim(), behavior });
      setLabel("");
      setBehavior("INFORMATIONAL");
      setNotice("Custom attendance status created.");
      const [nextRules, nextStatuses] = await Promise.all([
        getAttendanceStatusRules(schoolId),
        getAttendanceCustomStatuses({ schoolId, includeInactive: true }),
      ]);
      setRules(nextRules);
      setCustomStatuses(nextStatuses);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to create custom status.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Attendance Settings" description="Configure statuses and how they contribute to attendance calculations." />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}
      <Notice tone="warning">
        Changing a counting behavior affects summaries for existing and future records. AttendanceRecord rows are not changed, but historical percentages may be recalculated using the new rule.
      </Notice>

      <Card>
        <CardContent className="pt-6">
          <Field htmlFor="attendance-settings-school" label="School">
            <Select id="attendance-settings-school" value={schoolId} onChange={(event) => setSchoolId(event.target.value)} disabled={isLoading}>
              <option value="">Select school</option>
              {schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
            </Select>
          </Field>
          {selectedSchool ? <p className="mt-2 text-sm text-slate-500">Configuring {selectedSchool.name}. Changes apply only to this school.</p> : null}
        </CardContent>
      </Card>

      {!schoolId && !isLoading ? <EmptyState title="No accessible school" description="Select a school to manage attendance settings." /> : null}
      {schoolId ? (
        <>
          <Card>
            <CardHeader><CardTitle>Built-in attendance statuses</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {builtInStatuses.map(({ status, label: statusLabel }) => {
                const rule = rules.find((item) => item.status === status);
                const currentBehavior = rule?.behavior ?? (status === "EXCUSED" ? "INFORMATIONAL" : status);
                return (
                  <div key={status} className="grid gap-3 rounded-xl border border-slate-200 p-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
                    <div><p className="font-medium text-slate-950">{statusLabel}</p><p className="text-xs text-slate-500">System status ({status})</p></div>
                    <Field htmlFor={`attendance-rule-${status}`} label="Counting behavior">
                      <Select id={`attendance-rule-${status}`} value={currentBehavior} disabled={isSaving} onChange={(event) => {
                        const next = event.target.value as AttendanceStatusCountBehavior;
                        if (next !== currentBehavior) requestConfirmation({ kind: "rule", status, previous: currentBehavior, next });
                      }}>
                        {behaviors.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                      </Select>
                    </Field>
                    <span className="text-xs text-slate-500">Built-in</span>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Custom attendance statuses</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <form className="grid gap-3 rounded-xl border border-slate-200 p-4 md:grid-cols-[1fr_1fr_auto]" onSubmit={createStatus}>
                <Field htmlFor="new-attendance-status-label" label="Status name"><Input id="new-attendance-status-label" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. Illness" /></Field>
                <Field htmlFor="new-attendance-status-behavior" label="Counting behavior"><Select id="new-attendance-status-behavior" value={behavior} onChange={(event) => setBehavior(event.target.value as AttendanceStatusCountBehavior)}>{behaviors.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</Select></Field>
                <Button type="submit" disabled={isSaving || !label.trim()}>Add Custom Status</Button>
              </form>
              {customStatuses.length === 0 ? <p className="text-sm text-slate-500">No custom statuses configured.</p> : customStatuses.map((status) => (
                <div key={status.id} className="rounded-xl border border-slate-200 p-4">
                  {editingId === status.id ? (
                    <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto] md:items-end">
                      <Field htmlFor={`edit-status-label-${status.id}`} label="Status name"><Input id={`edit-status-label-${status.id}`} value={editingLabel} onChange={(event) => setEditingLabel(event.target.value)} /></Field>
                      <Field htmlFor={`edit-status-behavior-${status.id}`} label="Counting behavior"><Select id={`edit-status-behavior-${status.id}`} value={editingBehavior} onChange={(event) => setEditingBehavior(event.target.value as AttendanceStatusCountBehavior)}>{behaviors.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</Select></Field>
                      <Button type="button" onClick={() => requestConfirmation({ kind: "custom", status, values: { label: editingLabel.trim(), behavior: editingBehavior } })} disabled={!editingLabel.trim() || isSaving}>Save</Button>
                      <Button type="button" variant="secondary" onClick={() => setEditingId(null)}>Cancel</Button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div><p className="font-medium text-slate-950">{status.label}</p><p className="text-sm text-slate-600">{behaviorLabel(status.behavior)} · {status.isActive ? "Active" : "Inactive"}</p></div>
                      <div className="flex gap-2"><Button type="button" variant="secondary" onClick={() => { setEditingId(status.id); setEditingLabel(status.label); setEditingBehavior(status.behavior); }}>Edit</Button><Button type="button" variant={status.isActive ? "danger" : "secondary"} onClick={() => requestConfirmation({ kind: "custom", status, values: { isActive: !status.isActive } })}>{status.isActive ? "Deactivate" : "Reactivate"}</Button></div>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      ) : null}

      <ConfirmDialog
        isOpen={Boolean(confirmation)}
        title={confirmation?.kind === "rule"
          ? "Confirm counting behavior change"
          : confirmation?.kind === "custom" && confirmation.values.isActive === false
            ? `Deactivate ${confirmation.status.label}?`
            : confirmation?.kind === "custom" && confirmation.values.isActive === true
              ? `Reactivate ${confirmation.status.label}?`
              : "Confirm custom status change"}
        description={confirmation?.kind === "rule"
          ? `${confirmation.status} will change from ${behaviorLabel(confirmation.previous)} to ${behaviorLabel(confirmation.next)}. This affects existing and future summaries; attendance records themselves remain unchanged.`
          : confirmation?.values.isActive === false
            ? `Teachers will no longer be able to select ${confirmation.status.label} for new attendance. Historical records using it remain readable and unchanged.`
            : confirmation?.values.isActive === true
              ? `${confirmation.status.label} will be available again for new attendance. Existing records remain unchanged.`
              : confirmation?.kind === "custom" && confirmation.values.behavior !== undefined
                ? `${confirmation.status.label} will change from ${behaviorLabel(confirmation.status.behavior)} to ${behaviorLabel(confirmation.values.behavior)}. Historical records remain unchanged, but summaries may be recalculated using the new behavior.`
                : `Changing the name also changes how this status is labeled when viewing existing attendance records. The referenced record IDs are not changed.`}
        confirmLabel={confirmation?.kind === "custom" && confirmation.values.isActive === false ? "Deactivate" : confirmation?.kind === "custom" && confirmation.values.isActive === true ? "Reactivate" : "Confirm Change"}
        confirmVariant={confirmation?.kind === "custom" && confirmation.values.isActive === false ? "danger" : "primary"}
        pendingLabel="Saving..."
        isPending={isSaving}
        onCancel={() => setConfirmation(null)}
        onConfirm={confirmChange}
      />
    </div>
  );
}
