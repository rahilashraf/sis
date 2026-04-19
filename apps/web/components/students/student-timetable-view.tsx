"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import {
  listMyTimetableBlocks,
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

export function StudentTimetableView() {
  const [blocks, setBlocks] = useState<TimetableBlock[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await listMyTimetableBlocks();
        setBlocks(response);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load your timetable.";
        setError(message);
      } finally {
        setIsLoading(false);
      }
    }

    load();
  }, []);

  const groupedBlocks = useMemo(() => {
    const sorted = [...blocks].sort((a, b) => {
      const dayOrder = daysOfWeek.indexOf(a.dayOfWeek) - daysOfWeek.indexOf(b.dayOfWeek);
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
        title="My Timetable"
        description="Your timetable blocks from your enrolled classes."
      />

      {error && <Notice tone="danger">{error}</Notice>}

      {isLoading ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-slate-600">Loading your timetable...</p>
          </CardContent>
        </Card>
      ) : groupedBlocks.length === 0 ? (
        <EmptyState
          title="No timetable blocks"
          description="No active timetable blocks are currently available for your classes."
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
                      className="rounded-lg border border-slate-200 bg-white p-4"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="neutral">
                          {block.startTime} - {block.endTime}
                        </Badge>
                        {block.roomLabel ? (
                          <Badge variant="neutral">Room: {block.roomLabel}</Badge>
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
                        <p className="mt-3 text-sm text-slate-700">{block.notes}</p>
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
