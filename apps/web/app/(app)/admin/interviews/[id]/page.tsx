"use client";

import { useParams } from "next/navigation";
import { InterviewEventForm } from "@/components/admin/interview-event-form";
import { InterviewEventSlotsManager } from "@/components/admin/interview-event-slots-manager";

export default function AdminInterviewDetailPage() {
  const params = useParams<{ id: string }>();

  return (
    <div className="space-y-8">
      <InterviewEventForm eventId={params.id} />
      <InterviewEventSlotsManager eventId={params.id} />
    </div>
  );
}
