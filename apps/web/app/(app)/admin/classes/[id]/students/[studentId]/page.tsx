"use client";

import { StudentInClassWorkspace } from "@/components/classes/student-in-class-workspace";
import { useParams } from "next/navigation";

export default function AdminStudentInClassPage() {
  const params = useParams<{ id: string; studentId: string }>();

  return (
    <StudentInClassWorkspace
      classId={params.id}
      mode="admin"
      studentId={params.studentId}
    />
  );
}
