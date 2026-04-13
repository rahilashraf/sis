"use client";

import { useParams } from "next/navigation";
import { ParentFormDetail } from "@/components/parent/parent-form-detail";

export default function ParentFormDetailPage() {
  const params = useParams<{ id: string }>();

  return <ParentFormDetail formId={params.id} />;
}
