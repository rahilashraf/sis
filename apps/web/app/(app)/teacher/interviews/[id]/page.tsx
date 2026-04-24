"use client";

import { useParams } from "next/navigation";
import { TeacherInterviewsOverview } from "@/components/teacher/teacher-interviews-overview";

export default function TeacherInterviewEventPage() {
  const params = useParams<{ id: string }>();

  return <TeacherInterviewsOverview eventId={params.id} />;
}
