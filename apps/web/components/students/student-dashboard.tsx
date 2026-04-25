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
import { PageHeader } from "@/components/ui/page-header";
import {
  getAttendanceStudentSummary,
  type AttendanceStudentSummary,
} from "@/lib/api/attendance";
import {
  getStudentAccountSummary,
  type StudentAccountSummary,
} from "@/lib/api/billing";
import { listClassesForStudent, type SchoolClass } from "@/lib/api/classes";
import { listNotifications, type Notification } from "@/lib/api/notifications";
import {
  listMyTimetableBlocks,
  type TimetableBlock,
  type TimetableDayOfWeek,
} from "@/lib/api/timetable";
import { useAuth } from "@/lib/auth/auth-context";
import {
  getDefaultSchoolContextId,
  getPrimarySchoolName,
} from "@/lib/auth/school-membership";
import { dateOnlyFromDate } from "@/lib/date";

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

function formatCurrency(value: string | number) {
  const amount = typeof value === "number" ? value : Number(value);
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatPercent(value: number | null | undefined) {
  if (typeof value !== "number") {
    return "—";
  }

  return `${value}%`;
}

function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function toISODate(value: Date) {
  return dateOnlyFromDate(value);
}

function getCurrentTimeLabel() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-1 pt-6">
        <p className="text-sm font-medium text-slate-600">{label}</p>
        <p className="text-2xl font-semibold tracking-tight text-slate-950">
          {value}
        </p>
        <p className="text-sm text-slate-500">{hint}</p>
      </CardContent>
    </Card>
  );
}

function DashboardPill({ children }: { children: string }) {
  return (
    <Badge
      className="shrink-0 whitespace-nowrap px-2 py-0.5 text-[11px] leading-4"
      variant="neutral"
    >
      {children}
    </Badge>
  );
}

function ShortcutCard({
  title,
  description,
  href,
  badge,
  disabled = false,
}: {
  title: string;
  description: string;
  href?: string;
  badge?: string;
  disabled?: boolean;
}) {
  const className =
    "block h-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-950/10";

  if (disabled || !href) {
    return (
      <div className={`${className} cursor-not-allowed opacity-75`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-slate-900">{title}</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {description}
            </p>
          </div>
          {badge ? <DashboardPill>{badge}</DashboardPill> : null}
        </div>
      </div>
    );
  }

  return (
    <Link className={className} href={href}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-slate-900">{title}</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
        </div>
        {badge ? <DashboardPill>{badge}</DashboardPill> : null}
      </div>
    </Link>
  );
}

function PriorityCard({
  title,
  message,
  badge,
}: {
  title: string;
  message: string;
  badge: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-slate-600">Today’s priority</p>
          <DashboardPill>{badge}</DashboardPill>
        </div>
        <div>
          <p className="text-lg font-semibold tracking-tight text-slate-950">
            {title}
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-500">{message}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function StudentDashboard() {
  const { session } = useAuth();
  const user = session?.user ?? null;
  const [blocks, setBlocks] = useState<TimetableBlock[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [attendanceSummary, setAttendanceSummary] =
    useState<AttendanceStudentSummary | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [accountSummary, setAccountSummary] =
    useState<StudentAccountSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [partialWarning, setPartialWarning] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!user?.id) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);
      setPartialWarning(null);

      const today = new Date();
      const startDate = new Date(today);
      startDate.setDate(today.getDate() - 30);
      const schoolId = getDefaultSchoolContextId(user);

      const requests = [
        {
          label: "timetable",
          execute: () => listMyTimetableBlocks(),
        },
        {
          label: "classes",
          execute: () => listClassesForStudent(user.id),
        },
        {
          label: "attendance",
          execute: () =>
            getAttendanceStudentSummary({
              studentId: user.id,
              startDate: toISODate(startDate),
              endDate: toISODate(today),
            }),
        },
        {
          label: "notifications",
          execute: () => listNotifications({ limit: 5 }),
        },
        {
          label: "billing",
          execute: () =>
            schoolId
              ? getStudentAccountSummary(user.id, { schoolId })
              : Promise.resolve(null),
        },
      ] as const;

      const [
        blocksResult,
        classesResult,
        attendanceResult,
        notificationsResult,
        billingResult,
      ] = (await Promise.allSettled(
        requests.map((request) => request.execute()),
      )) as [
        PromiseSettledResult<TimetableBlock[]>,
        PromiseSettledResult<SchoolClass[]>,
        PromiseSettledResult<AttendanceStudentSummary>,
        PromiseSettledResult<Notification[]>,
        PromiseSettledResult<StudentAccountSummary | null>,
      ];

      const results = [
        blocksResult,
        classesResult,
        attendanceResult,
        notificationsResult,
        billingResult,
      ] as const;
      const failedLabels = results.flatMap((result, index) =>
        result.status === "rejected" ? [requests[index].label] : [],
      );

      setBlocks(blocksResult.status === "fulfilled" ? blocksResult.value : []);
      setClasses(
        classesResult.status === "fulfilled" ? classesResult.value : [],
      );
      setAttendanceSummary(
        attendanceResult.status === "fulfilled" ? attendanceResult.value : null,
      );
      setNotifications(
        notificationsResult.status === "fulfilled"
          ? notificationsResult.value
          : [],
      );
      setAccountSummary(
        billingResult.status === "fulfilled" ? billingResult.value : null,
      );

      if (failedLabels.length === requests.length) {
        setError("Unable to load your dashboard right now.");
      } else if (failedLabels.length > 0) {
        setPartialWarning(
          `Some sections are unavailable right now: ${failedLabels.join(", ")}.`,
        );
      }

      setIsLoading(false);
    }

    void load();
  }, [user]);

  const schoolName = getPrimarySchoolName(user);
  const unreadNotifications = notifications.filter(
    (notification) => !notification.isRead,
  ).length;
  const todayKey = daysOfWeek[(new Date().getDay() + 6) % 7];
  const currentTime = getCurrentTimeLabel();

  const sortedBlocks = useMemo(
    () => [...blocks].sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [blocks],
  );

  const todayBlocks = useMemo(
    () => sortedBlocks.filter((block) => block.dayOfWeek === todayKey),
    [sortedBlocks, todayKey],
  );

  const nextBlockToday =
    todayBlocks.find((block) => block.endTime >= currentTime) ?? null;

  const nextScheduledGroup = (() => {
    for (let offset = 1; offset <= daysOfWeek.length; offset += 1) {
      const day =
        daysOfWeek[(daysOfWeek.indexOf(todayKey) + offset) % daysOfWeek.length];
      const dayBlocks = sortedBlocks.filter((block) => block.dayOfWeek === day);
      if (dayBlocks.length > 0) {
        return { day, blocks: dayBlocks };
      }
    }

    return null;
  })();

  const currentClasses = useMemo(
    () =>
      [...classes].sort((a, b) => {
        if (a.isHomeroom === b.isHomeroom) {
          return a.name.localeCompare(b.name);
        }

        return a.isHomeroom ? -1 : 1;
      }),
    [classes],
  );

  const outstandingBalance = Number(accountSummary?.totalOutstanding ?? 0);
  const overdueBalance = Number(accountSummary?.totalOverdue ?? 0);
  const priorityCharge =
    accountSummary?.overdueCharges[0] ??
    accountSummary?.outstandingCharges[0] ??
    null;

  const priority = (() => {
    if (unreadNotifications > 0) {
      return {
        badge: "Action needed",
        title:
          unreadNotifications === 1
            ? "1 unread notification"
            : `${unreadNotifications} unread notifications`,
        message:
          "Check your latest updates so you don’t miss reminders or announcements.",
      };
    }

    if (nextBlockToday) {
      return {
        badge: "Next class",
        title:
          nextBlockToday.classes
            .map((schoolClass) => schoolClass.name)
            .join(", ") || "Scheduled class",
        message: `${nextBlockToday.startTime} - ${nextBlockToday.endTime}${nextBlockToday.roomLabel ? ` • Room ${nextBlockToday.roomLabel}` : ""}`,
      };
    }

    if (priorityCharge) {
      return {
        badge: "Upcoming due item",
        title: priorityCharge.title,
        message: `${formatCurrency(priorityCharge.amountDue)} due${priorityCharge.dueDate ? ` by ${formatShortDate(priorityCharge.dueDate)}` : " soon"}.`,
      };
    }

    return {
      badge: "All clear",
      title: "No tasks today",
      message: "You’re caught up for now. Check back later for new updates.",
    };
  })();

  if (!user) {
    return null;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Student Dashboard"
        description={`Hi ${user.firstName} — here’s a calm, clear view of what matters most today, from your schedule to new updates and school essentials.`}
        actions={
          <>
            <Link
              className={buttonClassName({ variant: "secondary" })}
              href="/student/timetable"
            >
              Open timetable
            </Link>
            <Link
              className={buttonClassName({ variant: "secondary" })}
              href="/notifications"
            >
              View notifications
            </Link>
          </>
        }
        meta={
          <>
            {schoolName ? <Badge variant="neutral">{schoolName}</Badge> : null}
            <Badge variant="neutral">{dayLabel(todayKey)}</Badge>
            <Badge variant="neutral">
              {unreadNotifications} unread update
              {unreadNotifications === 1 ? "" : "s"}
            </Badge>
          </>
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {partialWarning ? <Notice tone="info">{partialWarning}</Notice> : null}
      {!error && overdueBalance > 0 ? (
        <Notice tone="warning" title="Outstanding balance requires attention">
          You currently have {formatCurrency(accountSummary?.totalOverdue ?? 0)}{" "}
          overdue and {formatCurrency(accountSummary?.totalOutstanding ?? 0)}{" "}
          outstanding.
        </Notice>
      ) : null}

      {isLoading ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">
              Loading your student dashboard...
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <SummaryCard
              label="Today’s timetable"
              value={String(todayBlocks.length)}
              hint={
                todayBlocks.length === 0
                  ? "No timetable scheduled today"
                  : todayBlocks.length === 1
                    ? "1 scheduled block today"
                    : `${todayBlocks.length} scheduled blocks today`
              }
            />
            <SummaryCard
              label="Current classes"
              value={String(currentClasses.length)}
              hint={
                currentClasses.length === 0
                  ? "No classes assigned yet"
                  : currentClasses.some((schoolClass) => schoolClass.isHomeroom)
                    ? "Includes your homeroom"
                    : "Active enrolled courses"
              }
            />
            <SummaryCard
              label="Attendance rate"
              value={formatPercent(attendanceSummary?.attendancePercentage)}
              hint={
                attendanceSummary
                  ? "Based on the last 30 days"
                  : "No attendance data yet"
              }
            />
            <SummaryCard
              label="Outstanding balance"
              value={formatCurrency(accountSummary?.totalOutstanding ?? 0)}
              hint={
                outstandingBalance > 0
                  ? `${formatCurrency(accountSummary?.totalOverdue ?? 0)} overdue`
                  : "No charges due"
              }
            />
            <PriorityCard
              badge={priority.badge}
              message={priority.message}
              title={priority.title}
            />
          </div>

          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-slate-950">
                Quick access
              </h2>
              <p className="text-sm text-slate-600">
                Fast links to the student tools already available to you.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <ShortcutCard
                title="Timetable"
                description="See your weekly class schedule and teacher assignments."
                href="/student/timetable"
                badge={
                  todayBlocks.length > 0
                    ? `${todayBlocks.length} today`
                    : "Weekly view"
                }
              />
              <ShortcutCard
                title="Notifications"
                description="Catch up on announcements, reminders, and school updates."
                href="/notifications"
                badge={
                  unreadNotifications > 0
                    ? `${unreadNotifications} unread`
                    : "Up to date"
                }
              />
              <ShortcutCard
                title="Library"
                description="Browse the catalogue and place hold requests for unavailable books."
                href="/student/library"
                badge="Self-service"
              />
            </div>
          </section>

          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <Card>
              <CardHeader>
                <CardTitle>Today’s schedule</CardTitle>
                <CardDescription>
                  {todayBlocks.length > 0
                    ? nextBlockToday
                      ? `Next up: ${nextBlockToday.startTime} - ${nextBlockToday.endTime}`
                      : "Your classes for today are complete."
                    : nextScheduledGroup
                      ? `No timetable scheduled today. Next scheduled day: ${dayLabel(nextScheduledGroup.day)}.`
                      : "No timetable scheduled today."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {todayBlocks.length > 0 ? (
                  todayBlocks.map((block) => {
                    const isNext = nextBlockToday?.id === block.id;
                    return (
                      <div
                        className={`rounded-xl border p-4 ${isNext ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-slate-50"}`}
                        key={block.id}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="neutral">
                            {block.startTime} - {block.endTime}
                          </Badge>
                          {block.roomLabel ? (
                            <Badge variant="neutral">
                              Room {block.roomLabel}
                            </Badge>
                          ) : null}
                          {isNext ? (
                            <Badge variant="neutral">Next</Badge>
                          ) : null}
                        </div>
                        <div className="mt-3 space-y-1">
                          <p
                            className={`text-base font-semibold ${isNext ? "text-white" : "text-slate-950"}`}
                          >
                            {block.classes
                              .map((schoolClass) => schoolClass.name)
                              .join(", ") || "Scheduled class"}
                          </p>
                          <p
                            className={`text-sm ${isNext ? "text-slate-200" : "text-slate-600"}`}
                          >
                            {block.teacher.firstName} {block.teacher.lastName}
                            {block.notes ? ` • ${block.notes}` : ""}
                          </p>
                        </div>
                      </div>
                    );
                  })
                ) : nextScheduledGroup ? (
                  <div className="space-y-3">
                    {nextScheduledGroup.blocks.slice(0, 3).map((block) => (
                      <div
                        className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                        key={block.id}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="neutral">
                            {dayLabel(nextScheduledGroup.day)}
                          </Badge>
                          <Badge variant="neutral">
                            {block.startTime} - {block.endTime}
                          </Badge>
                        </div>
                        <p className="mt-3 text-base font-semibold text-slate-950">
                          {block.classes
                            .map((schoolClass) => schoolClass.name)
                            .join(", ") || "Scheduled class"}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          {block.teacher.firstName} {block.teacher.lastName}
                          {block.roomLabel ? ` • Room ${block.roomLabel}` : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    compact
                    title="No timetable scheduled today"
                    description="Your schedule will appear here once classes are assigned and timetable blocks are published."
                    action={
                      <Link
                        className={buttonClassName({
                          size: "sm",
                          variant: "secondary",
                        })}
                        href="/student/timetable"
                      >
                        Open full timetable
                      </Link>
                    }
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent notifications</CardTitle>
                <CardDescription>
                  Announcements and reminders delivered to your account.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {notifications.length === 0 ? (
                  <EmptyState
                    compact
                    title="No recent notifications"
                    description="You’re all caught up right now."
                  />
                ) : (
                  <div className="space-y-3">
                    {notifications.map((notification) => (
                      <div
                        className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                        key={notification.id}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-950">
                              {notification.title}
                            </p>
                            <p className="mt-1 text-sm leading-6 text-slate-600">
                              {notification.message}
                            </p>
                          </div>
                          <Badge variant="neutral">
                            {notification.isRead ? "Read" : "Unread"}
                          </Badge>
                        </div>
                        <p className="mt-3 text-xs text-slate-500">
                          {formatShortDate(notification.createdAt)}
                        </p>
                      </div>
                    ))}
                    <Link
                      className={buttonClassName({
                        size: "sm",
                        variant: "secondary",
                      })}
                      href="/notifications"
                    >
                      View all notifications
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr_0.8fr]">
            <Card>
              <CardHeader>
                <CardTitle>Current classes</CardTitle>
                <CardDescription>
                  Your active classes and learning groups this term.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {currentClasses.length === 0 ? (
                  <EmptyState
                    compact
                    title="No classes assigned yet"
                    description="Your class list will appear here once you’re enrolled and your schedule is ready."
                  />
                ) : (
                  <div className="space-y-3">
                    {currentClasses.slice(0, 6).map((schoolClass) => (
                      <div
                        className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                        key={schoolClass.id}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-slate-950">
                            {schoolClass.name}
                          </p>
                          {schoolClass.isHomeroom ? (
                            <Badge variant="neutral">Homeroom</Badge>
                          ) : null}
                          {schoolClass.subject ? (
                            <Badge variant="neutral">
                              {schoolClass.subject}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="mt-2 text-sm text-slate-600">
                          {schoolClass.schoolYear.name}
                          {schoolClass.teachers[0]
                            ? ` • ${schoolClass.teachers[0].teacher.firstName} ${schoolClass.teachers[0].teacher.lastName}`
                            : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Forms</CardTitle>
                <CardDescription>
                  Outstanding student paperwork and acknowledgements.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <EmptyState
                  compact
                  title="Forms coming soon"
                  description="Student self-service forms are not available in the portal yet. Watch notifications for anything requiring action in the meantime."
                  action={
                    <Link
                      className={buttonClassName({
                        size: "sm",
                        variant: "secondary",
                      })}
                      href="/notifications"
                    >
                      Check notifications
                    </Link>
                  }
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Library loans</CardTitle>
                <CardDescription>
                  Browse books and place hold requests from your student library
                  page.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <EmptyState
                  compact
                  title="Open student library"
                  description="View the catalogue and track your hold requests."
                  action={
                    <Link
                      className={buttonClassName({
                        size: "sm",
                        variant: "secondary",
                      })}
                      href="/student/library"
                    >
                      Open library
                    </Link>
                  }
                />
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
