"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { buttonClassName } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import {
  getReRegistrationWindowStatusForStudent,
  type ReRegistrationWindowStatusForStudent,
} from "@/lib/api/re-registration";
import { ParentReRegistrationForm } from "@/components/parent/re-registration-form";

export function ParentReRegistrationGate({ studentId }: { studentId: string }) {
  const [windowStatus, setWindowStatus] =
    useState<ReRegistrationWindowStatusForStudent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const status = await getReRegistrationWindowStatusForStudent(studentId);
        setWindowStatus(status);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load re-registration.",
        );
        setWindowStatus(null);
      } finally {
        setIsLoading(false);
      }
    }
    void load();
  }, [studentId]);

  const pageHeader = (
    <PageHeader
      title="Re-registration"
      description="Confirm your child's return for next year and update their information."
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
    />
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        {pageHeader}
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Loading re-registration...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        {pageHeader}
        <Notice tone="danger">{error}</Notice>
      </div>
    );
  }

  if (!windowStatus || windowStatus.status === "NOT_CONFIGURED") {
    return (
      <div className="space-y-6">
        {pageHeader}
        <EmptyState
          title="Re-registration is not currently open"
          description="There is no active re-registration window right now. Please check back later or contact the school office."
        />
      </div>
    );
  }

  if (windowStatus.status === "CLOSED") {
    if (windowStatus.existingSubmission) {
      return (
        <div className="space-y-6">
          {pageHeader}
          <Notice tone="info">
            This re-registration window has closed. You can review your
            submitted response below.
          </Notice>
          <ParentReRegistrationForm
            studentId={studentId}
            schoolYearId={windowStatus.schoolYearId}
            windowStatus={windowStatus}
          />
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {pageHeader}
        <EmptyState
          title="This re-registration window has closed"
          description="The re-registration window is no longer accepting submissions. Please contact the school office if you have questions."
        />
      </div>
    );
  }

  if (windowStatus.status === "UPCOMING") {
    const opensAtDate = windowStatus.window?.opensAt
      ? new Date(windowStatus.window.opensAt).toLocaleDateString("en-CA", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : null;

    if (windowStatus.existingSubmission) {
      return (
        <div className="space-y-6">
          {pageHeader}
          <Notice tone="info">
            This re-registration window has not opened yet. You can review your
            last submitted response below.
          </Notice>
          <ParentReRegistrationForm
            studentId={studentId}
            schoolYearId={windowStatus.schoolYearId}
            windowStatus={windowStatus}
          />
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {pageHeader}
        <EmptyState
          title={
            opensAtDate
              ? `Re-registration opens on ${opensAtDate}`
              : "Re-registration opening soon"
          }
          description="The re-registration window has not opened yet. You will be able to complete the form once it opens."
        />
      </div>
    );
  }

  // status === "OPEN"
  return (
    <div className="space-y-6">
      {pageHeader}
      <ParentReRegistrationForm
        studentId={studentId}
        schoolYearId={windowStatus.schoolYearId}
        windowStatus={windowStatus}
      />
    </div>
  );
}
