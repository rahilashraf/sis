"use client";

import { useParams } from "next/navigation";
import { ParentClassDetail } from "@/components/parent/parent-class-detail";

export default function ParentStudentClassDetailPage() {
  const params = useParams<{ id: string; classId: string }>();

  return <ParentClassDetail classId={params.classId} studentId={params.id} />;
}
