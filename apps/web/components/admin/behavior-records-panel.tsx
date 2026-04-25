"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import {
  listBehaviorRecordsForStudent,
  type BehaviorRecord,
} from "@/lib/api/behavior";
import { formatDateTimeLabel } from "@/lib/utils";

type BehaviorRecordsPanelProps = {
  studentId: string;
  canView: boolean;
};

function getIncidentLevelLabel(value: BehaviorRecord["incidentLevel"]) {
  return value === "MAJOR" ? "Major" : "Minor";
}

export function BehaviorRecordsPanel({
  studentId,
  canView,
}: BehaviorRecordsPanelProps) {
  const [records, setRecords] = useState<BehaviorRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recentRecords = useMemo(
    () =>
      [...records]
        .sort(
          (left, right) =>
            new Date(right.incidentAt).getTime() -
            new Date(left.incidentAt).getTime(),
        )
        .slice(0, 5),
    [records],
  );

  const openCount = useMemo(
    () => records.filter((record) => record.status === "OPEN").length,
    [records],
  );

  useEffect(() => {
    async function load() {
      if (!canView) {
        setRecords([]);
        setError(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await listBehaviorRecordsForStudent(studentId);
        setRecords(response);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load incident reports.",
        );
        setRecords([]);
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, [canView, studentId]);

  if (!canView) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Incident Reports</CardTitle>
          <CardDescription>
            Incident reporting is not available for your current role.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Incident Reports</CardTitle>
        <CardDescription>
          Student-level summary for quick context. Use the full incident
          workspace for filing, editing, filtering, and attachments.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <Notice tone="danger">{error}</Notice> : null}

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="neutral">{records.length} total</Badge>
          <Badge variant={openCount > 0 ? "warning" : "success"}>
            {openCount} open
          </Badge>
          <Link
            className={buttonClassName({ size: "sm", variant: "secondary" })}
            href={`/admin/behavior?studentId=${encodeURIComponent(studentId)}`}
          >
            Open Incident Workspace
          </Link>
        </div>

        {isLoading ? (
          <p className="text-sm text-slate-500">Loading incident reports...</p>
        ) : recentRecords.length === 0 ? (
          <EmptyState
            compact
            title="No incident reports"
            description="No incident records are currently linked to this student."
          />
        ) : (
          <div className="space-y-3">
            {recentRecords.map((record) => (
              <div
                className="rounded-xl border border-slate-200 bg-white p-4"
                key={record.id}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">
                    {record.title}
                  </p>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        record.incidentLevel === "MAJOR" ? "danger" : "warning"
                      }
                    >
                      {getIncidentLevelLabel(record.incidentLevel)}
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
                <p className="mt-1 text-xs text-slate-500">
                  {formatDateTimeLabel(record.incidentAt)} •{" "}
                  {record.categoryName}
                </p>
                <p className="mt-2 text-sm text-slate-700 line-clamp-2">
                  {record.description}
                </p>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end">
          <Link
            className={buttonClassName({ size: "sm", variant: "secondary" })}
            href={`/admin/behavior?studentId=${encodeURIComponent(studentId)}`}
          >
            View All Incident Reports
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
