"use client";

import { useParams } from "next/navigation";
import { ParentStudentTimetable } from "@/components/parent/parent-student-timetable";

export default function ParentStudentTimetablePage() {
  const params = useParams<{ id: string }>();

  return <ParentStudentTimetable studentId={params.id} />;
}
