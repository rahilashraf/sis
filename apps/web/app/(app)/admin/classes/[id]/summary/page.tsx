"use client";

import { ClassSummaryWorkspace } from "@/components/classes/class-summary-workspace";
import { useParams } from "next/navigation";

export default function AdminClassSummaryPage() {
  const params = useParams<{ id: string }>();

  return <ClassSummaryWorkspace mode="admin" classId={params.id} />;
}
