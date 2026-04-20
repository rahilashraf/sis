"use client";

import { useParams } from "next/navigation";
import { ParentStudentLibrary } from "@/components/parent/parent-student-library";

export default function ParentStudentLibraryPage() {
  const params = useParams<{ id: string }>();

  return <ParentStudentLibrary studentId={params.id} />;
}
