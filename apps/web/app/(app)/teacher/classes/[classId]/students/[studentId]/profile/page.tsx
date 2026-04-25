"use client";

import { useParams } from "next/navigation";
import { TeacherStudentProfile } from "@/components/teacher/teacher-student-profile";

export default function TeacherStudentProfilePage() {
  const params = useParams<{ classId: string; studentId: string }>();

  return (
    <TeacherStudentProfile
      classId={params.classId}
      studentId={params.studentId}
    />
  );
}
