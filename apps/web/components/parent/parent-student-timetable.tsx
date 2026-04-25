"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { getStudentById, type StudentProfile } from "@/lib/api/students";
import {
  listTimetableBlocksByStudent,
  type TimetableBlock,
  type TimetableDayOfWeek,
} from "@/lib/api/timetable";

const daysOfWeek: TimetableDayOfWeek[] = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];

function dayLabel(day: TimetableDayOfWeek) {
  return day.charAt(0) + day.slice(1).toLowerCase();
}

export function ParentStudentTimetable({ studentId }: { studentId: string }) {
  const [student, setStudent] = useState<StudentProfile | null>(null);
  const [blocks, setBlocks] = useState<TimetableBlock[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setError(null);

      const [studentResult, timetableResult] = await Promise.allSettled([
        getStudentById(studentId),
        listTimetableBlocksByStudent(studentId),
      ]);

      if (studentResult.status === "fulfilled") {
        setStudent(studentResult.value);
      } else {
        setStudent(null);
      }

      if (timetableResult.status === "fulfilled") {
        setBlocks(timetableResult.value);
      } else {
        setBlocks([]);
      }

      if (
        studentResult.status === "rejected" ||
        timetableResult.status === "rejected"
      ) {
        const studentMessage =
          studentResult.status === "rejected" &&
          studentResult.reason instanceof Error
            ? studentResult.reason.message
            : null;
        const timetableMessage =
          timetableResult.status === "rejected" &&
          timetableResult.reason instanceof Error
            ? timetableResult.reason.message
            : null;

        setError(
          studentMessage ??
            timetableMessage ??
            "Unable to load student timetable.",
        );
      }

      setIsLoading(false);
    }

    void load();
  }, [studentId]);

  const groupedBlocks = useMemo(() => {
    const sorted = [...blocks].sort((a, b) => {
      const dayOrder =
        daysOfWeek.indexOf(a.dayOfWeek) - daysOfWeek.indexOf(b.dayOfWeek);
      if (dayOrder !== 0) {
        return dayOrder;
      }

      return a.startTime.localeCompare(b.startTime);
    });

    const groups = new Map<TimetableDayOfWeek, TimetableBlock[]>();

    for (const day of daysOfWeek) {
      groups.set(day, []);
    }

    for (const block of sorted) {
      groups.get(block.dayOfWeek)?.push(block);
    }

    return daysOfWeek
      .map((day) => ({ day, blocks: groups.get(day) ?? [] }))
      .filter((entry) => entry.blocks.length > 0);
  }, [blocks]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Timetable"
        description="Read-only timetable view for the selected student."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              className={buttonClassName({ variant: "secondary" })}
              href="/parent"
            >
              Back to my students
            </Link>
            <Link
              className={buttonClassName({ variant: "secondary" })}
              href={`/parent/students/${encodeURIComponent(studentId)}`}
            >
              Student profile
            </Link>
          </div>
        }
        meta={
          student ? (
            <Badge variant="neutral">
              {student.firstName} {student.lastName}
            </Badge>
          ) : null
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}

      {isLoading ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">
              Loading student timetable...
            </p>
          </CardContent>
        </Card>
      ) : groupedBlocks.length === 0 ? (
        <EmptyState
          title="No timetable blocks"
          description="No active timetable blocks are currently available for this student."
        />
      ) : (
        <div className="space-y-6">
          {groupedBlocks.map((group) => (
            <Card key={group.day}>
              <CardHeader>
                <CardTitle>{dayLabel(group.day)}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {group.blocks.map((block) => (
                    <div
                      key={block.id}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-3"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="neutral">
                          {block.startTime} - {block.endTime}
                        </Badge>
                        {block.roomLabel ? (
                          <Badge variant="neutral">
                            Room: {block.roomLabel}
                          </Badge>
                        ) : null}
                        <Badge variant="neutral">
                          {block.teacher.firstName} {block.teacher.lastName}
                        </Badge>
                      </div>

                      {block.classes.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {block.classes.map((schoolClass) => (
                            <Badge key={schoolClass.id} variant="neutral">
                              {schoolClass.name}
                            </Badge>
                          ))}
                        </div>
                      ) : null}

                      {block.notes ? (
                        <p className="mt-3 text-sm text-slate-700">
                          {block.notes}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
