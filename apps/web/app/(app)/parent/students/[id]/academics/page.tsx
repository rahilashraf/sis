"use client";

import { useParams } from "next/navigation";
import { ParentStudentAcademics } from "@/components/parent/parent-student-academics";

export default function ParentStudentAcademicsPage() {
  const params = useParams<{ id: string }>();

  return <ParentStudentAcademics studentId={params.id} />;
}

