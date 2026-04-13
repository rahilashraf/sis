"use client";

import { useParams } from "next/navigation";
import { ClassDetail } from "@/components/admin/class-detail";

export default function AdminClassDetailPage() {
  const params = useParams<{ id: string }>();

  return <ClassDetail classId={params.id} />;
}
