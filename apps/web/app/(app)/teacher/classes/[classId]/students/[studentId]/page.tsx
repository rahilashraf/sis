"use client";

import { StudentInClassWorkspace } from "@/components/classes/student-in-class-workspace";
import { useParams } from "next/navigation";

export default function TeacherStudentInClassPage() {
  const params = useParams<{ classId: string; studentId: string }>();

  return (
    <StudentInClassWorkspace
      classId={params.classId}
      mode="teacher"
      studentId={params.studentId}
    />
  );
}
