"use client";

import { ClassSummaryWorkspace } from "@/components/classes/class-summary-workspace";
import { useParams } from "next/navigation";

export default function TeacherClassSummaryPage() {
  const params = useParams<{ classId: string }>();

  return <ClassSummaryWorkspace mode="teacher" classId={params.classId} />;
}
