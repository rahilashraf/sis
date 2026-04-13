"use client";

import { useParams } from "next/navigation";
import { ParentStudentDetail } from "@/components/parent/parent-student-detail";

export default function ParentStudentDetailPage() {
  const params = useParams<{ id: string }>();

  return <ParentStudentDetail studentId={params.id} />;
}
