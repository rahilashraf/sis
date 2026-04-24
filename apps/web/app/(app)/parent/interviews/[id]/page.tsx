"use client";

import { useParams } from "next/navigation";
import { ParentInterviewEventDetail } from "@/components/parent/parent-interview-event-detail";

export default function ParentInterviewEventDetailPage() {
  const params = useParams<{ id: string }>();

  return <ParentInterviewEventDetail eventId={params.id} />;
}
